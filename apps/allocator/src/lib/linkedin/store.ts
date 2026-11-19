import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

// LinkedIn outreach: the tracker behind /linkedin. One row per person the
// reader wants to meet — the profile URL, the note drafted for them, where
// it stands, and (once it goes) exactly what was sent and by which path.
//
// The sending itself is browser automation that can only run where the
// reader's signed-in LinkedIn session lives (his own machine), so this
// layer is a queue: the page queues a row, the runner claims it, sends,
// and reports back.
//
// Two stores behind one interface. With a database, rows live in
// LinkedInProspect and the config in LinkedInConfig. Without one (the
// zero-env local desk), everything lives in .data/linkedin.json so the
// whole loop works on the machine that does the sending.

export const STATUSES = ['drafted', 'queued', 'sending', 'sent', 'accepted', 'replied', 'met', 'passed', 'failed'] as const
export type Status = (typeof STATUSES)[number]

// What the reader may set by hand. queued/sending/sent belong to the runner.
export const MANUAL_STATUSES: readonly Status[] = ['drafted', 'sent', 'accepted', 'replied', 'met', 'passed']

export type ProspectEvent = { at: string; kind: string; detail?: string }

export type Prospect = {
  id: string
  slug: string
  url: string
  fullName: string | null
  firstName: string | null
  nameConfirmed: boolean
  headline: string | null
  note: string | null
  status: Status
  subject: string | null
  message: string
  rehearse: boolean
  sentMessage: string | null
  channel: string | null
  sentAt: string | null
  queuedAt: string | null
  claimedAt: string | null
  error: string | null
  events: ProspectEvent[]
  createdAt: string
  updatedAt: string
}

export type Config = { template: string; subject: string; dailyCap: number }

// Sales Navigator's own limits on a message.
export const NOTE_LIMIT = 1900
export const SUBJECT_LIMIT = 200

export const DEFAULT_SUBJECT = 'Reaching out'

// Deliberately says nothing about firm or title: the reader fills that in
// once, in the standing draft on the page.
export const DEFAULT_TEMPLATE =
  "Hey {firstName} - I'm Dez. We haven't had a chance to meet, but I've been following your work + would love to connect and compare notes sometime."

export const DEFAULT_CONFIG: Config = { template: DEFAULT_TEMPLATE, subject: DEFAULT_SUBJECT, dailyCap: 15 }

const STALE_CLAIM_MS = 10 * 60 * 1000

// ── URL handling ───────────────────────────────────────────────────────

export function parseProfileUrl(raw: string): { slug: string; url: string } | null {
  let s = raw.trim()
  if (!s) return null
  if (!/^https?:\/\//i.test(s)) s = `https://${s.replace(/^\/+/, '')}`
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return null
  }
  if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null
  const m = u.pathname.match(/^\/in\/([^/]+)/i)
  if (!m) return null
  let slug: string
  try {
    slug = decodeURIComponent(m[1]).toLowerCase()
  } catch {
    slug = m[1].toLowerCase()
  }
  if (!slug) return null
  return { slug, url: `https://www.linkedin.com/in/${encodeURIComponent(slug)}/` }
}

const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1) : w)

// A first guess at the name from the vanity slug ("jane-doe-1a2b3c4" →
// Jane Doe). Only a guess: the runner reads the real name off the profile
// unless the reader has confirmed one.
export function guessName(slug: string): { fullName: string | null; firstName: string | null } {
  const parts = slug.split('-').filter(Boolean)
  while (parts.length > 1 && /\d/.test(parts[parts.length - 1])) parts.pop()
  const words = parts.filter((p) => /^[a-zÀ-ɏ]+$/i.test(p))
  if (words.length < 2) return { fullName: null, firstName: null }
  return { fullName: words.map(cap).join(' '), firstName: cap(words[0]) }
}

export function fillTemplate(text: string, firstName: string | null | undefined): string {
  return text.replace(/\{\s*first_?name\s*\}/gi, (firstName ?? '').trim())
}

export const hasNameToken = (text: string) => /\{\s*first_?name\s*\}/i.test(text)

// ── Stores ─────────────────────────────────────────────────────────────

const hasDb = () => Boolean(process.env.DATABASE_URL)
export const storeKind = (): 'database' | 'file' => (hasDb() ? 'database' : 'file')

const FILE = () => path.join(process.env.LINKEDIN_DATA_DIR || path.join(process.cwd(), '.data'), 'linkedin.json')

type FileShape = { prospects: Prospect[]; config: Partial<Config> }

