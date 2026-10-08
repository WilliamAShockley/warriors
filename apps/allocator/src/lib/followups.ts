// The follow-up cadence: every signed cold founder email is followed up
// for eight weeks - each follow-up lands a random 3-7 days after the last,
// in the evening, at most one a calendar week, so the rhythm never reads as a machine's.
// The sequence closes when the next touch would fall past the eight weeks.
//
// Enrolment happens when a cold proof is signed (approveProof). A cron
// tick then walks the due sequences: it checks the sent thread (bounce?
// reply? did the reader already follow up by hand?), drafts a clipped
// follow-up through the founder-email skill — never the Apollo core
// prompt — and, per the workspace's mode, either files it in The Proofs
// (review) or sends it in-thread (auto, only when every check clears).
// A follow-up that fails its checks is never sent: it goes to The Proofs.

import { greetingName, runStpChecks, stpAllPassed } from './stp'

export const MIN_GAP_DAYS = 3 // each follow-up lands 3-7 days after the last
export const MAX_GAP_DAYS = 7
export const WINDOW_DAYS = 56 // the cadence runs eight weeks from the cold email
export const MAX_TOUCHES = 12 // a hard ceiling, whatever the dice say
export type FollowUpMode = 'off' | 'review' | 'auto'

const TZ = process.env.APP_TIMEZONE ?? 'America/New_York'
const DAY = 86_400_000
const MAX_PER_RUN = 4 // a backlog never lands as a burst
const CLAIM_MS = 30 * 60_000
const PENDING_RECHECK_MS = 6 * 3_600_000
const hasDb = () => Boolean(process.env.DATABASE_URL)

async function getDb() {
  const { db } = await import('./db')
  return db
}

// ————————————————————————————————— Scheduling

function tzOffsetMs(at: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(at)
      .map((x) => [x.type, Number(x.value)])
  )
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at.getTime() / 1000) * 1000
}

// A wall-clock time in the desk's timezone, as a UTC instant.
function wallToUtc(y: number, m: number, d: number, h: number, mi: number): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi)
  const first = guess - tzOffsetMs(new Date(guess))
  return new Date(guess - tzOffsetMs(new Date(first)))
}

function wallDate(at: Date): { y: number; m: number; d: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(at)
      .map((x) => [x.type, Number(x.value)])
  )
  return { y: p.year, m: p.month, d: p.day }
}

// The Monday that opens the calendar week (Mon-Sun, desk timezone) a
// given calendar date falls in.
const weekStart = (y: number, m: number, d: number): number => {
  const t = Date.UTC(y, m - 1, d)
  return t - ((new Date(t).getUTCDay() + 6) % 7) * DAY
}

// When the next touch should land, given when the last one did: a random
// 3-7 days later, any day of the week, at a random minute between 6 and
// 11 PM in the desk's timezone - never less than 3 full days after, and
// (when `lastFollowUpAt` is given) never in the same calendar week as the
// previous follow-up: one a week at most, though Friday then Monday is fine.
export function planNextSend(lastAt: Date, rng: () => number = Math.random, lastFollowUpAt?: Date | null): Date {
  const minAt = lastAt.getTime() + MIN_GAP_DAYS * DAY
  const base = wallDate(lastAt)
  const avoid = lastFollowUpAt ? wallDate(lastFollowUpAt) : null
  const avoidWeek = avoid ? weekStart(avoid.y, avoid.m, avoid.d) : null
  const hour = 18 + Math.floor(rng() * 5) // 18:00-22:59
  const minute = Math.floor(rng() * 60)
  const at = (c: Date) => wallToUtc(c.getUTCFullYear(), c.getUTCMonth() + 1, c.getUTCDate(), hour, minute)
  const candidates: Date[] = []
  for (let gap = MIN_GAP_DAYS; gap <= MAX_GAP_DAYS; gap++) {
    const c = new Date(Date.UTC(base.y, base.m - 1, base.d + gap))
    if (avoidWeek !== null && weekStart(c.getUTCFullYear(), c.getUTCMonth() + 1, c.getUTCDate()) === avoidWeek) continue
    const when = at(c)
    if (when.getTime() >= minAt) candidates.push(when)
  }
  if (candidates.length > 0) return candidates[Math.floor(rng() * candidates.length)]
  // Unreachable in practice, but never return nothing: the Monday after.
  return at(new Date((avoidWeek ?? weekStart(base.y, base.m, base.d)) + 7 * DAY + Math.floor(rng() * 3) * DAY))
}

