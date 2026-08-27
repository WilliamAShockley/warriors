// OG — the cold-draft observation bench, workflow-per-column edition.
// Every column on the sheet is its own small workflow: a prompt template
// (row variables fill in at run time) routed to a provider the reader
// picks — Parallel, Exa, OpenAI (each web research), Anthropic web
// search, plain Claude (drafting, no web), or Fixed Text (no call at
// all; the template IS the output). The reader edits both, per column,
// from the section beneath the sheet.
//
// A row runs in two stages:
//   Stage 1 — research context: Company Description · CEO · Product ·
//     Category. Variables: {input} {company} {website} {date}.
//   Stage 2 — the CED components: Greeting · Fixed-Intro · Var-1/2/3 ·
//     Closing · Ask. Variables: stage 1's plus {description} {ceo}
//     {ceoFirst} {product} {category} {dezContext}.
// The email then assembles in code (subject too), the straight-through
// checks run over it, and every cell's output, error, provider, and
// latency file on the row for triage.

import { anthropic } from './claude'
import { runStpChecks, type StpResult } from './stp'

const hasDb = () => Boolean(process.env.DATABASE_URL)

async function getDb() {
  const { db } = await import('./db')
  return db
}

const OG_MODEL = process.env.OG_MODEL || process.env.APOLLO_SKILL_MODEL || 'claude-opus-5'
const SEARCH_MODEL = process.env.ENRICH_MODEL || 'claude-sonnet-5'
const COLUMN_TIMEOUT_MS = 240_000

export type OgTab = 'name' | 'url'

// ── Providers ─────────────────────────────────────────────────────

export type OgProviderId = 'parallel' | 'exa' | 'openai' | 'anthropic' | 'claude' | 'fixed'

export const OG_PROVIDERS: { id: OgProviderId; label: string }[] = [
  { id: 'parallel', label: 'Parallel Web Systems' },
  { id: 'exa', label: 'Exa (answer)' },
  { id: 'openai', label: 'OpenAI (web search)' },
  { id: 'anthropic', label: 'Anthropic (web search)' },
  { id: 'claude', label: 'Claude (no web — drafting)' },
  { id: 'fixed', label: 'Fixed text (no call)' },
]

// ── Columns and their default workflows ───────────────────────────

export type OgWorkflow = { prompt: string; provider: OgProviderId }
export type OgWorkflows = Record<string, OgWorkflow>

export type OgColumnDef = { key: string; label: string; stage: 1 | 2 }

export const OG_COLUMNS: OgColumnDef[] = [
  { key: 'description', label: 'Company Description', stage: 1 },
  { key: 'ceo', label: 'CEO', stage: 1 },
  { key: 'product', label: 'Product', stage: 1 },
  { key: 'category', label: 'Category', stage: 1 },
  { key: 'greeting', label: 'CED-Greeting', stage: 2 },
  { key: 'fixedIntro', label: 'CED-Fixed-Intro', stage: 2 },
  { key: 'var1', label: 'CED-Var-1', stage: 2 },
  { key: 'var2', label: 'CED-Var-2', stage: 2 },
  { key: 'var3', label: 'CED-Var-3', stage: 2 },
  { key: 'closing', label: 'CED-Closing', stage: 2 },
  { key: 'ask', label: 'CED-Ask', stage: 2 },
]

export const OG_STAGE1_VARS = ['{input}', '{company}', '{website}', '{date}']
export const OG_STAGE2_VARS = [
  ...OG_STAGE1_VARS,
  '{description}',
  '{ceo}',
  '{ceoFirst}',
  '{product}',
  '{category}',
  '{dezContext}',
]

const DEZ_VOICE_LINE = `Write ONE sentence in Dez's exact cold-email voice: warm, direct, opinionated, contractions, comma splices welcome, spaced hyphens " - " never em dashes, "+" as a connector, nothing corporate. Reply with ONLY the sentence.`

