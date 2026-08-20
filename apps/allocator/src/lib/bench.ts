// The Bench: the provider bake-off. Rows are companies under test; each of
// the research engines fills its cell from the identical charge, and the
// reader crowns the winner. The sheet is a ledger — every trial is kept,
// so win rates and latencies accumulate meaning across evenings.

import { RESEARCH_PROVIDERS, providerById } from './research'
import type { ResearchInput } from './research'

const hasDb = () => Boolean(process.env.DATABASE_URL)

async function getDb() {
  const { db } = await import('./db')
  return db
}

export type TrialRecord = {
  id: string
  provider: string
  status: string
  fields: {
    founderFirstName?: string | null
    founderFullName?: string | null
    context?: string | null
    websiteUrl?: string | null
  } | null
  citations: { title?: string; url: string }[]
  latencyMs: number | null
  error: string | null
  ranOn: string | null
}

export type BenchRowRecord = {
  id: string
  companyName: string
  founderHint: string | null
  websiteHint: string | null
  contextHint: string | null
  winner: string | null
  notes: string | null
  trials: Record<string, TrialRecord> // latest per provider
}

export type BenchSheet = {
  live: boolean
  providers: { id: string; label: string; keyed: boolean }[]
  rows: BenchRowRecord[]
  tally: Record<string, { wins: number; runs: number; failures: number; avgLatencyMs: number | null }>
}

const keyedFor = (id: string): boolean => {
  if (id === 'anthropic') return Boolean(process.env.ANTHROPIC_API_KEY)
  if (id === 'openai') return Boolean(process.env.OPENAI_API_KEY)
  if (id === 'exa') return Boolean(process.env.EXA_API_KEY)
  if (id === 'parallel') return Boolean(process.env.PARALLEL_API_KEY)
  return false
}

const parseJson = (s: string | null | undefined): any => {
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

const TZ = process.env.APP_TIMEZONE ?? 'America/New_York'
const dateLabel = (d: Date | null) =>
  d
    ? new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'long' }).format(d)
    : null

const toTrial = (t: any): TrialRecord => ({
  id: t.id,
  provider: t.provider,
  status: t.status,
  fields: parseJson(t.outputJson),
  citations: parseJson(t.citationsJson) ?? [],
  latencyMs: t.latencyMs ?? null,
  error: t.error ?? null,
  ranOn: dateLabel(t.finishedAt ?? t.startedAt ?? null),
})

// A trial can be orphaned mid-run when the platform's function window
// closes under it — the janitor turns those eternal spinners into honest
// failures the Retry button can pick up. Six minutes clears the 240s
// deadline with slack.
const STALE_MS = 6 * 60_000

export async function listBench(): Promise<BenchSheet> {
  const providers = RESEARCH_PROVIDERS.map((p) => ({ id: p.id, label: p.label, keyed: keyedFor(p.id) }))
  if (!hasDb()) return { live: false, providers, rows: [], tally: {} }
  try {
    const db = await getDb()
    await db.benchTrial
      .updateMany({
        where: {
          status: { in: ['queued', 'running'] },
          updatedAt: { lt: new Date(Date.now() - STALE_MS) },
        },
        data: { status: 'failed', error: 'the run was cut off before it finished — Retry sends it back out' },
      })
      .catch(() => {})
    const rows = await db.benchRow.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
    const trials = rows.length
      ? await db.benchTrial.findMany({
          where: { rowId: { in: rows.map((r: any) => r.id) } },
          orderBy: { createdAt: 'asc' },
        })
      : []

    // Latest trial per (row, provider) fills the cell; the full list
    // feeds the tally so history still counts.
    const latest = new Map<string, any>()
    for (const t of trials as any[]) latest.set(`${t.rowId}|${t.provider}`, t)

    const tally: BenchSheet['tally'] = {}
    for (const p of providers) tally[p.id] = { wins: 0, runs: 0, failures: 0, avgLatencyMs: null }
    const latencies: Record<string, number[]> = {}
    for (const t of trials as any[]) {
      const bucket = tally[t.provider]
      if (!bucket) continue
      if (t.status === 'done' || t.status === 'failed') bucket.runs++
      if (t.status === 'failed') bucket.failures++
      if (t.status === 'done' && typeof t.latencyMs === 'number') {
        ;(latencies[t.provider] ??= []).push(t.latencyMs)
      }
    }
    for (const row of rows as any[]) {
      if (row.winner && tally[row.winner]) tally[row.winner].wins++
    }
    for (const [id, arr] of Object.entries(latencies)) {
      tally[id].avgLatencyMs = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
    }

    return {
      live: true,
      providers,
      rows: (rows as any[]).map((r) => ({
        id: r.id,
        companyName: r.companyName,
        founderHint: r.founderHint,
        websiteHint: r.websiteHint,
        contextHint: r.contextHint,
        winner: r.winner,
        notes: r.notes,
        trials: Object.fromEntries(
          providers
            .map((p) => [p.id, latest.get(`${r.id}|${p.id}`)])
            .filter(([, t]) => t)
            .map(([id, t]) => [id, toTrial(t)])
        ),
      })),
      tally,
    }
  } catch {
    return { live: false, providers, rows: [], tally: {} }
  }
}