// One writer at a time: every file mutation runs through this chain, so
// two requests (or a request and the runner's report) cannot interleave a
// read-modify-write.
const g = globalThis as unknown as { __linkedinFileLock?: Promise<unknown> }

async function readFile(): Promise<FileShape> {
  try {
    const data = JSON.parse(await fs.readFile(FILE(), 'utf8'))
    return { prospects: Array.isArray(data?.prospects) ? data.prospects : [], config: data?.config ?? {} }
  } catch {
    return { prospects: [], config: {} }
  }
}

function mutateFile<T>(fn: (data: FileShape) => T | Promise<T>): Promise<T> {
  const run = async () => {
    const data = await readFile()
    const out = await fn(data)
    const file = FILE()
    await fs.mkdir(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    await fs.writeFile(tmp, JSON.stringify(data, null, 2))
    await fs.rename(tmp, file)
    return out
  }
  const next = (g.__linkedinFileLock ?? Promise.resolve()).then(run, run)
  g.__linkedinFileLock = next.catch(() => {})
  return next
}

async function getDb() {
  const { db } = await import('../db')
  return db
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)

function fromRow(r: any): Prospect {
  let events: ProspectEvent[] = []
  try {
    events = r.eventsJson ? JSON.parse(r.eventsJson) : []
  } catch {}
  return {
    id: r.id,
    slug: r.slug,
    url: r.url,
    fullName: r.fullName ?? null,
    firstName: r.firstName ?? null,
    nameConfirmed: Boolean(r.nameConfirmed),
    headline: r.headline ?? null,
    note: r.note ?? null,
    status: r.status as Status,
    subject: r.subject ?? null,
    message: r.message ?? '',
    rehearse: Boolean(r.rehearse),
    sentMessage: r.sentMessage ?? null,
    channel: r.channel ?? null,
    sentAt: iso(r.sentAt),
    queuedAt: iso(r.queuedAt),
    claimedAt: iso(r.claimedAt),
    error: r.error ?? null,
    events,
    createdAt: iso(r.createdAt)!,
    updatedAt: iso(r.updatedAt)!,
  }
}

const DATE_FIELDS = ['sentAt', 'queuedAt', 'claimedAt'] as const

function toRowData(patch: Partial<Prospect>): Record<string, unknown> {
  const { events, id: _id, createdAt: _c, updatedAt: _u, ...rest } = patch
  const data: Record<string, unknown> = { ...rest }
  for (const f of DATE_FIELDS) if (f in data) data[f] = data[f] ? new Date(data[f] as string) : null
  if (events) data.eventsJson = JSON.stringify(events.slice(-40))
  return data
}

// ── Reads ──────────────────────────────────────────────────────────────

export async function listProspects(): Promise<Prospect[]> {
  await sweepStale()
  if (hasDb()) {
    const db = await getDb()
    const rows = await db.linkedInProspect.findMany({ orderBy: { createdAt: 'desc' } })
    return rows.map(fromRow)
  }
  const data = await readFile()
  return [...data.prospects].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getProspect(id: string): Promise<Prospect | null> {
  if (hasDb()) {
    const db = await getDb()
    const row = await db.linkedInProspect.findFirst({ where: { id } })
    return row ? fromRow(row) : null
  }
  return (await readFile()).prospects.find((p) => p.id === id) ?? null
}

const clampCap = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n))))

export async function getConfig(): Promise<Config> {
  if (hasDb()) {
    const db = await getDb()
    const row = await db.linkedInConfig.findFirst()
    return { template: row?.template?.trim() || DEFAULT_TEMPLATE, subject: row?.subject?.trim() || DEFAULT_SUBJECT, dailyCap: row?.dailyCap ?? DEFAULT_CONFIG.dailyCap }
  }
  return { ...DEFAULT_CONFIG, ...(await readFile()).config }
}

export async function setConfig(patch: Partial<Config>): Promise<Config> {
  const clean: Partial<Config> = {}
  if (typeof patch.template === 'string' && patch.template.trim()) clean.template = patch.template.trim().slice(0, 2000)
  if (typeof patch.subject === 'string' && patch.subject.trim()) clean.subject = patch.subject.trim().slice(0, SUBJECT_LIMIT)
  if (patch.dailyCap !== undefined && Number.isFinite(Number(patch.dailyCap))) clean.dailyCap = clampCap(patch.dailyCap)
  if (hasDb()) {
    const db = await getDb()
    // Scoped to the active workspace by the db layer; one row each.
    const res = await db.linkedInConfig.updateMany({ data: clean })
    if (res.count === 0) await db.linkedInConfig.create({ data: clean as any })
  } else {
    await mutateFile((data) => {
      data.config = { ...data.config, ...clean }
    })
  }
  return getConfig()
}

