// OG — the cold-draft observation bench. Rows are companies under trial;
// the cells are the actual outputs of each step, laid out left to right
// in pipeline order so a bad email can be triaged to the step that broke:
//
//   RESEARCH CONTEXT: Company Description · CEO · Product · Category
//   COLD EMAIL DRAFT (CED-): Greeting · Fixed-Intro · Var-1 · Var-2 ·
//     Var-3 · Closing · Ask
//
// The draft is assembled programmatically: greeting, fixed intro, ask,
// and closing are fixed lego blocks from the voice profile; only the
// three variable sentences (the hook, the thesis line, the connect) come
// from the model, grounded in the row's research. The straight-through
// checks still run on the assembled email and file on the row's evidence.

import { anthropic } from './claude'
import { runStpChecks, type StpResult } from './stp'

const hasDb = () => Boolean(process.env.DATABASE_URL)

async function getDb() {
  const { db } = await import('./db')
  return db
}

const OG_MODEL = process.env.OG_MODEL || process.env.APOLLO_SKILL_MODEL || 'claude-opus-5'

export type OgTab = 'name' | 'url'

export const OG_CATEGORIES = ['Digital Assets', 'Vertical AI', 'Other'] as const
export type OgCategory = (typeof OG_CATEGORIES)[number]

// The research-context columns: what the research pass established.
export type OgContext = {
  description: string // succinct — what the company does
  ceo: string | null // full name
  product: string // one sentence, maximum
  category: OgCategory
}

// The draft, in component parts. Fixed blocks are constants below; the
// vars are the model's. `body`/`subject` are the programmatic assembly.
export type OgDraftParts = {
  greeting: string
  fixedIntro: string
  var1: string // the hook — why reach out to THIS company now
  var2: string // the thesis line — Dez's dated view of the space
  var3: string // the connect — why this company fits the thesis
  closing: string
  ask: string
  subject: string
  body: string
}

export type OgResearchRecord = {
  provider: string
  founderFirstName: string | null
  founderFullName: string | null
  brief: string
  websiteUrl: string | null
  guessedEmail: string | null
  citations: { title?: string; url: string }[]
  readerView: string
}

export type OgRowRecord = {
  id: string
  tab: OgTab
  input: string
  status: string // running | done | failed
  company: string | null
  context: OgContext | null
  draft: OgDraftParts | null
  research: OgResearchRecord | null
  stp: StpResult[]
  error: string | null
  ranOn: string | null
}

export type OgSheet = { live: boolean; tab: OgTab; rows: OgRowRecord[] }

// ── The fixed lego blocks (from the voice profile's verbatim reuse list) ──

export const CED_FIXED_INTRO =
  "Hope this note finds you well! I'm Dez, I'm a Principal here at FirstMark, we're an early stage, Series A focused VC firm based here in NYC, and we were early investors in Pinterest, Shopify, DraftKings and a whole host of other great companies."

export const CED_ASK =
  "Would you be open to hopping on a call some time soon? It would be great to begin a dialogue, learn more about you and your vision + I'm happy to share how we partner with founders here at FirstMark."

export const CED_CLOSING = 'Lmk what you think. Hope to hear from you soon!'

export const cedGreeting = (ceoFullName: string | null): string => {
  const first = ceoFullName?.trim().split(/\s+/)[0]
  return first ? `Hey ${first} -` : 'Hey there -'
}

export const cedSubject = (company: string): string => `Reaching Out - ${company} <> FirstMark`

export function assembleCed(parts: Omit<OgDraftParts, 'subject' | 'body'>, company: string): OgDraftParts {
  const paragraphOne = [parts.greeting, parts.fixedIntro, parts.var1, parts.var2, parts.var3]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ')
  return {
    ...parts,
    subject: cedSubject(company),
    body: `${paragraphOne}\n\n${parts.ask}\n\n${parts.closing}\n\nDez`,
  }
}

// ── The sheet ─────────────────────────────────────────────────────

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
    rows: rows.map((r: any): OgRowRecord => ({
      id: r.id,
      tab: r.tab as OgTab,
      input: r.input,
      status: r.status,
      company: r.company,
      context: parseJson<OgContext>(r.contextJson),
      draft: parseJson<OgDraftParts>(r.draftJson),
      research: parseJson<OgResearchRecord>(r.researchJson),
      stp: parseJson<StpResult[]>(r.stpJson) ?? [],
      error: r.error,
      ranOn: r.updatedAt?.toISOString?.() ?? null,
    })),
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

// One schema-enforced JSON call. Structured outputs make invalid JSON
// impossible; the schema stays flat (the API rejects array bounds).
async function jsonCall<T>(system: string, prompt: string, schema: Record<string, unknown>): Promise<T> {
  const msg = await anthropic.messages.create({
    model: OG_MODEL,
    max_tokens: 1024,
    system,
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: prompt }],
  } as any)
  const text = ((msg as any).content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join('')
  return JSON.parse(text) as T
}