// A bare URL (or naked domain) pasted into the Company field seats the
// row anyway: the name derives from the domain and the URL files itself
// as the identity anchor — one-paste entry.
const URLISH = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i

export async function addBenchRow(input: {
  companyName: string
  founderHint?: string
  websiteHint?: string
  contextHint?: string
}): Promise<string | null> {
  if (!hasDb() || !input.companyName.trim()) return null
  try {
    let name = input.companyName.trim()
    let site =
      input.websiteHint && /^https?:\/\//.test(input.websiteHint.trim())
        ? input.websiteHint.trim()
        : ''
    if (URLISH.test(name)) {
      try {
        const url = new URL(name.includes('://') ? name : `https://${name}`)
        const host = url.hostname.replace(/^www\./, '')
        if (!site) site = `https://${host}`
        const label = host.split('.')[0]
        name = label.charAt(0).toUpperCase() + label.slice(1)
      } catch {}
    }
    const db = await getDb()
    const row = await db.benchRow.create({
      data: {
        companyName: name.slice(0, 120),
        founderHint: input.founderHint?.trim().slice(0, 120) || null,
        websiteHint: site ? site.slice(0, 500) : null,
        contextHint: input.contextHint?.trim().slice(0, 4000) || null,
      },
    })
    return row.id
  } catch {
    return null
  }
}

// Pull the Register onto the Bench: one row per entry not already seated
// (matched loosely by name). Anchors come along — the engines deserve the
// same identity pins the incumbent gets.
export async function importRegister(): Promise<{ added: number }> {
  if (!hasDb()) return { added: 0 }
  try {
    const db = await getDb()
    const { nameKeyOf } = await import('./context')
    const companies = await db.companyContext.findMany({ orderBy: { updatedAt: 'desc' }, take: 100 })
    const rows = await db.benchRow.findMany({ take: 200 })
    const seated = new Set((rows as any[]).map((r) => nameKeyOf(r.companyName)))
    let added = 0
    for (const c of companies as any[]) {
      if (seated.has(nameKeyOf(c.name))) continue
      await db.benchRow.create({
        data: {
          companyName: c.name,
          founderHint: c.founderFullName ?? c.founderFirstName ?? null,
          websiteHint: c.websiteUrl ?? null,
          contextHint: c.context ?? null,
        },
      })
      added++
    }
    return { added }
  } catch {
    return { added: 0 }
  }
}

export async function removeBenchRow(id: string): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    await db.benchTrial.deleteMany({ where: { rowId: id } })
    await db.benchRow.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

export async function setVerdict(id: string, winner: string | null): Promise<boolean> {
  if (!hasDb()) return false
  if (winner && !providerById(winner)) return false
  try {
    const db = await getDb()
    await db.benchRow.update({ where: { id }, data: { winner } })
    return true
  } catch {
    return false
  }
}

export async function setNotes(id: string, notes: string): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    await db.benchRow.update({ where: { id }, data: { notes: notes.trim().slice(0, 2000) || null } })
    return true
  } catch {
    return false
  }
}

// Queue one trial per keyed provider for a row. Execution happens behind
// the response (runQueuedTrials); the sheet's polling watches them land.
export async function queueTrials(rowId: string): Promise<string[]> {
  if (!hasDb()) return []
  try {
    const db = await getDb()
    const row = await db.benchRow.findUnique({ where: { id: rowId } })
    if (!row) return []
    const ids: string[] = []
    for (const p of RESEARCH_PROVIDERS) {
      const trial = await db.benchTrial.create({
        data: {
          rowId,
          provider: p.id,
          ...(keyedFor(p.id)
            ? {}
            : { status: 'failed', error: `no ${p.id.toUpperCase()} key filed — add it to the environment` }),
        },
      })
      if (keyedFor(p.id)) ids.push(trial.id)
    }
    return ids
  } catch {
    return []
  }
}

