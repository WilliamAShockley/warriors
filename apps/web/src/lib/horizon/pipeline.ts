import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { emitMissionEvent, setMissionStatus, type MissionActor } from './events'
import { draftForMembership } from './drafting'
import { classifyReply } from './classify'
import { getEmailAdapter } from './email'
import { parseDrafts, parseSequence, effectiveBody, type Draft } from './types'
import { getScope } from './scope'

const DRAFT_BATCH_SIZE = Number(process.env.HORIZON_DRAFT_BATCH || 5)
const DRAFT_SAMPLE_SIZE = 10
const CLAIM_TIMEOUT_MS = Number(process.env.HORIZON_CLAIM_TIMEOUT_MINUTES || 60) * 60_000
const PLACED_TIMEOUT_MS = Number(process.env.HORIZON_PLACED_TIMEOUT_HOURS || 24) * 3_600_000

// Terminal membership states for mission completion purposes.
const TERMINAL_STATES = ['sent', 'replied', 'closed', 'excluded']

async function missionForCampaign(campaignId: string) {
  return db.mission.findFirst({ where: { campaignId }, orderBy: { createdAt: 'asc' } })
}

/**
 * The release gate, enforced at every send/placement path. Sends are
 * architecturally impossible without an approved release row in the DB.
 */
export async function requireRelease(missionId: string): Promise<void> {
  const release = await db.approval.findFirst({
    where: { missionId, kind: 'release', status: 'approved' },
  })
  if (!release) throw new Error(`mission ${missionId}: no approved release — sends are blocked`)
}

export async function hasRelease(missionId: string): Promise<boolean> {
  return !!(await db.approval.findFirst({ where: { missionId, kind: 'release', status: 'approved' } }))
}

// ── LinkedIn channel pause (set on runner checkpoint) ─────────────

const LI_PAUSE_PREFIX = 'horizon.linkedinPaused.'

export async function isLinkedInPaused(missionId: string): Promise<boolean> {
  const row = await db.setting.findUnique({ where: { key: LI_PAUSE_PREFIX + missionId } })
  return row?.value === 'true'
}

export async function setLinkedInPaused(missionId: string, paused: boolean) {
  await db.setting.upsert({
    where: { key: LI_PAUSE_PREFIX + missionId },
    create: { key: LI_PAUSE_PREFIX + missionId, value: String(paused) },
    update: { value: String(paused) },
  })
}

// ── Approval resolution effects ───────────────────────────────────

/**
 * Called by the approval-queue route after it flips an Approval row.
 * Applies the operator's edits and advances the campaign when the stage's
 * gates are all satisfied. The chat agent has no path into this function.
 */