// ————————————————————————————————— Mode

export async function getFollowUpMode(): Promise<FollowUpMode> {
  if (!hasDb()) return 'off'
  try {
    const db = await getDb()
    const { activeWorkspaceId } = await import('./tenant')
    const row = await db.readerSetting.findUnique({ where: { id: await activeWorkspaceId() } })
    const m = row?.followUpMode
    return m === 'off' || m === 'auto' ? m : 'review'
  } catch {
    return 'review'
  }
}

export async function setFollowUpMode(mode: FollowUpMode): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    const { activeWorkspaceId, ensureAdopted } = await import('./tenant')
    await ensureAdopted()
    const ws = await activeWorkspaceId()
    const { getReaderName } = await import('./settings')
    const name = await getReaderName()
    await db.readerSetting.upsert({
      where: { id: ws },
      create: { id: ws, name, followUpMode: mode },
      update: { followUpMode: mode },
    })
    return true
  } catch {
    return false
  }
}

// ————————————————————————————————— Enrolment

type HistoryEntry = {
  n: number
  at: string
  via: 'auto' | 'proof' | 'manual' | 'skipped'
  body?: string
  messageId?: string | null
}

const readHistory = (seq: any): HistoryEntry[] => {
  try {
    return JSON.parse(seq.historyJson ?? '[]')
  } catch {
    return []
  }
}

// Called when a proof is signed. Only a signed cold founder email with a
// live thread starts a cadence; everything else is ignored. Idempotent.
export async function enrollFollowUps(proofId: string): Promise<void> {
  if (!hasDb()) return
  try {
    const db = await getDb()
    const proof = await db.reviewItem.findUnique({ where: { id: proofId } })
    if (
      !proof ||
      proof.status !== 'approved' ||
      proof.actionType !== 'send_email' ||
      proof.audience !== 'founder' ||
      proof.mode !== 'cold' ||
      !proof.sentThreadId
    )
      return
    const existing = await db.followUpSequence.findUnique({ where: { proofId } })
    if (existing) return
    const startedAt = proof.reviewedAt ?? new Date()
    await db.followUpSequence.create({
      data: {
        proofId,
        company: proof.company,
        startedAt,
        nextSendAt: planNextSend(startedAt),
      },
    })
  } catch {
    // The cadence is enrichment on top of a sent email; signing never fails on it.
  }
}

// ————————————————————————————————— The tick

export type TickReport = {
  mode: FollowUpMode
  considered: number
  sent: number
  staged: number
  stopped: number
  waiting: number
  errors: number
}

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  )

function similarity(a: string, b: string): number {
  const A = words(a)
  const B = words(b)
  if (A.size === 0 || B.size === 0) return 0
  let shared = 0
  for (const w of A) if (B.has(w)) shared++
  return shared / (A.size + B.size - shared)
}

// Per-touch steering for the founder-email skill. Touch 2+ is 1–2
// sentences and never re-pitches (the profile's rule); what varies is the
// shape and, later in the run, the profile's own escalation plays.
const SHAPES = [
  'a single clipped line',
  'a single short line ending in an exclamation point',
  'two very short sentences',
  'a light "circling back" line',
  'a quick "still keen to connect" line',
]

function touchGuidance(n: number): string {
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)]
  const play =
    n >= 3 && n <= 5
      ? ' You may use ONE of the profile\'s escalation plays if it fits naturally: "Coffee on me of course" or offering to loop partner Adam into the first call.'
      : n >= 6
        ? ' By now keep it especially light and warm - "professionally persistent" energy, low pressure, still no re-pitch.'
        : ''
  return `Follow-up touch ${n}. Make it ${shape}. The ask is simply to connect (quick call or coffee). Open with the founder's first name in the profile's greeting shape.${play}`
}

const coldSubjectOf = (proof: any): string => {
  try {
    return String(JSON.parse(proof.actionJson ?? '{}').subject ?? proof.title)
  } catch {
    return String(proof.title)
  }
}