// How many real sends have gone out since local midnight.
export async function sentToday(): Promise<number> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  if (hasDb()) {
    const db = await getDb()
    return db.linkedInProspect.count({ where: { sentAt: { gte: start } } })
  }
  return (await readFile()).prospects.filter((p) => p.sentAt && new Date(p.sentAt) >= start).length
}

// ── Writes ─────────────────────────────────────────────────────────────

const event = (kind: string, detail?: string): ProspectEvent => ({ at: new Date().toISOString(), kind, ...(detail ? { detail } : {}) })

export async function addProspects(
  rawUrls: string[],
  note?: string | null
): Promise<{ added: Prospect[]; duplicates: string[]; invalid: string[] }> {
  const config = await getConfig()
  const added: Prospect[] = []
  const duplicates: string[] = []
  const invalid: string[] = []
  const seen = new Set<string>()
  const existing = new Set((await listProspects()).map((p) => p.slug))

  for (const raw of rawUrls) {
    if (!raw.trim()) continue
    const parsed = parseProfileUrl(raw)
    if (!parsed) {
      invalid.push(raw.trim())
      continue
    }
    if (existing.has(parsed.slug) || seen.has(parsed.slug)) {
      duplicates.push(parsed.slug)
      continue
    }
    seen.add(parsed.slug)
    const name = guessName(parsed.slug)
    const now = new Date().toISOString()
    const base: Prospect = {
      id: crypto.randomUUID(),
      slug: parsed.slug,
      url: parsed.url,
      fullName: name.fullName,
      firstName: name.firstName,
      nameConfirmed: false,
      headline: null,
      note: note?.trim() || null,
      status: 'drafted',
      subject: config.subject,
      message: config.template,
      rehearse: false,
      sentMessage: null,
      channel: null,
      sentAt: null,
      queuedAt: null,
      claimedAt: null,
      error: null,
      events: [event('filed')],
      createdAt: now,
      updatedAt: now,
    }
    if (hasDb()) {
      const db = await getDb()
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = base
      const row = await db.linkedInProspect.create({ data: toRowData(rest) as any })
      added.push(fromRow(row))
    } else {
      await mutateFile((data) => {
        data.prospects.push(base)
      })
      added.push(base)
    }
  }
  return { added, duplicates, invalid }
}

// The single mutation path: read the row, let `fn` decide the patch (or
// refuse with null), write it. In file mode the whole step is serialized.
async function mutate(
  id: string,
  fn: (p: Prospect) => { patch: Partial<Prospect>; log?: ProspectEvent } | null
): Promise<Prospect | null> {
  const apply = (p: Prospect) => {
    const res = fn(p)
    if (!res) return null
    const events = res.log ? [...p.events, res.log].slice(-40) : p.events
    return { ...res.patch, events, updatedAt: new Date().toISOString() }
  }
  if (hasDb()) {
    const db = await getDb()
    const row = await db.linkedInProspect.findFirst({ where: { id } })
    if (!row) return null
    const current = fromRow(row)
    const patch = apply(current)
    if (!patch) return null
    // Guard on the status we read: a concurrent claim or report wins and
    // this write quietly loses instead of clobbering it.
    const res = await db.linkedInProspect.updateMany({ where: { id, status: current.status }, data: toRowData(patch) as any })
    if (res.count === 0) return null
    return getProspect(id)
  }
  return mutateFile((data) => {
    const i = data.prospects.findIndex((p) => p.id === id)
    if (i < 0) return null
    const patch = apply(data.prospects[i])
    if (!patch) return null
    data.prospects[i] = { ...data.prospects[i], ...patch }
    return data.prospects[i]
  })
}