export async function applyApprovalResolution(
  approvalId: string,
  resolution: {
    status: 'approved' | 'rejected'
    // message-strategy edits
    messageStrategy?: string
    sequence?: unknown
    // target-list selection
    includedMembershipIds?: string[]
    // draft-batch edits
    draftEdits?: Array<{ membershipId: string; touchIndex: number; body?: string; subject?: string }>
    resolvedBy?: string
  }
) {
  const approval = await db.approval.findUnique({ where: { id: approvalId }, include: { mission: true } })
  if (!approval) throw new Error('approval not found')
  if (approval.status !== 'pending') throw new Error('approval already resolved')
  const mission = approval.mission
  const campaignId = mission.campaignId

  await db.approval.update({
    where: { id: approvalId },
    data: { status: resolution.status, resolvedBy: resolution.resolvedBy ?? 'operator', resolvedAt: new Date() },
  })
  await emitMissionEvent(mission.id, 'approval-resolved', { kind: approval.kind, status: resolution.status }, 'user')

  if (resolution.status === 'rejected') {
    await setMissionStatus(mission.id, 'paused', 'user', `${approval.kind} rejected`)
    return
  }
  if (!campaignId) return

  if (approval.kind === 'message-strategy') {
    await db.campaign.update({
      where: { id: campaignId },
      data: {
        messageStrategy: resolution.messageStrategy ?? undefined,
        sequence: (resolution.sequence as Prisma.InputJsonValue) ?? undefined,
      },
    })
  }

  if (approval.kind === 'target-list' && resolution.includedMembershipIds) {
    const payload = (approval.payload ?? {}) as { membershipIds?: string[] }
    const all = payload.membershipIds ?? []
    const included = new Set(resolution.includedMembershipIds)
    const excludedIds = all.filter((id) => !included.has(id))
    if (excludedIds.length) {
      await db.campaignMembership.updateMany({
        where: { id: { in: excludedIds } },
        data: { state: 'excluded', outcome: 'operator-excluded' },
      })
    }
  }

  if (approval.kind === 'draft-batch') {
    // Apply edit-in-place changes from the sample review.
    for (const edit of resolution.draftEdits ?? []) {
      const m = await db.campaignMembership.findUnique({ where: { id: edit.membershipId } })
      if (!m) continue
      const drafts = parseDrafts(m.drafts)
      const d = drafts.find((x) => x.touchIndex === edit.touchIndex)
      if (d) {
        if (edit.body !== undefined) d.editedBody = edit.body
        if (edit.subject !== undefined) d.subject = edit.subject
      }
      await db.campaignMembership.update({
        where: { id: m.id },
        data: { drafts: drafts as unknown as Prisma.InputJsonValue },
      })
    }
    // Approving the draft batch creates the release approval — the row every
    // send path checks for. This is the moment sends become possible.
    await db.approval.create({
      data: {
        missionId: mission.id, kind: 'release',
        payload: { grantedFrom: approvalId } as Prisma.InputJsonValue,
        status: 'approved', resolvedBy: resolution.resolvedBy ?? 'operator', resolvedAt: new Date(),
      },
    })
    await emitMissionEvent(mission.id, 'approval-resolved', { kind: 'release', status: 'approved' }, 'user')
    await releaseCampaign(mission.id, campaignId)
    return
  }

  // Strategy + list both approved → drafting begins (advance job does the work).
  const strategyOk = await db.approval.findFirst({ where: { missionId: mission.id, kind: 'message-strategy', status: 'approved' } })
  const listOk = await db.approval.findFirst({ where: { missionId: mission.id, kind: 'target-list', status: 'approved' } })
  if (strategyOk && listOk) {
    await db.campaign.update({ where: { id: campaignId }, data: { status: 'drafting' } })
    await setMissionStatus(mission.id, 'running', 'user', 'gates cleared — drafting')
    await emitMissionEvent(mission.id, 'progress', { stage: 'drafting', note: 'strategy + list approved' })
  } else if (approval.kind === 'message-strategy') {
    await db.campaign.update({ where: { id: campaignId }, data: { status: 'awaiting-list-approval' } })
  }
}

/** After release: schedule every approved member's first touch. */
async function releaseCampaign(missionId: string, campaignId: string) {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) return
  const sequence = parseSequence(campaign.sequence)
  const firstDelay = (sequence[0]?.delayDays ?? 0) * 86400_000

  await db.campaignMembership.updateMany({
    where: { campaignId, state: 'drafted' },
    data: { state: 'queued', currentTouchIndex: 0, nextActionAt: new Date(Date.now() + firstDelay) },
  })
  await db.campaign.update({ where: { id: campaignId }, data: { status: 'running' } })
  await setMissionStatus(missionId, 'running', 'user', 'released')
  await emitMissionEvent(missionId, 'progress', { stage: 'released', note: 'sends may now begin' })
}

// ── The advance job ───────────────────────────────────────────────

/**
 * Single scheduled worker: stateless, idempotent, resumable. Reads current
 * state, advances each due item one step with guarded transitions, writes
 * results, exits. Running twice never double-drafts or double-sends: drafting
 * claims members via a state flip, and touch-queuing uses updateMany with the
 * previous state as a guard.
 */