async function draftTouch(args: {
  proof: any
  seq: any
  n: number
  history: HistoryEntry[]
  to: string
  subject: string
}): Promise<{ body: string; checksPass: boolean; failing: string[] }> {
  const { proof, n, history } = args
  const coldName = greetingName(proof.body)
  const { draftFounderEmail } = await import('./apollo/skills/founder-email')
  const { getReaderName } = await import('./settings')
  const readerName = await getReaderName()
  const priorBodies = history.map((h) => h.body).filter(Boolean) as string[]
  const daysSince = Math.round((Date.now() - new Date(args.seq.startedAt).getTime()) / DAY)

  let failing: string[] = []
  let body = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const context = [
      `Cold email "${coldSubjectOf(proof)}" went out ${daysSince} days ago. No reply yet.`,
      priorBodies.length
        ? `Follow-ups already sent (do NOT repeat their wording or structure):\n${priorBodies.map((b, i) => `--- touch ${i + 2} ---\n${b}`).join('\n')}`
        : 'This is the first follow-up.',
      failing.length ? `Your last attempt failed these checks - fix them: ${failing.join(' | ')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    const draft = await draftFounderEmail(
      {
        mode: 'follow_up',
        founder: coldName ?? 'the founder',
        firm: proof.company ?? undefined,
        context,
        goal: touchGuidance(n + 1),
        suppressReaderView: true, // follow-ups never re-pitch, so no thesis context
      },
      readerName
    )
    body = draft.body.trim()

    const results = await runStpChecks({
      body,
      subject: args.subject,
      to: args.to,
      mode: 'follow_up',
      audience: 'founder',
      grounding: proof.grounding ?? null,
      // The name the signed cold email greeted with is the name on file.
      register: coldName ? { founderFirstName: coldName, founderFullName: null } : null,
    })
    failing = results.filter((r) => !r.pass).map((r) => `${r.label}: ${r.detail}`)
    // Near-verbatim repeats of an earlier touch read as a machine.
    if (priorBodies.some((p) => similarity(p, body) >= 0.7)) {
      failing.push('Too close to an earlier follow-up - rephrase it.')
    }
    if (stpAllPassed(results) && failing.length === 0) return { body, checksPass: true, failing: [] }
  }
  return { body, checksPass: false, failing }
}

// Files the touch's outcome: bumps the count, closes the sequence after
// the last touch, else schedules the next one.
async function advance(db: any, seq: any, history: HistoryEntry[], base: Date, extra: Record<string, unknown> = {}) {
  const touchesDone = history.length
  const next = planNextSend(base, Math.random, base)
  const windowEnd = new Date(seq.startedAt).getTime() + WINDOW_DAYS * DAY
  const done = touchesDone >= MAX_TOUCHES || next.getTime() > windowEnd
  await db.followUpSequence.update({
    where: { id: seq.id },
    data: {
      historyJson: JSON.stringify(history),
      touchesDone,
      pendingProofId: null,
      lastError: null,
      ...(done
        ? { status: 'completed', stopReason: 'eight weeks run', nextSendAt: null }
        : { nextSendAt: next }),
      ...extra,
    },
  })
}

async function stop(db: any, seq: any, status: 'replied' | 'bounced' | 'stopped', reason: string) {
  await db.followUpSequence.update({
    where: { id: seq.id },
    data: { status, stopReason: reason, nextSendAt: null, pendingProofId: null },
  })
}

type Outcome = 'sent' | 'staged' | 'stopped' | 'waiting'

async function processSequence(db: any, seq: any, mode: FollowUpMode): Promise<Outcome> {
  const proof = await db.reviewItem.findUnique({ where: { id: seq.proofId } })
  if (!proof || proof.status !== 'approved' || !proof.sentThreadId) {
    await stop(db, seq, 'stopped', 'the cold email is no longer on record')
    return 'stopped'
  }
  // The delivery watch is still deciding whether the address held.
  if (proof.deliveryStatus === 'watching') return 'waiting'
  if (proof.deliveryStatus === 'undeliverable') {
    await stop(db, seq, 'bounced', 'the address bounced on every attempt')
    return 'stopped'
  }

  const history = readHistory(seq)

  // A follow-up already staged in The Proofs: wait on the signature.
  if (seq.pendingProofId) {
    const pending = await db.reviewItem.findUnique({ where: { id: seq.pendingProofId } })
    if (pending?.status === 'pending') return 'waiting'
    if (pending?.status === 'approved') {
      history.push({
        n: history.length + 1,
        at: (pending.reviewedAt ?? new Date()).toISOString(),
        via: 'proof',
        body: pending.body,
        messageId: pending.sentMessageId,
      })
      const at = pending.reviewedAt ?? new Date()
      await advance(db, seq, history, at, { lastTouchAt: at })
      return 'waiting'
    }
    // Spiked or gone: that touch is skipped; the cadence moves on.
    history.push({ n: history.length + 1, at: new Date().toISOString(), via: 'skipped' })
    await advance(db, seq, history, new Date())
    return 'waiting'
  }

  const thread = await (await import('./gmail')).inspectThread(proof.sentThreadId)
  if (!thread) throw new Error('Gmail unreachable')

  if (thread.some((m) => m.bounce)) {
    await stop(db, seq, 'bounced', 'a bounce landed on the thread')
    return 'stopped'
  }
  if (thread.some((m) => !m.own && !m.bounce)) {
    await stop(db, seq, 'replied', 'they replied')
    await db.reviewItem.update({ where: { id: proof.id }, data: { replyStatus: 'replied' } })
    return 'stopped'
  }

  // Did the reader already follow up by hand? That counts as a touch.
  const known = new Set([proof.sentMessageId, ...history.map((h) => h.messageId)].filter(Boolean))
  const since = (seq.lastTouchAt ?? seq.startedAt).getTime() + 60_000
  const manual = thread.filter((m) => m.own && !known.has(m.id) && m.internalDate > since)
  if (manual.length > 0) {
    for (const m of manual) {
      history.push({ n: history.length + 1, at: new Date(m.internalDate).toISOString(), via: 'manual', messageId: m.id })
    }
    const at = new Date(Math.max(...manual.map((m) => m.internalDate)))
    await advance(db, seq, history, at, { lastTouchAt: at })
    return 'waiting'
  }

  const action = proof.actionJson ? JSON.parse(proof.actionJson) : {}
  const to = String(action.to ?? '')
  const subject = `Re: ${coldSubjectOf(proof).replace(/^(re:\s*)+/i, '')}`
  const n = history.length // follow-ups already done
  const { body, checksPass, failing } = await draftTouch({ proof, seq, n, history, to, subject })
  if (!body) throw new Error('empty draft')

  if (mode === 'auto' && checksPass && to) {
    const tail = thread[thread.length - 1]
    const { sendEmail } = await import('./gmail')
    const sent = await sendEmail({
      to,
      subject,
      bodyText: body,
      threadId: proof.sentThreadId,
      inReplyTo: tail?.messageIdHeader || null,
      references: [tail?.references, tail?.messageIdHeader].filter(Boolean).join(' ') || null,
    })
    if (!sent) throw new Error('the send failed - Gmail may not be connected')
    const now = new Date()
    history.push({ n: n + 1, at: now.toISOString(), via: 'auto', body, messageId: sent.id || null })
    await advance(db, seq, history, now, { lastTouchAt: now })
    return 'sent'
  }

  // Review mode, or a draft that did not clear its checks: into The Proofs.
  const { createProof } = await import('./review')
  const staged = await createProof({
    kind: 'email',
    title: `Follow-up ${n + 1} - ${proof.company ?? to}`,
    summary:
      mode === 'auto' && failing.length
        ? `Held from auto-send: ${failing[0]}`
        : `Nudge ${n + 1} to ${to}. Signing sends it in the same thread.`,
    body,
    actionType: 'send_email',
    actionJson: JSON.stringify({ to, subject, threadId: proof.sentThreadId }),
    audience: 'founder',
    mode: 'follow_up',
    company: proof.company ?? undefined,
    grounding: proof.grounding ?? undefined,
  })
  if (!staged) throw new Error('could not stage the follow-up')
  await db.followUpSequence.update({
    where: { id: seq.id },
    data: {
      pendingProofId: staged.id,
      nextSendAt: new Date(Date.now() + PENDING_RECHECK_MS),
      lastError: null,
    },
  })
  return 'staged'
}

// One pass over this workspace's due sequences. Runs inside a workspace
// frame (the cron wraps it); each sequence is claimed before work so two
// overlapping runs never double-send.
export async function runFollowUps(): Promise<TickReport> {
  const report: TickReport = { mode: 'off', considered: 0, sent: 0, staged: 0, stopped: 0, waiting: 0, errors: 0 }
  if (!hasDb()) return report
  const mode = await getFollowUpMode()
  report.mode = mode
  if (mode === 'off') return report

  const db = await getDb()
  const now = new Date()
  const due = await db.followUpSequence.findMany({
    where: { status: 'active', nextSendAt: { lte: now } },
    orderBy: { nextSendAt: 'asc' },
    take: MAX_PER_RUN,
  })

  for (const seq of due) {
    report.considered++
    try {
      // A long-off or long-broken cadence re-plans instead of bursting.
      if (!seq.pendingProofId && seq.nextSendAt && now.getTime() - seq.nextSendAt.getTime() > 36 * 3_600_000) {
        await db.followUpSequence.update({
          where: { id: seq.id },
          data: { nextSendAt: planNextSend(now, Math.random, seq.lastTouchAt) },
        })
        report.waiting++
        continue
      }
      const claim = await db.followUpSequence.updateMany({
        where: { id: seq.id, nextSendAt: seq.nextSendAt },
        data: { nextSendAt: new Date(now.getTime() + CLAIM_MS) },
      })
      if (claim.count !== 1) continue
      const outcome = await processSequence(db, seq, mode)
      if (outcome === 'sent') report.sent++
      else if (outcome === 'staged') report.staged++
      else if (outcome === 'stopped') report.stopped++
      else {
        report.waiting++
        // Left as-is (e.g. the delivery watch is still running): look again soon.
        await db.followUpSequence.updateMany({
          where: { id: seq.id, status: 'active', nextSendAt: { lte: new Date(now.getTime() + CLAIM_MS) } },
          data: { nextSendAt: new Date(now.getTime() + 2 * 3_600_000) },
        })
      }
    } catch (err) {
      report.errors++
      await db.followUpSequence
        .update({
          where: { id: seq.id },
          data: { lastError: (err instanceof Error ? err.message : String(err)).slice(0, 300) },
        })
        .catch(() => {})
    }
  }
  return report
}

// ————————————————————————————————— The ledger (for the Record page)

export type FollowUpEntry = {
  id: string
  company: string | null
  to: string | null
  subject: string | null
  status: string
  stopReason: string | null
  touchesDone: number
  endsOn: string
  startedOn: string
  lastTouchOn: string | null
  nextSendAt: string | null
  pendingProofId: string | null
  lastError: string | null
  history: { n: number; at: string; via: string; body?: string }[]
}

export async function listFollowUps(): Promise<FollowUpEntry[]> {
  if (!hasDb()) return []
  try {
    const db = await getDb()
    const rows = await db.followUpSequence.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
    const proofs = await db.reviewItem.findMany({
      where: { id: { in: rows.map((r: any) => r.proofId) } },
      select: { id: true, title: true, actionJson: true },
    })
    const byId = new Map(proofs.map((p: any) => [p.id, p]))
    return rows.map((r: any) => {
      const p: any = byId.get(r.proofId)
      const action = p?.actionJson ? JSON.parse(p.actionJson) : {}
      return {
        id: r.id,
        company: r.company ?? null,
        to: action.to ?? null,
        subject: action.subject ?? p?.title ?? null,
        status: r.status,
        stopReason: r.stopReason ?? null,
        touchesDone: r.touchesDone,
        endsOn: new Date(r.startedAt.getTime() + WINDOW_DAYS * DAY).toISOString(),
        startedOn: r.startedAt.toISOString(),
        lastTouchOn: r.lastTouchAt?.toISOString() ?? null,
        nextSendAt: r.status === 'active' ? (r.nextSendAt?.toISOString() ?? null) : null,
        pendingProofId: r.pendingProofId ?? null,
        lastError: r.lastError ?? null,
        history: readHistory(r),
      }
    })
  } catch {
    return []
  }
}

export async function stopFollowUps(id: string): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    await db.followUpSequence.update({
      where: { id },
      data: { status: 'stopped', stopReason: 'stopped by hand', nextSendAt: null },
    })
    return true
  } catch {
    return false
  }
}

export async function resumeFollowUps(id: string): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    const seq = await db.followUpSequence.findUnique({ where: { id } })
    if (!seq || seq.touchesDone >= MAX_TOUCHES) return false
    const next = planNextSend(new Date(), Math.random, seq.lastTouchAt)
    if (next.getTime() > seq.startedAt.getTime() + WINDOW_DAYS * DAY) return false
    await db.followUpSequence.update({
      where: { id },
      data: {
        status: 'active',
        stopReason: null,
        nextSendAt: next,
      },
    })
    return true
  } catch {
    return false
  }
}