export async function editProspect(
  id: string,
  body: { message?: unknown; subject?: unknown; firstName?: unknown; fullName?: unknown; note?: unknown; status?: unknown }
): Promise<{ ok: boolean; prospect?: Prospect; error?: string }> {
  let error = 'not found'
  const prospect = await mutate(id, (p) => {
    const patch: Partial<Prospect> = {}
    let log: ProspectEvent | undefined
    const inFlight = p.status === 'queued' || p.status === 'sending'
    if (typeof body.message === 'string') {
      if (inFlight) {
        error = 'it is already on its way — cancel it first'
        return null
      }
      patch.message = body.message.slice(0, 8000)
    }
    if (typeof body.subject === 'string' && !inFlight && !p.sentAt) patch.subject = body.subject.trim().slice(0, SUBJECT_LIMIT) || null
    if (typeof body.firstName === 'string') {
      patch.firstName = body.firstName.trim().slice(0, 80) || null
      patch.nameConfirmed = Boolean(patch.firstName)
    }
    if (typeof body.fullName === 'string') patch.fullName = body.fullName.trim().slice(0, 160) || null
    if (typeof body.note === 'string') patch.note = body.note.trim().slice(0, 2000) || null
    if (typeof body.status === 'string') {
      const next = body.status as Status
      if (!MANUAL_STATUSES.includes(next)) {
        error = `status must be one of ${MANUAL_STATUSES.join(', ')}`
        return null
      }
      if (p.status === 'sending') {
        error = 'the runner has it right now'
        return null
      }
      if (next !== p.status) {
        patch.status = next
        patch.error = null
        if (next === 'drafted') patch.queuedAt = null
        // Marked sent by hand: the reader sent it himself, outside the runner.
        if (next === 'sent' && !p.sentAt) {
          patch.sentAt = new Date().toISOString()
          patch.sentMessage = fillTemplate(p.message, p.firstName)
          patch.subject = p.subject ? fillTemplate(p.subject, p.firstName) : null
          patch.channel = 'by hand'
        }
        log = event(p.status === 'queued' && next === 'drafted' ? 'cancelled' : 'marked', next)
      }
    }
    return { patch, log }
  })
  return prospect ? { ok: true, prospect } : { ok: false, error }
}

export async function removeProspect(id: string): Promise<boolean> {
  if (hasDb()) {
    const db = await getDb()
    const res = await db.linkedInProspect.deleteMany({ where: { id, status: { not: 'sending' } } })
    return res.count > 0
  }
  return mutateFile((data) => {
    const i = data.prospects.findIndex((p) => p.id === id && p.status !== 'sending')
    if (i < 0) return false
    data.prospects.splice(i, 1)
    return true
  })
}

// Queue a row for the runner. `rehearse` runs the browser all the way to
// the typed-out message and stops short of the send button.
export async function queueProspect(id: string, rehearse: boolean): Promise<{ ok: boolean; prospect?: Prospect; error?: string }> {
  let error = 'not found'
  const prospect = await mutate(id, (p) => {
    if (p.status === 'queued' || p.status === 'sending') {
      error = 'already on its way'
      return null
    }
    if (!rehearse && p.sentAt) {
      error = 'a message already went to this person — a second one is yours to send by hand'
      return null
    }
    if (!p.message.trim()) {
      error = 'there is no message to send'
      return null
    }
    if (hasNameToken(p.message) && p.nameConfirmed && !p.firstName) {
      error = 'the draft greets {firstName} but there is no first name'
      return null
    }
    return {
      patch: { status: 'queued', rehearse, queuedAt: new Date().toISOString(), error: null },
      log: event(rehearse ? 'queued rehearsal' : 'queued'),
    }
  })
  return prospect ? { ok: true, prospect } : { ok: false, error }
}

export type Job = {
  id: string
  url: string
  slug: string
  subject: string
  message: string
  firstName: string | null
  nameConfirmed: boolean
  rehearse: boolean
  noteLimit: number
  subjectLimit: number
}

// The runner's claim: the oldest queued row flips to `sending`, exactly
// once. Real sends respect the daily cap; rehearsals do not count.
export async function claimNext(): Promise<{ job: Job | null; reason?: string }> {
  await sweepStale()
  const [config, already] = await Promise.all([getConfig(), sentToday()])
  const capReached = already >= config.dailyCap
  const queued = (await listProspects())
    .filter((p) => p.status === 'queued')
    .sort((a, b) => (a.queuedAt ?? '').localeCompare(b.queuedAt ?? ''))
  if (queued.length === 0) return { job: null, reason: 'nothing queued' }

  for (const candidate of queued) {
    if (!candidate.rehearse && capReached) continue
    const claimed = await mutate(candidate.id, (p) =>
      p.status === 'queued'
        ? { patch: { status: 'sending', claimedAt: new Date().toISOString() }, log: event('runner picked it up') }
        : null
    )
    if (!claimed) continue
    return {
      job: {
        id: claimed.id,
        url: claimed.url,
        slug: claimed.slug,
        subject: claimed.subject?.trim() || config.subject,
        message: claimed.message,
        firstName: claimed.firstName,
        nameConfirmed: claimed.nameConfirmed,
        rehearse: claimed.rehearse,
        noteLimit: NOTE_LIMIT,
        subjectLimit: SUBJECT_LIMIT,
      },
    }
  }
  return { job: null, reason: capReached ? `daily cap of ${config.dailyCap} reached — the rest wait for tomorrow` : 'nothing claimable' }
}