export const DEFAULT_OG_WORKFLOWS: OgWorkflows = {
  description: {
    provider: 'parallel',
    prompt: `You are a VC analyst sourcing for your boss. Research this company: {input}. In at most 2 sentences, describe succinctly what the company does. Reply with ONLY those sentences — no preamble.`,
  },
  ceo: {
    provider: 'parallel',
    prompt: `You are a VC analyst sourcing for your boss. Who is the CEO of this company: {input}? Reply with ONLY the CEO's full name. If no CEO is publicly established, reply with the founder most likely to be CEO. If you cannot establish anyone, reply exactly: Unknown`,
  },
  product: {
    provider: 'parallel',
    prompt: `You are a VC analyst sourcing for your boss. What is the product of this company: {input}? Describe their product in ONE sentence, maximum. Reply with ONLY that sentence.`,
  },
  category: {
    provider: 'parallel',
    prompt: `You are a VC analyst sourcing for your boss. Research this company: {input}. File it into exactly one category: "Digital Assets" (crypto, stablecoins, tokenization, on-chain infrastructure), "Vertical AI" (AI applied to a specific industry workflow), or "Other". Reply with ONLY the category name.`,
  },
  greeting: {
    provider: 'fixed',
    prompt: `Hey {ceoFirst} -`,
  },
  fixedIntro: {
    provider: 'fixed',
    prompt: `Hope this note finds you well! I'm Dez, I'm a Principal here at FirstMark, we're an early stage, Series A focused VC firm based here in NYC, and we were early investors in Pinterest, Shopify, DraftKings and a whole host of other great companies.`,
  },
  var1: {
    provider: 'claude',
    prompt: `${DEZ_VOICE_LINE}

The sentence is the HOOK of a cold email to {ceo} at {company} - why Dez is reaching out to THIS company now ("I came across what you're doing at {company}..." energy), grounded ONLY in this research:
What they do: {description}
Product: {product}`,
  },
  var2: {
    provider: 'claude',
    prompt: `${DEZ_VOICE_LINE}

The sentence is the THESIS LINE of a cold email to {company} ({category}): Dez's dated, opinionated view of the space this company sits in ("I think X is where Y was in 2020/2021" energy). His own standing context, if any - make it sound like HIS current thinking, never quote it as research:
{dezContext}`,
  },
  var3: {
    provider: 'claude',
    prompt: `${DEZ_VOICE_LINE}

The sentence is the CONNECT of a cold email: why {company} fits Dez's thesis - what excites him about their approach, grounded ONLY in this research:
What they do: {description}
Product: {product}`,
  },
  closing: {
    provider: 'fixed',
    prompt: `Lmk what you think. Hope to hear from you soon!`,
  },
  ask: {
    provider: 'fixed',
    prompt: `Would you be open to hopping on a call some time soon? It would be great to begin a dialogue, learn more about you and your vision + I'm happy to share how we partner with founders here at FirstMark.`,
  },
}

const VALID_PROVIDERS = new Set(OG_PROVIDERS.map((p) => p.id))

export async function getOgWorkflows(): Promise<OgWorkflows> {
  const merged: OgWorkflows = { ...DEFAULT_OG_WORKFLOWS }
  if (!hasDb()) return merged
  try {
    const db = await getDb()
    const { activeWorkspaceId } = await import('./tenant')
    const row = await db.readerSetting.findUnique({ where: { id: await activeWorkspaceId() } })
    if (row?.ogWorkflowsJson) {
      const saved = JSON.parse(row.ogWorkflowsJson) as OgWorkflows
      for (const col of OG_COLUMNS) {
        const w = saved[col.key]
        if (w?.prompt?.trim() && VALID_PROVIDERS.has(w.provider)) {
          merged[col.key] = { prompt: w.prompt, provider: w.provider }
        }
      }
    }
  } catch {}
  return merged
}

