// OG — the drafting diagnostic bench. One row per test: take a company name
// or URL, research it, generate a structured touch-1 draft through the same
// engine campaigns use, and keep the full JSON evidence (enrichment, parts,
// checks) so failures can be diagnosed at row level.

import Parallel from 'parallel-web'
import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { extractFounderName } from '@/lib/founderSearch'
import { getVoiceProfile, generateStructuredDraft } from '@/lib/horizon/drafting'

export type OgMode = 'name' | 'url'

// A column is a named view over one verifiable check from the registry.
export type OgColumn = { label: string; checkId: string }

const COLUMNS_KEY = 'og.columns'

// The 12 starting columns — each maps 1:1 to a check id in
// horizon/draft-checks.ts. More can be added from the UI on the fly.
export const DEFAULT_OG_COLUMNS: OgColumn[] = [
  { label: 'greeting', checkId: 'greeting-format' },
  { label: 'name match', checkId: 'greeting-name' },
  { label: 'subject fmt', checkId: 'subject-format' },
  { label: 'subject co.', checkId: 'subject-company' },
  { label: 'signoff', checkId: 'signoff' },
  { label: 'structure', checkId: 'cold-structure' },
  { label: 'intro length', checkId: 'cold-intro-length' },
  { label: 'ask', checkId: 'ask-question' },
  { label: 'phrases', checkId: 'banned-phrases' },
  { label: 'em dash', checkId: 'no-em-dash' },
  { label: 'personalized', checkId: 'personalization-present' },
  { label: 'grounded', checkId: 'personalization-grounded' },
]

export async function getOgColumns(): Promise<OgColumn[]> {
  const row = await db.setting.findUnique({ where: { key: COLUMNS_KEY } })
  if (!row) return DEFAULT_OG_COLUMNS
  try {
    const parsed = JSON.parse(row.value) as OgColumn[]
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_OG_COLUMNS
  } catch {
    return DEFAULT_OG_COLUMNS
  }
}

export async function setOgColumns(columns: OgColumn[]) {
  await db.setting.upsert({
    where: { key: COLUMNS_KEY },
    create: { key: COLUMNS_KEY, value: JSON.stringify(columns) },
    update: { value: JSON.stringify(columns) },
  })
}

function deriveCompany(mode: OgMode, input: string): string {
  if (mode === 'name') return input.trim()
  const hostname = input.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  const raw = hostname.split('.')[0] || input
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

/**
 * Research the target with Parallel (same engine as the cold-outbound agent),
 * asking for the CEO plus concrete facts the draft can personalize from. With
 * no PARALLEL_API_KEY the run proceeds on minimal enrichment — grounding
 * checks will fail, which is itself diagnostic signal.
 */
async function research(mode: OgMode, input: string) {
  const company = deriveCompany(mode, input)
  const subject =
    mode === 'url'
      ? `the company at ${input.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
      : `the company "${input}"`

  if (!process.env.PARALLEL_API_KEY) {
    return {
      founderName: null as string | null,
      company,
      enrichment: { input, mode, company, note: 'no research provider configured (PARALLEL_API_KEY missing)' },
    }
  }

  const client = new Parallel({ apiKey: process.env.PARALLEL_API_KEY })
  const taskRun = await client.taskRun.create({
    input: `Who is the CEO of ${subject}? If no CEO is listed, who is the founder most likely to be CEO? Also list 3-5 concrete, recent, verifiable facts about the company (what it builds, funding rounds, notable news or customers).`,
    processor: 'core-fast' as const,
    task_spec: {
      input_schema: { type: 'text' as const, description: 'The user request to execute.' },
      output_schema: { type: 'text' as const, description: 'Return a helpful final answer in clear markdown that addresses the user request.' },
    },
  })
  const runResult = await client.taskRun.result(taskRun.run_id)
  const out = runResult.output as { content?: string; output?: string; basis?: Array<{ confidence?: string }> }
  const content: string = out?.content ?? out?.output ?? JSON.stringify(out)
  const confidence: string = out?.basis?.[0]?.confidence ?? 'unknown'
  const founderName = await extractFounderName(content)

  return {
    founderName,
    company,
    enrichment: { input, mode, company, name: founderName, research: content, confidence },
  }
}

/** Run one OG row end to end. Errors are stored on the row, never thrown away. */
export async function runOg(mode: OgMode, input: string) {
  const row = await db.ogRun.create({ data: { mode, input } })
  try {
    const { founderName, company, enrichment } = await research(mode, input)
    const enrichmentText = JSON.stringify(enrichment, null, 2)
    const voice = await getVoiceProfile()

    const result = await generateStructuredDraft({
      voice,
      channel: 'email',
      touchIndex: 0,
      sequenceLength: 1,
      personName: founderName ?? '',
      company,
      enrichmentText,
    })

    return await db.ogRun.update({
      where: { id: row.id },
      data: {
        founderName,
        company,
        enrichment: enrichment as Prisma.InputJsonValue,
        result: result as unknown as Prisma.InputJsonValue,
      },
    })
  } catch (err) {
    return await db.ogRun.update({
      where: { id: row.id },
      data: { error: String(err) },
    })
  }
}