export type Report = {
  id: string
  ok: boolean
  rehearse?: boolean
  channel?: string | null
  sentText?: string | null
  sentSubject?: string | null
  fullName?: string | null
  firstName?: string | null
  headline?: string | null
  error?: string | null
  // true when the failure is the runner's own (session expired, browser
  // would not start): the row goes back to queued rather than failed.
  requeue?: boolean
}

export async function reportResult(r: Report): Promise<Prospect | null> {
  return mutate(r.id, (p) => {
    if (p.status !== 'sending') return null
    const seen: Partial<Prospect> = {}
    if (r.headline) seen.headline = r.headline.slice(0, 300)
    if (r.fullName && !p.nameConfirmed) seen.fullName = r.fullName.slice(0, 160)
    if (r.firstName && !p.nameConfirmed) seen.firstName = r.firstName.slice(0, 80)

    if (!r.ok) {
      if (r.requeue) {
        return { patch: { ...seen, status: 'queued', claimedAt: null, error: r.error ?? null }, log: event('runner stopped', r.error ?? undefined) }
      }
      return {
        patch: { ...seen, status: 'failed', error: (r.error ?? 'failed').slice(0, 1000), claimedAt: null },
        log: event(p.rehearse ? 'rehearsal failed' : 'failed', r.error ?? undefined),
      }
    }
    if (p.rehearse) {
      return {
        patch: { ...seen, status: 'drafted', rehearse: false, claimedAt: null, queuedAt: null, error: null },
        log: event('rehearsed', `would go as ${r.channel ?? 'unknown'} — nothing was sent`),
      }
    }
    return {
      patch: {
        ...seen,
        status: 'sent',
        sentAt: new Date().toISOString(),
        sentMessage: (r.sentText ?? fillTemplate(p.message, p.firstName)).slice(0, 8000),
        subject: r.sentSubject?.slice(0, SUBJECT_LIMIT) ?? (p.subject ? fillTemplate(p.subject, p.firstName) : null),
        channel: r.channel ?? null,
        claimedAt: null,
        error: null,
      },
      log: event('sent', r.channel ?? undefined),
    }
  })
}

// A row stuck in `sending` means the runner died mid-act. It may or may
// not have sent — so it is failed with that warning, never re-queued.
let lastSweep = 0
async function sweepStale(): Promise<void> {
  if (Date.now() - lastSweep < 15_000) return
  lastSweep = Date.now()
  const cutoff = new Date(Date.now() - STALE_CLAIM_MS)
  const msg = 'The runner went quiet mid-send. Check the profile on LinkedIn before trying again — it may have gone out.'
  try {
    if (hasDb()) {
      const db = await getDb()
      await db.linkedInProspect.updateMany({ where: { status: 'sending', claimedAt: { lt: cutoff } }, data: { status: 'failed', error: msg } })
      return
    }
    const data = await readFile()
    if (!data.prospects.some((p) => p.status === 'sending' && p.claimedAt && new Date(p.claimedAt) < cutoff)) return
    await mutateFile((d) => {
      for (const p of d.prospects) {
        if (p.status === 'sending' && p.claimedAt && new Date(p.claimedAt) < cutoff) {
          p.status = 'failed'
          p.error = msg
          p.events = [...p.events, event('failed', 'runner went quiet')].slice(-40)
        }
      }
    })
  } catch {}
}

// ── The sending machine's heartbeat ────────────────────────────────────
// One instance-wide row, outside any workspace: the runner is a machine,
// not a tenant. Written at most once a minute per server instance.
const RUNNER_ROW = '_runner'
let lastBeat = 0

export async function markRunnerSeen(): Promise<void> {
  if (!hasDb() || Date.now() - lastBeat < 60_000) return
  lastBeat = Date.now()
  try {
    const { rawDb } = await import('../db')
    await rawDb.linkedInConfig.upsert({
      where: { workspaceId: RUNNER_ROW },
      create: { workspaceId: RUNNER_ROW, runnerSeenAt: new Date() },
      update: { runnerSeenAt: new Date() },
    })
  } catch {}
}

export async function runnerSeenAt(): Promise<string | null> {
  if (!hasDb()) return null
  try {
    const { rawDb } = await import('../db')
    const row = await rawDb.linkedInConfig.findUnique({ where: { workspaceId: RUNNER_ROW } })
    return iso(row?.runnerSeenAt)
  } catch {
    return null
  }
}