export async function setOgWorkflows(workflows: OgWorkflows): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const cleaned: OgWorkflows = {}
    for (const col of OG_COLUMNS) {
      const w = workflows[col.key]
      if (w?.prompt?.trim() && VALID_PROVIDERS.has(w.provider)) {
        cleaned[col.key] = { prompt: String(w.prompt), provider: w.provider }
      }
    }
    const db = await getDb()
    const { activeWorkspaceId, ensureAdopted } = await import('./tenant')
    const { getReaderName } = await import('./settings')
    await ensureAdopted()
    const ws = await activeWorkspaceId()
    await db.readerSetting.upsert({
      where: { id: ws },
      create: { id: ws, name: await getReaderName(), ogWorkflowsJson: JSON.stringify(cleaned) },
      update: { ogWorkflowsJson: JSON.stringify(cleaned) },
    })
    return true
  } catch {
    return false
  }
}

// ── The provider router: one prompt in, one text answer out ───────

const deadline = <T>(p: Promise<T>, label: string): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} exceeded ${COLUMN_TIMEOUT_MS / 1000}s`)), COLUMN_TIMEOUT_MS)
    ),
  ])

async function askParallel(prompt: string): Promise<string> {
  const key = process.env.PARALLEL_API_KEY
  if (!key) throw new Error('no PARALLEL_API_KEY filed')
  const headers = { 'Content-Type': 'application/json', 'x-api-key': key }
  const BASE = 'https://api.parallel.ai/v1/tasks/runs'
  const created = await fetch(BASE, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      input: prompt,
      processor: process.env.OG_PARALLEL_PROCESSOR || 'core-fast',
      task_spec: {
        output_schema: { type: 'text', description: 'Answer the request plainly and directly.' },
      },
    }),
  })
  if (!created.ok) throw new Error(`Parallel answered ${created.status}: ${(await created.text()).slice(0, 200)}`)
  const runId = ((await created.json()) as any)?.run_id
  if (!runId) throw new Error('Parallel accepted the task but returned no run id')
  const started = Date.now()
  while (true) {
    if (Date.now() - started > COLUMN_TIMEOUT_MS) throw new Error('the Parallel run timed out')
    const res = await fetch(`${BASE}/${runId}`, { headers })
    if (!res.ok) throw new Error(`Parallel answered ${res.status}`)
    const status = String(((await res.json()) as any)?.status ?? '')
    if (status === 'completed') break
    if (status === 'failed' || status === 'cancelled') throw new Error(`the Parallel run ${status}`)
    await new Promise((r) => setTimeout(r, 4000))
  }
  const resultRes = await fetch(`${BASE}/${runId}/result`, { headers })
  if (!resultRes.ok) throw new Error(`Parallel answered ${resultRes.status}`)
  const result: any = await resultRes.json()
  const content = result?.output?.content ?? result?.output ?? result
  const text = typeof content === 'string' ? content : String(content?.content ?? JSON.stringify(content))
  if (!text.trim()) throw new Error('Parallel returned no text')
  return text.trim()
}

async function askExa(prompt: string): Promise<string> {
  const key = process.env.EXA_API_KEY
  if (!key) throw new Error('no EXA_API_KEY filed')
  const res = await fetch('https://api.exa.ai/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify({ query: prompt, text: true }),
  })
  if (!res.ok) throw new Error(`Exa answered ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const text = String(((await res.json()) as any)?.answer ?? '')
  if (!text.trim()) throw new Error('Exa returned no answer text')
  return text.trim()
}

