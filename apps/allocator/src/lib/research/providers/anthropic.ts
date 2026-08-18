import type { Citation, ResearchInput, ResearchProvider, ResearchResult } from '../types'
import { withDeadline } from '../types'
import { buildCharge } from '../charge'

// The incumbent: one Sonnet call with the web_search server tool — the
// model composes up to three searches, Anthropic runs them server-side,
// and the brief plus JSON come back in the same response. This is the
// exact engine the Register has been running on.
const MODEL = process.env.ENRICH_MODEL || 'claude-sonnet-5'

async function run(input: ResearchInput): Promise<ResearchResult> {
  const { anthropic } = await import('../../claude')
  const { parseFields } = await import('../parse')
  const started = Date.now()

  const call = anthropic.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: 'medium' } as any,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 } as any],
    messages: [{ role: 'user', content: buildCharge(input) }],
  } as any)
  const response: any = await withDeadline(call as any, 'the web check')

  const text = (response.content as any[])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')

  // Citations ride on the text blocks (and the search-result blocks).
  const citations: Citation[] = []
  const seen = new Set<string>()
  const add = (url?: string, title?: string) => {
    if (url && !seen.has(url)) {
      seen.add(url)
      citations.push({ url, title })
    }
  }
  for (const block of (response.content as any[]) ?? []) {
    for (const c of block?.citations ?? []) add(c?.url, c?.title)
    if (block?.type === 'web_search_tool_result' && Array.isArray(block?.content)) {
      for (const r of block.content) add(r?.url, r?.title)
    }
  }

  const fields = await parseFields(text)
  if (!fields.context || !String(fields.context).trim()) {
    throw new Error(
      `the model returned no context (stop_reason: ${response?.stop_reason ?? 'unknown'})`
    )
  }
  return { fields, citations, latencyMs: Date.now() - started, rawText: text }
}

export const anthropicProvider: ResearchProvider = {
  id: 'anthropic',
  label: 'Anthropic',
  run,
}