// Re-queue only what failed: one fresh trial per keyed provider whose
// latest run on this row ended in failure. The Retry column's verb.
export async function queueRetries(rowId: string): Promise<string[]> {
  if (!hasDb()) return []
  try {
    const db = await getDb()
    const trials = await db.benchTrial.findMany({ where: { rowId }, orderBy: { createdAt: 'asc' } })
    const latest = new Map<string, any>()
    for (const t of trials as any[]) latest.set(t.provider, t)
    const ids: string[] = []
    for (const p of RESEARCH_PROVIDERS) {
      const last = latest.get(p.id)
      if (!last || last.status !== 'failed' || !keyedFor(p.id)) continue
      const trial = await db.benchTrial.create({ data: { rowId, provider: p.id } })
      ids.push(trial.id)
    }
    return ids
  } catch {
    return []
  }
}

// Run queued trials in per-provider lanes: the four vendors work in
// parallel, but each vendor takes its trials one at a time — a sheet-wide
// run no longer fires eight concurrent calls at one API, which is what
// rate-limits the slow ones past the 240s deadline. Each cell still lands
// (or fails) independently, every failure written to the cell, never
// swallowed. Called from after(), inside the pinned workspace.
export async function runQueuedTrials(trialIds: string[]): Promise<void> {
  if (!hasDb() || trialIds.length === 0) return
  const db = await getDb()
  const trials = await db.benchTrial.findMany({ where: { id: { in: trialIds } } })
  const lanes = new Map<string, string[]>()
  for (const t of trials as any[]) {
    const lane = lanes.get(t.provider) ?? []
    lane.push(t.id)
    lanes.set(t.provider, lane)
  }
  await Promise.allSettled(
    [...lanes.values()].map(async (lane) => {
      for (const id of lane) await runTrial(db, id)
    })
  )
}

async function runTrial(db: any, trialId: string): Promise<void> {
  const trial = await db.benchTrial.findUnique({ where: { id: trialId } })
  if (!trial || trial.status !== 'queued') return
  const row = await db.benchRow.findUnique({ where: { id: trial.rowId } })
  if (!row) return
  const provider = providerById(trial.provider)
  if (!provider) return

  await db.benchTrial.update({
    where: { id: trialId },
    data: { status: 'running', startedAt: new Date() },
  })

  const input: ResearchInput = {
    name: row.companyName,
    founderFullName: row.founderHint,
    websiteUrl: row.websiteHint,
    context: row.contextHint,
  }
  try {
    const result = await provider.run(input)
    await db.benchTrial.update({
      where: { id: trialId },
      data: {
        status: 'done',
        outputJson: JSON.stringify(result.fields).slice(0, 20000),
        citationsJson: JSON.stringify(result.citations.slice(0, 20)).slice(0, 10000),
        latencyMs: result.latencyMs,
        error: null,
        finishedAt: new Date(),
      },
    })
  } catch (err) {
    const reason = (err instanceof Error ? err.message : String(err)).slice(0, 500)
    console.error(`[bench] ${trial.provider} on "${row.companyName}" failed: ${reason}`)
    await db.benchTrial
      .update({
        where: { id: trialId },
        data: { status: 'failed', error: reason, finishedAt: new Date() },
      })
      .catch(() => {})
  }
}

// File the crowned cell into the Register — the bake-off's whole point.
// Merge-style via upsertCompany, so a sparse result never clobbers facts.
export async function promoteTrial(rowId: string, provider: string): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    const trial = await db.benchTrial.findFirst({
      where: { rowId, provider, status: 'done' },
      orderBy: { createdAt: 'desc' },
    })
    const row = await db.benchRow.findUnique({ where: { id: rowId } })
    if (!trial || !row) return false
    const fields = parseJson((trial as any).outputJson)
    if (!fields?.context) return false
    const { upsertCompany } = await import('./context')
    const company = await upsertCompany({
      name: row.companyName,
      founderFirstName: fields.founderFirstName ?? undefined,
      founderFullName: fields.founderFullName ?? undefined,
      context: String(fields.context),
      websiteUrl: fields.websiteUrl ?? undefined,
      enriched: true,
    })
    return Boolean(company)
  } catch {
    return false
  }
}