export async function advance(): Promise<Record<string, number>> {
  const stats: Record<string, number> = { draftsGenerated: 0, touchesQueued: 0, claimTimeouts: 0, placedTimeouts: 0, missionsCompleted: 0 }
  const now = new Date()

  // 1. Time out stale claimed/placed touches back to the manual queue.
  const staleClaimed = await db.campaignMembership.updateMany({
    where: { placementState: 'claimed', claimedAt: { lt: new Date(now.getTime() - CLAIM_TIMEOUT_MS) } },
    data: { placementState: 'queued', claimedAt: null },
  })
  stats.claimTimeouts = staleClaimed.count
  const stalePlaced = await db.campaignMembership.updateMany({
    where: { placementState: 'placed', placedAt: { lt: new Date(now.getTime() - PLACED_TIMEOUT_MS) } },
    data: { placementState: 'queued', claimedAt: null, placedAt: null, placementError: 'placed-timeout' },
  })
  stats.placedTimeouts = stalePlaced.count

  // 2. Drafting: for campaigns in `drafting`, draft a batch of members.
  const draftingCampaigns = await db.campaign.findMany({ where: { status: 'drafting' } })
  for (const campaign of draftingCampaigns) {
    const mission = await missionForCampaign(campaign.id)
    if (!mission || mission.status === 'paused') continue
    const batch = await db.campaignMembership.findMany({
      where: { campaignId: campaign.id, state: 'enriched' },
      take: DRAFT_BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    })
    for (const m of batch) {
      // Claim via guarded transition so two overlapping runs never double-draft.
      const claimed = await db.campaignMembership.updateMany({
        where: { id: m.id, state: 'enriched' },
        data: { state: 'drafting' },
      })
      if (claimed.count === 0) continue
      try {
        await draftForMembership(m.id)
        stats.draftsGenerated++
      } catch (err) {
        await db.campaignMembership.updateMany({ where: { id: m.id, state: 'drafting' }, data: { state: 'enriched' } })
        await emitMissionEvent(mission.id, 'error', { stage: 'drafting', membershipId: m.id, error: String(err) })
      }
    }
    // All drafted? Open the draft-batch gate with a sample of 10.
    const remaining = await db.campaignMembership.count({
      where: { campaignId: campaign.id, state: { in: ['enriched', 'drafting'] } },
    })
    if (remaining === 0) {
      const existing = await db.approval.findFirst({ where: { missionId: mission.id, kind: 'draft-batch' } })
      if (!existing) {
        const drafted = await db.campaignMembership.findMany({
          where: { campaignId: campaign.id, state: 'drafted' },
          select: { id: true, drafts: true },
        })
        // Members whose drafts failed the deterministic checks go into the
        // review sample first; the rest of the sample is a random draw.
        const failing = drafted.filter((d) => parseDrafts(d.drafts).some((x) => x.checksPassed === false))
        const failingIds = new Set(failing.map((d) => d.id))
        const rest = drafted.filter((d) => !failingIds.has(d.id)).map((d) => d.id).sort(() => Math.random() - 0.5)
        const sample = [...failing.map((d) => d.id), ...rest].slice(0, DRAFT_SAMPLE_SIZE)
        await db.approval.create({
          data: {
            missionId: mission.id, kind: 'draft-batch',
            payload: { sampleMembershipIds: sample, total: drafted.length, failingChecks: failing.length } as Prisma.InputJsonValue,
          },
        })
        await emitMissionEvent(mission.id, 'approval-requested', { kind: 'draft-batch', sample: sample.length, total: drafted.length, failingChecks: failing.length })
        await setMissionStatus(mission.id, 'awaiting-approval')
      }
    }
  }

  // 3. Due touches: move into the send channel. Requires the release approval.
  const due = await db.campaignMembership.findMany({
    where: { state: 'queued', nextActionAt: { lte: now }, placementState: null },
    include: { campaign: true, person: true },
    take: 50,
  })
  for (const m of due) {
    const mission = await missionForCampaign(m.campaignId)
    if (!mission || mission.status !== 'running') continue
    if (!(await hasRelease(mission.id))) continue // hard gate
    const sequence = parseSequence(m.campaign.sequence)
    const touch = sequence[m.currentTouchIndex]
    if (!touch) continue
    if (touch.channel === 'linkedin' && (await isLinkedInPaused(mission.id))) continue

    if (touch.channel === 'email') {
      const adapter = getEmailAdapter()
      if (adapter && m.person.email) {
        try {
          const drafts = parseDrafts(m.drafts).filter((d) => d.channel === 'email')
          await adapter.enqueue(m.campaign.name, {
            membershipId: m.id, email: m.person.email, name: m.person.name, drafts,
          })
          // The sequencer owns cadence from here; reply webhooks advance state.
          const flipped = await db.campaignMembership.updateMany({
            where: { id: m.id, placementState: null, state: 'queued' },
            data: { placementState: 'sequencer' },
          })
          if (flipped.count) {
            stats.touchesQueued++
            await emitMissionEvent(mission.id, 'progress', { stage: 'sending', channel: 'email', via: adapter.name, membershipId: m.id })
          }
          continue
        } catch (err) {
          await emitMissionEvent(mission.id, 'error', { stage: 'sending', channel: 'email', membershipId: m.id, error: String(err) })
        }
      }
    }
    // LinkedIn touch, or email with no sequencer configured → manual/runner queue.
    const flipped = await db.campaignMembership.updateMany({
      where: { id: m.id, placementState: null, state: 'queued' },
      data: { placementState: 'queued' },
    })
    if (flipped.count) {
      stats.touchesQueued++
      await emitMissionEvent(mission.id, 'progress', {
        stage: 'touch-due', channel: touch.channel, membershipId: m.id, person: m.person.name, touchIndex: m.currentTouchIndex,
      })
    }
  }

  // 4. Completion: running missions whose memberships are all terminal.
  const runningMissions = await db.mission.findMany({ where: { status: 'running', campaignId: { not: null } } })
  for (const mission of runningMissions) {
    const open = await db.campaignMembership.count({
      where: { campaignId: mission.campaignId!, state: { notIn: TERMINAL_STATES } },
    })
    const total = await db.campaignMembership.count({ where: { campaignId: mission.campaignId! } })
    if (total > 0 && open === 0) {
      const summary = await buildCampaignReport(mission.id)
      await db.campaign.update({ where: { id: mission.campaignId! }, data: { status: 'completed' } })
      await setMissionStatus(mission.id, 'completed')
      await emitMissionEvent(mission.id, 'progress', { stage: 'completed', summary })
      stats.missionsCompleted++
    }
  }

  return stats
}

