import type { Citation, ResearchInput, ResearchProvider, ResearchResult } from '../types'
import { withDeadline } from '../types'
import { buildCharge } from '../charge'

// Exa's /answer: a synchronous LLM answer grounded in their neural search,
// citations attached. The search-native contender in its simplest dress —
// their deeper async /research agent can join the bench later if this
// round earns it.
async function run(input: ResearchInput): Promise<ResearchResult> {
  const key = process.env.EXA_API_KEY
  if (!key) throw new Error('no EXA_API_KEY filed — add it to the environment')
  const { parseFields } = await import('../parse')
  const started = Date.now()

  const res: Response = await withDeadline(
    fetch('https://api.exa.ai/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ query: buildCharge(input), text: true }),
    }),
    'the Exa check'
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let detail = body.slice(0, 200)
    try {
      const parsed = JSON.parse(body)
      detail = parsed?.error ?? parsed?.message ?? detail
    } catch {}
    throw new Error(`Exa answered ${res.status}: ${detail}`)
  }
  const data: any = await res.json()

  const text = String(data?.answer ?? '')
  const citations: Citation[] = []
  const seen = new Set<string>()
  for (const c of data?.citations ?? []) {
    const url = c?.url
    if (url && !seen.has(url)) {
      seen.add(url)
      citations.push({ url, title: c?.title })
    }
  }
  if (!text.trim()) throw new Error('Exa returned no answer text')

  const fields = await parseFields(text)
  if (!fields.context || !String(fields.context).trim()) {
    // Exa's answerer sometimes writes prose instead of the contract; the
    // whole answer then stands as the context so the bench still compares
    // substance — flagged in the raw view rather than failed outright.
    fields.context = text.trim().slice(0, 4000)
  }
  return { fields, citations, latencyMs: Date.now() - started, rawText: text }
}

export const exaProvider: ResearchProvider = {
  id: 'exa',
  label: 'Exa',
  run,
}