async function askOpenAI(prompt: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('no OPENAI_API_KEY filed')
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.BENCH_OPENAI_MODEL || 'gpt-5.5',
      input: prompt,
      tools: [{ type: 'web_search' }],
      max_output_tokens: 16000,
    }),
  })
  if (!res.ok) throw new Error(`OpenAI answered ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data: any = await res.json()
  let text = ''
  for (const item of data?.output ?? []) {
    if (item?.type !== 'message') continue
    for (const part of item?.content ?? []) {
      if (part?.type === 'output_text') text += (text ? '\n' : '') + (part.text ?? '')
    }
  }
  if (!text.trim()) throw new Error(`OpenAI returned no text (status: ${data?.status ?? 'unknown'})`)
  return text.trim()
}

async function askAnthropicSearch(prompt: string): Promise<string> {
  const stream = anthropic.messages.stream({
    model: SEARCH_MODEL,
    max_tokens: 4000,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 } as any],
    messages: [{ role: 'user', content: prompt }],
  } as any)
  const msg: any = await stream.finalMessage()
  const text = (msg.content as any[])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  if (!text.trim()) throw new Error('the Anthropic search returned no text')
  return text.trim()
}

async function askClaude(prompt: string): Promise<string> {
  const msg: any = await anthropic.messages.create({
    model: OG_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  } as any)
  const text = (msg.content as any[])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  if (!text.trim()) throw new Error('Claude returned no text')
  return text.trim()
}

async function askProvider(provider: OgProviderId, prompt: string): Promise<string> {
  switch (provider) {
    case 'parallel':
      return deadline(askParallel(prompt), 'the Parallel run')
    case 'exa':
      return deadline(askExa(prompt), 'the Exa answer')
    case 'openai':
      return deadline(askOpenAI(prompt), 'the OpenAI search')
    case 'anthropic':
      return deadline(askAnthropicSearch(prompt), 'the Anthropic search')
    case 'claude':
      return deadline(askClaude(prompt), 'the Claude draft')
    case 'fixed':
      return prompt // the rendered template IS the output
  }
}

// ── Rows and the sheet ────────────────────────────────────────────

export type OgCell = { output?: string; error?: string; provider: OgProviderId; ms?: number }
export type OgCells = Record<string, OgCell>

export type OgRowRecord = {
  id: string
  tab: OgTab
  input: string
  status: string // running | done | failed
  company: string | null
  cells: OgCells
  subject: string | null
  body: string | null
  stp: StpResult[]
  error: string | null
  ranOn: string | null
}

export type OgSheet = { live: boolean; tab: OgTab; rows: OgRowRecord[] }

const parseJson = <T>(s: string | null): T | null => {
  if (!s) return null
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

export async function listOg(tab: OgTab): Promise<OgSheet> {
  if (!hasDb()) return { live: false, tab, rows: [] }
  const db = await getDb()
  const rows = await db.ogRun.findMany({ where: { tab }, orderBy: { createdAt: 'desc' }, take: 100 })
  return {
    live: true,
    tab,
    rows: rows.map((r: any): OgRowRecord => {
      const draft = parseJson<{ subject?: string; body?: string }>(r.draftJson)
      return {
        id: r.id,
        tab: r.tab as OgTab,
        input: r.input,
        status: r.status,
        company: r.company,
        cells: parseJson<OgCells>(r.cellsJson) ?? {},
        subject: draft?.subject ?? null,
        body: draft?.body ?? null,
        stp: parseJson<StpResult[]>(r.stpJson) ?? [],
        error: r.error,
        ranOn: r.updatedAt?.toISOString?.() ?? null,
      }
    }),
  }
}

// ── Seating and running a row ─────────────────────────────────────

const companyFromUrl = (input: string): { company: string; websiteUrl: string } => {
  const websiteUrl = /^https?:\/\//.test(input) ? input : `https://${input}`
  const hostname = websiteUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  const raw = hostname.split('.')[0] || input
  return { company: raw.charAt(0).toUpperCase() + raw.slice(1), websiteUrl }
}

export async function seatOgRun(tab: OgTab, input: string): Promise<string | null> {
  if (!hasDb()) return null
  const db = await getDb()
  const row = await db.ogRun.create({ data: { tab, input: input.trim(), status: 'running' } })
  return row.id
}

export async function strikeOgRun(id: string): Promise<void> {
  if (!hasDb()) return
  const db = await getDb()
  await db.ogRun.deleteMany({ where: { id } })
}

const render = (template: string, vars: Record<string, string>): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), template)

async function runColumn(key: string, w: OgWorkflow, vars: Record<string, string>): Promise<OgCell> {
  const started = Date.now()
  try {
    const output = await askProvider(w.provider, render(w.prompt, vars))
    return { output, provider: w.provider, ms: Date.now() - started }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : `the ${key} column failed`,
      provider: w.provider,
      ms: Date.now() - started,
    }
  }
}

