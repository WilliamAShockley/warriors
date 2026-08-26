import type { ResearchResult } from '../research'
import { readerViewFor } from './reader-view'

// The pre-draft research pass for cold outreach: run the research bench's
// engines against the company, file what they verify to the Register, and
// hand back one composed brief — the facts, the sources, and the reader's
// own view of the space — for the drafting context.
//
// Provider preference: Parallel first (the bench's strongest cold-research
// engine when its key is filed), then Exa, OpenAI, Anthropic. First engine
// to answer wins; each is raced against what remains of the deadline so a
// slow engine cannot eat the drafting run's whole window.

const RESEARCH_DEADLINE_MS = 150_000

export type CompanyResearchInput = {
  company: string
  founderName?: string
  websiteUrl?: string
  taskContext?: string
}

export type CompanyResearch = {
  provider: string
  founderFirstName: string | null
  founderFullName: string | null
  brief: string
  websiteUrl: string | null
  guessedEmail: string | null
  citations: { title?: string; url: string }[]
  readerView: string
}

const raceDeadline = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} exceeded the research deadline`)), Math.max(1, ms))
    ),
  ])

export async function researchCompany(
  input: CompanyResearchInput
): Promise<CompanyResearch | { error: string }> {
  const { RESEARCH_PROVIDERS } = await import('../research')
  const ordered = [...RESEARCH_PROVIDERS].sort((a, b) => {
    const pref = (id: string) =>
      id === 'parallel' && process.env.PARALLEL_API_KEY ? 0 : id === 'exa' ? 1 : id === 'openai' ? 2 : 3
    return pref(a.id) - pref(b.id)
  })

  const started = Date.now()
  const failures: string[] = []
  let result: ResearchResult | null = null
  let providerId = ''
  for (const provider of ordered) {
    const remaining = RESEARCH_DEADLINE_MS - (Date.now() - started)
    if (remaining <= 5_000) break
    try {
      result = await raceDeadline(
        provider.run({
          kind: 'company',
          name: input.company,
          founderFullName: input.founderName ?? null,
          websiteUrl: input.websiteUrl ?? null,
          context: input.taskContext ?? null,
        }),
        remaining,
        provider.label
      )
      providerId = provider.id
      break
    } catch (err) {
      failures.push(`${provider.label}: ${err instanceof Error ? err.message : 'failed'}`)
    }
  }
  if (!result) {
    return { error: `No research engine answered — ${failures.join('; ') || 'none configured'}` }
  }

  const brief = String(result.fields.context ?? '').trim()

  // What the engine verified goes straight to the Register — the next task
  // on this company starts warm, and the straight-through founder check
  // has something to stand on.
  try {
    const { upsertCompany } = await import('../context')
    await upsertCompany({
      name: input.company,
      founderFirstName: result.fields.founderFirstName ?? undefined,
      founderFullName: result.fields.founderFullName ?? undefined,
      context: brief || undefined,
      websiteUrl: result.fields.websiteUrl ?? undefined,
      founderEmail: result.fields.guessedEmail ?? undefined,
      enriched: true,
    })
  } catch {
    // The Register write is enrichment; the brief still returns.
  }

  const readerView = await readerViewFor(input.company, brief).catch(() => '')

  return {
    provider: providerId,
    founderFirstName: result.fields.founderFirstName ?? null,
    founderFullName: result.fields.founderFullName ?? null,
    brief,
    websiteUrl: result.fields.websiteUrl ?? null,
    guessedEmail: result.fields.guessedEmail ?? null,
    citations: result.citations.slice(0, 10),
    readerView,
  }
}

// The tool-facing rendering: two labeled blocks Apollo passes onward —
// the brief (with sources) into drafting context and grounding, and
// Dez's Context into the drafting skill's readerView field.
export function renderResearch(r: CompanyResearch): string {
  const lines = [
    `RESEARCH BRIEF (engine: ${r.provider})`,
    r.founderFullName || r.founderFirstName
      ? `Founder: ${r.founderFullName ?? r.founderFirstName}${r.founderFullName && r.founderFirstName ? ` (goes by ${r.founderFirstName})` : ''}`
      : 'Founder: not established — say so in the proof summary if it stays unknown',
    r.websiteUrl ? `Site: ${r.websiteUrl}` : null,
    r.guessedEmail ? `Best-guess address: ${r.guessedEmail}` : null,
    '',
    r.brief,
    r.citations.length
      ? `\nSources:\n${r.citations.map((c) => `- ${c.title ? `${c.title} — ` : ''}${c.url}`).join('\n')}`
      : null,
    r.readerView
      ? `\nDEZ'S CONTEXT (the reader's own private view — his standing notes and the theses that bear on this space; use it to sharpen the thesis line and the hook; never quote it to the recipient as research, never attribute it):\n${r.readerView}`
      : null,
  ]
  return lines.filter((l) => l !== null).join('\n')
}
