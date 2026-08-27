// The research engines — a common contract so the Register and the Bench
// can run any of them interchangeably. Every provider gets the identical
// charge (the reader's verbatim enrichment prompt, anchors and all) and
// must come back with the identical JSON fields.

export type ResearchInput = {
  // 'company' (the default) researches a company; 'person' researches an
  // individual's professional background and best-guesses a work email.
  kind?: 'company' | 'person'
  name: string // the company name — or, for a person, their full name
  founderFirstName?: string | null
  founderFullName?: string | null
  websiteUrl?: string | null
  context?: string | null
  // Person anchors: the company affiliation and the LinkedIn URL.
  company?: string | null
  linkedinUrl?: string | null
}

// One JSON contract for both kinds so every engine and the parser share a
// single shape: on a person run, founderFirstName/founderFullName carry the
// person's own name, context carries the background brief, websiteUrl their
// LinkedIn URL, and guessedEmail the best-guess address.
export type ResearchFields = {
  founderFirstName?: string | null
  founderFullName?: string | null
  context?: string | null
  websiteUrl?: string | null
  guessedEmail?: string | null
}

export type Citation = { title?: string; url: string }

export type ResearchResult = {
  fields: ResearchFields
  citations: Citation[]
  latencyMs: number
  // Diagnostic tail for the Bench's expanded view — never parsed, only shown.
  rawText?: string
}

export type ProviderId = 'anthropic' | 'openai' | 'exa' | 'parallel'

export type ResearchProvider = {
  id: ProviderId
  label: string
  // Throws with an honest, reader-facing message on any failure — a missing
  // key, a provider error, a timeout. The caller records it verbatim.
  run(input: ResearchInput): Promise<ResearchResult>
}

// One ceiling for every engine: generous enough for real multi-search runs
// (the 100s ceiling provably was not), inside the platform's 300s window.
export const RESEARCH_TIMEOUT_MS = 240_000

export const withDeadline = <T>(p: Promise<T>, label: string): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${RESEARCH_TIMEOUT_MS / 1000} seconds`)),
        RESEARCH_TIMEOUT_MS
      )
    ),
  ])