// ── Touch lifecycle (runner + manual queue) ───────────────────────

export type ClaimedTouch = {
  touchId: string
  personName: string
  linkedinUrl: string | null
  draftText: string
}

/**
 * Claim the next due, approved, queued touch for the runner. Optimistic:
 * the queued→claimed flip is an updateMany guarded on placementState, so a
 * concurrent runner (or the manual queue) can never take the same touch.
 */
export async function claimNextTouch(missionId?: string): Promise<ClaimedTouch | null> {
  const where: Prisma.CampaignMembershipWhereInput = {
    placementState: 'queued',
    state: 'queued',
    nextActionAt: { lte: new Date() },
  }
  if (missionId) {
    const mission = await db.mission.findUnique({ where: { id: missionId } })
    if (!mission?.campaignId) return null
    where.campaignId = mission.campaignId
  }
  const candidates = await db.campaignMembership.findMany({
    where, include: { person: true, campaign: true }, orderBy: { nextActionAt: 'asc' }, take: 10,
  })
  for (const m of candidates) {
    const sequence = parseSequence(m.campaign.sequence)
    const touch = sequence[m.currentTouchIndex]
    if (touch?.channel !== 'linkedin') continue // runner only handles LinkedIn
    const mission = await missionForCampaign(m.campaignId)
    if (!mission) continue
    if (!(await hasRelease(mission.id))) continue // hard gate
    if (await isLinkedInPaused(mission.id)) continue
    const claimed = await db.campaignMembership.updateMany({
      where: { id: m.id, placementState: 'queued' },
      data: { placementState: 'claimed', claimedAt: new Date() },
    })
    if (claimed.count === 0) continue // someone else got it
    const draft = parseDrafts(m.drafts).find((d) => d.touchIndex === m.currentTouchIndex)
    return {
      touchId: m.id,
      personName: m.person.name,
      linkedinUrl: m.person.linkedinUrl,
      draftText: draft ? effectiveBody(draft) : '',
    }
  }
  return null
}

