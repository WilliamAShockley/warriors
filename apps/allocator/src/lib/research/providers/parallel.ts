import type { Citation, ResearchInput, ResearchProvider, ResearchResult } from '../types'
import { RESEARCH_TIMEOUT_MS } from '../types'
import { chargeFor, OUTPUT_SCHEMA } from '../charge'

// Parallel's Task API: hand it the charge and our exact output schema, it
// runs multi-hop research and returns structured JSON with per-field
// source attribution. Async on their side — we create the run, then poll
// until it lands or the shared deadline passes.
const BASE = 'https://api.parallel.ai/v1/tasks/runs'
const PROCESSOR = process.env.BENCH_PARALLEL_PROCESSOR || 'core'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function readError(res: Response): Promise<string> {
  const body = await res.text().catch(() => '')
  try {
    const parsed = JSON.parse(body)
    return parsed?.error?.message ?? parsed?.message ?? parsed?.detail ?? body.slice(0, 200)
  } catch {
    return body.slice(0, 200)
  }
}

async function run(input: ResearchInput): Promise<ResearchResult> {
  const key = process.env.PARALLEL_API_KEY
  if (!key) throw new Error('no PARALLEL_API_KEY filed — add it to the environment')
  const headers = { 'Content-Type': 'application/json', 'x-api-key': key }
  const started = Date.now()

  const created = await fetch(BASE, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      input: await chargeFor('parallel', input),
      processor: PROCESSOR,
      task_spec: {
        output_schema: { type: 'json', json_schema: OUTPUT_SCHEMA },
      },
    }),
  })
  if (!created.ok) throw new Error(`Parallel answered ${created.status}: ${await readError(created)}`)
  const createdData: any = await created.json()
  const runId = createdData?.run_id ?? createdData?.id
  if (!runId) throw new Error('Parallel accepted the task but returned no run id')

  // Poll the run until it concludes, inside the shared research deadline.
  while (true) {
    if (Date.now() - started > RESEARCH_TIMEOUT_MS) {
      throw new Error(`the Parallel check timed out after ${RESEARCH_TIMEOUT_MS / 1000} seconds`)
    }
    const statusRes = await fetch(`${BASE}/${runId}`, { headers })
    if (!statusRes.ok) throw new Error(`Parallel answered ${statusRes.status}: ${await readError(statusRes)}`)
    const status = String(((await statusRes.json()) as any)?.status ?? '')
    if (status === 'completed') break
    if (status === 'failed' || status === 'cancelled') {
      throw new Error(`the Parallel run ${status}`)
    }
    await sleep(5000)
  }

  const resultRes = await fetch(`${BASE}/${runId}/result`, { headers })
  if (!resultRes.ok) throw new Error(`Parallel answered ${resultRes.status}: ${await readError(resultRes)}`)
  const result: any = await resultRes.json()

  const output = result?.output ?? result
  let content: any = output?.content ?? output
  if (typeof content === 'string') {
    const { parseFields } = await import('../parse')
    content = await parseFields(content)
  }

  const citations: Citation[] = []
  const seen = new Set<string>()
  for (const basis of output?.basis ?? []) {
    for (const c of basis?.citations ?? []) {
      const url = c?.url
      if (url && !seen.has(url)) {
        seen.add(url)
        citations.push({ url, title: c?.title })
      }
    }
  }

  const fields = {
    founderFirstName: content?.founderFirstName ?? null,
    founderFullName: content?.founderFullName ?? null,
    context: content?.context ?? null,
    websiteUrl: content?.websiteUrl ?? null,
  }
  if (!fields.context || !String(fields.context).trim()) {
    throw new Error('Parallel completed but returned no context')
  }
  return {
    fields,
    citations,
    latencyMs: Date.now() - started,
    rawText: typeof output?.content === 'string' ? output.content : JSON.stringify(content, null, 2),
  }
}

export const parallelProvider: ResearchProvider = {
  id: 'parallel',
  label: 'Parallel',
  run,
}
