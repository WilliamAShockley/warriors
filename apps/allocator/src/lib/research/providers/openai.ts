import type { Citation, ResearchInput, ResearchProvider, ResearchResult } from '../types'
import { withDeadline } from '../types'
import { buildCharge } from '../charge'

// OpenAI's bundle: the Responses API with the web_search tool — the same
// shape as Anthropic's engine, so this is the apples-to-apples comparison.
// A generous output ceiling matters here too: reasoning tokens count
// against it, and a small cap returns status "incomplete" with no answer.
const MODEL = process.env.BENCH_OPENAI_MODEL || 'gpt-5.5'

async function run(input: ResearchInput): Promise<ResearchResult> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('no OPENAI_API_KEY filed — add it to the environment')
  const { parseFields } = await import('../parse')
  const started = Date.now()

  const res: Response = await withDeadline(
    fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        input: buildCharge(input),
        tools: [{ type: 'web_search' }],
        max_output_tokens: 16000,
      }),
    }),
    'the OpenAI check'
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let detail = body.slice(0, 200)
    try {
      detail = JSON.parse(body)?.error?.message ?? detail
    } catch {}
    throw new Error(`OpenAI answered ${res.status}: ${detail}`)
  }
  const data: any = await res.json()

  // Assemble the final text and its url_citation annotations from the
  // output items (the REST shape; no SDK convenience fields out here).
  let text = ''
  const citations: Citation[] = []
  const seen = new Set<string>()
  for (const item of data?.output ?? []) {
    if (item?.type !== 'message') continue
    for (const part of item?.content ?? []) {
      if (part?.type !== 'output_text') continue
      text += (text ? '\n' : '') + (part.text ?? '')
      for (const a of part?.annotations ?? []) {
        const url = a?.url
        if (url && !seen.has(url)) {
          seen.add(url)
          citations.push({ url, title: a?.title })
        }
      }
    }
  }
  if (!text.trim()) {
    throw new Error(
      `the model returned no text (status: ${data?.status ?? 'unknown'}${
        data?.incomplete_details?.reason ? `, ${data.incomplete_details.reason}` : ''
      })`
    )
  }

  const fields = await parseFields(text)
  if (!fields.context || !String(fields.context).trim()) {
    throw new Error('the model returned no context in the agreed JSON shape')
  }
  return { fields, citations, latencyMs: Date.now() - started, rawText: text }
}

export const openaiProvider: ResearchProvider = {
  id: 'openai',
  label: 'OpenAI',
  run,
}