export async function markPlaced(touchId: string) {
  const flipped = await db.campaignMembership.updateMany({
    where: { id: touchId, placementState: 'claimed' },
    data: { placementState: 'placed', placedAt: new Date() },
  })
  if (flipped.count === 0) throw new Error('touch is not in claimed state')
  const m = await db.campaignMembership.findUnique({ where: { id: touchId }, include: { person: true } })
  const mission = m ? await missionForCampaign(m.campaignId) : null
  if (mission) await emitMissionEvent(mission.id, 'progress', { stage: 'placed', membershipId: touchId, person: m!.person.name }, 'runner')
}

/**
 * Record a touch as sent — the only path that writes a LinkedIn Interaction
 * row in the runner flow, and the shared advance point for the manual queue.
 * Writes the Interaction, folds placement history into the drafts JSON, and
 * schedules the next touch (or marks the member `sent`).
 */
export async function markTouchSent(
  touchId: string,
  via: 'runner' | 'manual',
  actor: MissionActor = 'runner'
) {
  const m = await db.campaignMembership.findUnique({
    where: { id: touchId }, include: { person: true, campaign: true },
  })
  if (!m) throw new Error('touch not found')
  if (!m.placementState || !['claimed', 'placed', 'queued'].includes(m.placementState)) {
    throw new Error(`touch is not sendable (placementState=${m.placementState})`)
  }
  const mission = await missionForCampaign(m.campaignId)
  if (!mission) throw new Error('no mission for campaign')
  await requireRelease(mission.id)

  const { firmId } = await getScope()
  const sequence = parseSequence(m.campaign.sequence)
  const touch = sequence[m.currentTouchIndex]
  const drafts = parseDrafts(m.drafts)
  const draft = drafts.find((d) => d.touchIndex === m.currentTouchIndex)
  const nowIso = new Date().toISOString()

  if (draft) {
    draft.sentAt = nowIso
    draft.placement = { state: 'sent', placedAt: m.placedAt?.toISOString(), sentVia: via }
  }

  await db.interaction.create({
    data: {
      firmId,
      personId: m.personId,
      channel: touch?.channel ?? 'other',
      direction: 'outbound',
      campaignId: m.campaignId,
      body: draft ? effectiveBody(draft) : null,
      metadata: { touchIndex: m.currentTouchIndex, via } as Prisma.InputJsonValue,
    },
  })

  const nextIndex = m.currentTouchIndex + 1
  const nextTouch = sequence[nextIndex]
  await db.campaignMembership.update({
    where: { id: m.id },
    data: {
      drafts: drafts as unknown as Prisma.InputJsonValue,
      placementState: null, claimedAt: null, placedAt: null, placementError: null,
      ...(nextTouch
        ? { currentTouchIndex: nextIndex, state: 'queued', nextActionAt: new Date(Date.now() + nextTouch.delayDays * 86400_000) }
        : { state: 'sent', nextActionAt: null }),
    },
  })
  await emitMissionEvent(mission.id, 'progress', {
    stage: 'sent', channel: touch?.channel, membershipId: m.id, person: m.person.name,
    touchIndex: m.currentTouchIndex, via, nextTouchAt: nextTouch ? new Date(Date.now() + nextTouch.delayDays * 86400_000).toISOString() : null,
  }, actor)
}