/**
 * The trial, run post-response. Stage 1 fans the research columns out in
 * parallel through their routed providers; stage 2 builds the CED
 * components with stage 1's outputs as variables; then the email
 * assembles in code and the straight-through checks run over it. A
 * failed column files its error on its own cell — the rest of the row
 * still lands.
 */
export async function runOgRow(id: string): Promise<void> {
  if (!hasDb()) return
  const db = await getDb()
  const row = await db.ogRun.findFirst({ where: { id } })
  if (!row) return

  try {
    const seat =
      row.tab === 'url'
        ? companyFromUrl(row.input)
        : { company: row.input.trim(), websiteUrl: '' }
    const workflows = await getOgWorkflows()
    const cells: OgCells = {}

    const stage1Vars: Record<string, string> = {
      input: row.input.trim(),
      company: seat.company,
      website: seat.websiteUrl,
      date: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()),
    }

    // Stage 1 — the research columns, in parallel.
    const stage1 = OG_COLUMNS.filter((c) => c.stage === 1)
    const stage1Results = await Promise.all(
      stage1.map((c) => runColumn(c.key, workflows[c.key], stage1Vars))
    )
    stage1.forEach((c, i) => (cells[c.key] = stage1Results[i]))
    await db.ogRun.update({
      where: { id },
      data: { company: seat.company, cellsJson: JSON.stringify(cells), founderName: cells.ceo?.output ?? null },
    })

    // Stage 2 — the CED components, with stage 1's outputs as variables.
    const ceo = cells.ceo?.output?.trim() ?? ''
    const ceoKnown = ceo && !/^unknown\b/i.test(ceo)
    const dezContext = await import('./reader-context')
      .then((m) => m.contextNotesBlock())
      .catch(() => '')
    const stage2Vars: Record<string, string> = {
      ...stage1Vars,
      description: cells.description?.output ?? '',
      ceo: ceoKnown ? ceo : '',
      ceoFirst: ceoKnown ? ceo.split(/\s+/)[0].replace(/[^A-Za-z'’.-]/g, '') : 'there',
      product: cells.product?.output ?? '',
      category: cells.category?.output ?? '',
      dezContext: dezContext || '(none on file)',
    }

    const stage2 = OG_COLUMNS.filter((c) => c.stage === 2)
    const stage2Results = await Promise.all(
      stage2.map((c) => runColumn(c.key, workflows[c.key], stage2Vars))
    )
    stage2.forEach((c, i) => (cells[c.key] = stage2Results[i]))

    // Assembly, in code: paragraph one is greeting + fixed intro + the
    // three vars; then the ask, the closing, the bare sign-off.
    const part = (k: string) => cells[k]?.output?.trim() ?? ''
    const paragraphOne = [part('greeting'), part('fixedIntro'), part('var1'), part('var2'), part('var3')]
      .filter(Boolean)
      .join(' ')
    const subject = `Reaching Out - ${seat.company} <> FirstMark`
    const body = [paragraphOne, part('ask'), part('closing'), 'Dez'].filter(Boolean).join('\n\n')

    // The straight-through checks, over the assembled email. Grounding is
    // what stage 1 actually established.
    const grounding = stage1
      .map((c) => `${c.label}: ${cells[c.key]?.output ?? '(failed)'}`)
      .join('\n')
    const { findCompany } = await import('./context')
    const register = await findCompany(seat.company).catch(() => null)
    const stp = await runStpChecks({
      body,
      subject,
      to: null,
      mode: 'cold',
      audience: 'founder',
      grounding,
      register: register
        ? { founderFirstName: register.founderFirstName ?? null, founderFullName: register.founderFullName ?? null }
        : null,
    })

    await db.ogRun.update({
      where: { id },
      data: {
        status: 'done',
        cellsJson: JSON.stringify(cells),
        draftJson: JSON.stringify({ subject, body }),
        stpJson: JSON.stringify(stp),
        error: null,
      },
    })
  } catch (err) {
    await db.ogRun.update({
      where: { id },
      data: { status: 'failed', error: err instanceof Error ? err.message : 'The trial failed.' },
    })
  }
}
