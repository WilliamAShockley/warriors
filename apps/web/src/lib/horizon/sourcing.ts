import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { getScope } from './scope'
import { emitMissionEvent, setMissionStatus } from './events'
import type { IcpDefinition } from './types'

/**
 * Sourcing — v1 is import-based (CSV upload or pasted list). The Sourcer
 * interface exists so an enrichment-API sourcer (Clay/Apollo/PDL) can be
 * added later without touching the pipeline: implement `source()` returning
 * SourcedPerson[] and everything downstream is unchanged.
 */

export type SourcedPerson = {
  name: string
  email?: string
  linkedinUrl?: string
  company?: string
  notes?: string
}

export interface Sourcer {
  source(campaignId: string): Promise<SourcedPerson[]>
}

/** Parse a CSV or pasted list with columns: name, email, linkedinUrl, company, notes. */
export function parseSourcingCsv(text: string): SourcedPerson[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return []

  const splitRow = (line: string): string[] => {
    // Minimal CSV split with double-quote support.
    const out: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (ch === '"') inQuotes = false
        else cur += ch
      } else if (ch === '"') inQuotes = true
      else if (ch === ',') { out.push(cur); cur = '' }
      else cur += ch
    }
    out.push(cur)
    return out.map((s) => s.trim())
  }

  const header = splitRow(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ''))
  const hasHeader = header.includes('name') || header.includes('email')
  const col = (name: string) => header.indexOf(name)
  const rows = hasHeader ? lines.slice(1) : lines

  return rows
    .map((line) => {
      const cells = splitRow(line)
      if (hasHeader) {
        return {
          name: cells[col('name')] ?? '',
          email: cells[col('email')] || undefined,
          linkedinUrl: cells[col('linkedinurl')] || cells[col('linkedin')] || undefined,
          company: cells[col('company')] || undefined,
          notes: cells[col('notes')] || undefined,
        }
      }
      // Headerless: name, email, linkedinUrl, company, notes positional
      return { name: cells[0] ?? '', email: cells[1] || undefined, linkedinUrl: cells[2] || undefined, company: cells[3] || undefined, notes: cells[4] || undefined }
    })
    .filter((p) => p.name)
}

/**
 * Upsert sourced people into the firm-level Person graph (dedupe on
 * email/linkedinUrl), apply ICP exclusion rules, create CampaignMemberships
 * in `sourced`, run the v1 pass-through enrichment, and open the strategy +
 * list gates. Returns counts for the mission event log.
 */
export async function importIntoMission(missionId: string, people: SourcedPerson[]) {
  const { firmId } = await getScope()
  const mission = await db.mission.findUnique({ where: { id: missionId }, include: { campaign: true } })
  if (!mission?.campaign) throw new Error('mission has no campaign')
  const campaign = mission.campaign
  const icp = (campaign.icpDefinition ?? {}) as IcpDefinition
  const recontactDays = icp.exclusions?.recontactDays ?? 30
  const excludeTags = icp.exclusions?.excludeTags ?? []
  const recontactCutoff = new Date(Date.now() - recontactDays * 86400_000)

  let created = 0
  let matched = 0
  let excluded = 0

  await db.campaign.update({ where: { id: campaign.id }, data: { status: 'sourcing' } })

  for (const p of people) {
    // Dedupe against the firm graph on email first, then linkedinUrl.
    let person =
      (p.email ? await db.person.findFirst({ where: { email: p.email, deletedAt: null } }) : null) ??
      (p.linkedinUrl ? await db.person.findFirst({ where: { linkedinUrl: p.linkedinUrl, deletedAt: null } }) : null)

    if (person) {
      matched++
      await db.person.update({
        where: { id: person.id },
        data: {
          firmId: person.firmId ?? firmId,
          linkedinUrl: person.linkedinUrl ?? p.linkedinUrl,
          email: person.email ?? p.email,
          currentCompany: person.currentCompany ?? p.company,
        },
      })
    } else {
      created++
      person = await db.person.create({
        data: {
          firmId,
          name: p.name,
          email: p.email,
          linkedinUrl: p.linkedinUrl,
          currentCompany: p.company,
          bio: p.notes,
          sourceType: 'horizon_import',
        },
      })
    }

    // Exclusion rules from the ICP definition.
    let exclusionReason: string | null = null
    if (person.status === 'do-not-contact') exclusionReason = 'do-not-contact'
    else if (person.status === 'bounced') exclusionReason = 'bounced'
    else if (excludeTags.length && person.tags.some((t) => excludeTags.includes(t))) {
      exclusionReason = 'excluded-tag'
    } else {
      const recent = await db.interaction.findFirst({
        where: { personId: person.id, direction: 'outbound', occurredAt: { gte: recontactCutoff } },
      })
      if (recent) exclusionReason = `contacted-within-${recontactDays}d`
    }

    // v1 enrichment: pass-through of imported fields, provenance-tagged.
    const enrichment = {
      source: 'import',
      fetchedAt: new Date().toISOString(),
      fields: {
        name: p.name, email: p.email, linkedinUrl: p.linkedinUrl,
        company: p.company ?? person.currentCompany, notes: p.notes,
        role: person.currentRole,
      },
    }
    await db.person.update({ where: { id: person.id }, data: { enrichment: enrichment as Prisma.InputJsonValue } })

    if (exclusionReason) excluded++
    await db.campaignMembership.upsert({
      where: { campaignId_personId: { campaignId: campaign.id, personId: person.id } },
      create: {
        campaignId: campaign.id,
        personId: person.id,
        state: exclusionReason ? 'excluded' : 'enriched',
        outcome: exclusionReason ?? undefined,
      },
      update: {},
    })
  }

  await emitMissionEvent(missionId, 'progress', {
    stage: 'sourcing', imported: people.length, created, matched, excluded,
  })
  await emitMissionEvent(missionId, 'progress', { stage: 'enrichment', note: 'v1 pass-through enrichment applied' })

  // Open the human gates: message-strategy first, then target-list.
  const memberIds = (
    await db.campaignMembership.findMany({
      where: { campaignId: campaign.id, state: 'enriched' },
      select: { id: true },
    })
  ).map((m) => m.id)

  const pending = await db.approval.findMany({ where: { missionId, status: 'pending' } })
  if (!pending.some((a) => a.kind === 'message-strategy')) {
    await db.approval.create({
      data: {
        missionId, kind: 'message-strategy',
        payload: { messageStrategy: campaign.messageStrategy, sequence: campaign.sequence ?? undefined } as Prisma.InputJsonValue,
      },
    })
    await emitMissionEvent(missionId, 'approval-requested', { kind: 'message-strategy' })
  }
  if (!pending.some((a) => a.kind === 'target-list')) {
    await db.approval.create({
      data: { missionId, kind: 'target-list', payload: { membershipIds: memberIds } as Prisma.InputJsonValue },
    })
    await emitMissionEvent(missionId, 'approval-requested', { kind: 'target-list', count: memberIds.length })
  }

  await db.campaign.update({ where: { id: campaign.id }, data: { status: 'awaiting-strategy-approval' } })
  await setMissionStatus(missionId, 'awaiting-approval')

  return { imported: people.length, created, matched, excluded, eligible: memberIds.length }
}