export async function markPlacementFailed(touchId: string, reason: string, screenshotRef?: string) {
  const m = await db.campaignMembership.findUnique({ where: { id: touchId } })
  if (!m) throw new Error('touch not found')
  // Back to the manual fallback queue so the pipeline never stalls on one bad URL.
  await db.campaignMembership.updateMany({
    where: { id: touchId, placementState: { in: ['claimed', 'placed'] } },
    data: { placementState: 'queued', claimedAt: null, placedAt: null, placementError: reason },
  })
  const mission = await missionForCampaign(m.campaignId)
  if (!mission) return
  if (reason === 'checkpoint') {
    // LinkedIn showed a verification/captcha interstitial: pause the channel.
    await setLinkedInPaused(mission.id, true)
    await emitMissionEvent(mission.id, 'error', {
      stage: 'placement', reason, screenshotRef, membershipId: touchId,
      note: 'LinkedIn checkpoint — channel paused for this mission',
    }, 'runner')
  } else {
    await emitMissionEvent(mission.id, 'error', { stage: 'placement', reason, screenshotRef, membershipId: touchId }, 'runner')
  }
}

// ── Inbound replies ───────────────────────────────────────────────

export async function handleInboundReply(input: {
  email?: string
  membershipId?: string
  body: string
  channel?: 'email' | 'linkedin'
}) {
  const { firmId } = await getScope()
  let membership = input.membershipId
    ? await db.campaignMembership.findUnique({ where: { id: input.membershipId }, include: { person: true, campaign: true } })
    : null
  if (!membership && input.email) {
    const person = await db.person.findFirst({ where: { email: input.email } })
    if (person) {
      membership = await db.campaignMembership.findFirst({
        where: { personId: person.id, state: { in: ['queued', 'sent'] } },
        orderBy: { updatedAt: 'desc' },
        include: { person: true, campaign: true },
      })
    }
  }
  if (!membership) return { classified: null as string | null, matched: false }

  const classification = await classifyReply(input.body, membership.campaign.hypothesis ?? undefined)
  await db.interaction.create({
    data: {
      firmId,
      personId: membership.personId,
      channel: input.channel ?? 'email',
      direction: 'inbound',
      campaignId: membership.campaignId,
      body: input.body,
      classification,
    },
  })
  await db.campaignMembership.update({
    where: { id: membership.id },
    data: { state: 'replied', outcome: classification, placementState: null, nextActionAt: null },
  })
  const mission = await missionForCampaign(membership.campaignId)
  if (mission) {
    await emitMissionEvent(mission.id, classification === 'interested' ? 'note' : 'progress', {
      stage: 'reply', classification, person: membership.person.name,
      flag: classification === 'interested' ? 'operator-attention' : undefined,
      preview: input.body.slice(0, 200),
    })
  }
  return { classified: classification, matched: true }
}

// ── Reporting ─────────────────────────────────────────────────────

export async function buildCampaignReport(missionId: string) {
  const mission = await db.mission.findUnique({ where: { id: missionId } })
  if (!mission?.campaignId) return null
  const memberships = await db.campaignMembership.findMany({ where: { campaignId: mission.campaignId } })
  const sends = await db.interaction.count({ where: { campaignId: mission.campaignId, direction: 'outbound' } })
  const replies = await db.interaction.findMany({ where: { campaignId: mission.campaignId, direction: 'inbound' } })
  const outcomes: Record<string, number> = {}
  for (const r of replies) outcomes[r.classification ?? 'other'] = (outcomes[r.classification ?? 'other'] ?? 0) + 1
  const states: Record<string, number> = {}
  for (const m of memberships) states[m.state] = (states[m.state] ?? 0) + 1
  return { members: memberships.length, sends, replies: replies.length, outcomes, states }
}