// Step 2 — context extraction: the research brief distilled into the
// sheet's research-context columns.
async function extractContext(company: string, brief: string, founderFullName: string | null): Promise<OgContext> {
  const out = await jsonCall<{ description: string; ceo: string; product: string; category: string }>(
    'You distill company research into a crisp observation record. Answer only from the research given — never invent. When the research does not establish a field, write "unknown".',
    `Company: ${company}

RESEARCH:
${brief || '(no research brief)'}

Return:
- description: what the company does, succinctly (max 2 sentences)
- ceo: the CEO's full name ("unknown" if the research does not establish one)
- product: their product, in ONE sentence maximum
- category: exactly one of "Digital Assets", "Vertical AI", "Other"`,
    {
      type: 'object',
      additionalProperties: false,
      required: ['description', 'ceo', 'product', 'category'],
      properties: {
        description: { type: 'string' },
        ceo: { type: 'string' },
        product: { type: 'string' },
        category: { type: 'string', enum: [...OG_CATEGORIES] },
      },
    }
  )
  const ceo =
    founderFullName?.trim() ||
    (out.ceo && !/^unknown$/i.test(out.ceo.trim()) ? out.ceo.trim() : null)
  return {
    description: out.description.trim(),
    ceo,
    product: out.product.trim(),
    category: (OG_CATEGORIES as readonly string[]).includes(out.category) ? (out.category as OgCategory) : 'Other',
  }
}

// Step 3 — the variable sentences: the only part of the draft the model
// writes. Everything around them is fixed blocks assembled in code.
async function draftVars(company: string, context: OgContext, research: OgResearchRecord): Promise<{ var1: string; var2: string; var3: string }> {
  return jsonCall<{ var1: string; var2: string; var3: string }>(
    `You write three sentences in Dez's exact cold-email voice. Dez is a Principal at FirstMark (early stage NYC VC). His voice: comma splices welcome, spaced hyphens " - " never em dashes, "+" as a connector, contractions, an occasional imperfect sentence — warm, direct, opinionated, never corporate. The three sentences sit INSIDE paragraph one of a cold email, right after his fixed intro ("...early investors in Pinterest, Shopify, DraftKings and a whole host of other great companies.") and before his ask. Ground every recipient-specific claim in the research given — never invent a fact about the company.`,
    `Company: ${company}
What they do: ${context.description}
Product: ${context.product}
Category: ${context.category}

RESEARCH:
${research.brief || '(none)'}
${research.readerView ? `\nDEZ'S OWN CONTEXT (his private standing view of this space — make var2 sound like HIS actual current thinking, never quote it as research about the company):\n${research.readerView}` : ''}

Return:
- var1: the hook — "I came across what you're doing at ${company}..." energy: why he's reaching out to THIS company now, one sentence, tied to something real from the research
- var2: the thesis line — his dated, opinionated view of the space this company sits in, one sentence ("I think X is where Y was in 2020/2021" energy)
- var3: the connect — why ${company} fits that thesis, one sentence, may reference what excites him about their approach`,
    {
      type: 'object',
      additionalProperties: false,
      required: ['var1', 'var2', 'var3'],
      properties: {
        var1: { type: 'string' },
        var2: { type: 'string' },
        var3: { type: 'string' },
      },
    }
  )
}

/**
 * The trial, run post-response: research → context extraction → the
 * three variable sentences → programmatic assembly → the straight-through
 * checks on the assembled email. Each step's output files on the row, so
 * a bad email can be walked back to the exact step that broke.
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
        : { company: row.input.trim(), websiteUrl: undefined as string | undefined }

    // 1. Research — the bench's engines; the Register files as a side effect.
    const { researchCompany } = await import('./apollo/company-research')
    const researched = await researchCompany({
      company: seat.company,
      websiteUrl: seat.websiteUrl,
      taskContext: `Cold outreach trial from the OG bench (seated by ${row.tab === 'url' ? 'URL' : 'company name'}).`,
    })
    if ('error' in researched) {
      await db.ogRun.update({
        where: { id },
        data: { status: 'failed', company: seat.company, error: `Research: ${researched.error}` },
      })
      return
    }
    const research = researched as OgResearchRecord
    await db.ogRun.update({
      where: { id },
      data: { company: seat.company, researchJson: JSON.stringify(research), provider: research.provider, founderName: research.founderFullName ?? research.founderFirstName ?? null },
    })

    // 2. The research-context columns.
    const context = await extractContext(seat.company, research.brief, research.founderFullName)
    await db.ogRun.update({ where: { id }, data: { contextJson: JSON.stringify(context) } })

    // 3. The variable sentences, then assembly from the fixed blocks.
    const vars = await draftVars(seat.company, context, research)
    const draft = assembleCed(
      {
        greeting: cedGreeting(context.ceo),
        fixedIntro: CED_FIXED_INTRO,
        var1: vars.var1,
        var2: vars.var2,
        var3: vars.var3,
        closing: CED_CLOSING,
        ask: CED_ASK,
      },
      seat.company
    )

    // 4. The straight-through checks, on the assembled email — the same
    // registry the proof room runs. Files as evidence on the row.
    const { findCompany } = await import('./context')
    const register = await findCompany(seat.company).catch(() => null)
    const stp = await runStpChecks({
      body: draft.body,
      subject: draft.subject,
      to: research.guessedEmail,
      mode: 'cold',
      audience: 'founder',
      grounding: research.brief,
      register: register
        ? { founderFirstName: register.founderFirstName ?? null, founderFullName: register.founderFullName ?? null }
        : null,
    })

    await db.ogRun.update({
      where: { id },
      data: {
        status: 'done',
        draftJson: JSON.stringify(draft),
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
