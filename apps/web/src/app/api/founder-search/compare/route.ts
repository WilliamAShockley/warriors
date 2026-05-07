import { NextResponse } from 'next/server'
import Parallel from 'parallel-web'

async function searchExa(url: string, domain: string) {
  const start = Date.now()
  try {
    const [similar, search] = await Promise.all([
      fetch('https://api.exa.ai/findSimilar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.EXA_API_KEY! },
        body: JSON.stringify({ url, numResults: 5, contents: { text: { maxCharacters: 1000 } } }),
      }).then(r => r.json()),
      fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.EXA_API_KEY! },
        body: JSON.stringify({
          query: `${domain} founder CEO`,
          numResults: 5,
          useAutoprompt: true,
          contents: { text: { maxCharacters: 1000 } },
        }),
      }).then(r => r.json()),
    ])
    return {
      results: { findSimilar: similar.results ?? [], search: search.results ?? [] },
      elapsed: Date.now() - start,
    }
  } catch (e) {
    return { results: null, error: String(e), elapsed: Date.now() - start }
  }
}

async function searchTavily(url: string, domain: string) {
  const start = Date.now()
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: `${domain} founder CEO name`,
        search_depth: 'advanced',
        max_results: 5,
        include_raw_content: false,
      }),
    })
    const data = await res.json()
    return { results: data.results ?? [], elapsed: Date.now() - start }
  } catch (e) {
    return { results: null, error: String(e), elapsed: Date.now() - start }
  }
}

async function searchParallel(url: string, domain: string) {
  const start = Date.now()
  try {
    const client = new Parallel({ apiKey: process.env.PARALLEL_API_KEY! })
    const taskRun = await client.taskRun.create({
      input: `Can you tell me who the founder of ${url} (${domain}) is?`,
      processor: 'core-fast',
      task_spec: {
        input_schema: { type: 'text', description: 'The user request to execute.' },
        output_schema: { type: 'text', description: 'Return a helpful final answer in clear markdown that addresses the user request.' },
      },
    })
    const runResult = await client.taskRun.result(taskRun.run_id)
    return { results: runResult.output, elapsed: Date.now() - start }
  } catch (e) {
    return { results: null, error: String(e), elapsed: Date.now() - start }
  }
}

export async function POST(req: Request) {
  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })

  const domain = new URL(url).hostname.replace('www.', '')

  const [exa, tavily, parallel] = await Promise.all([
    searchExa(url, domain),
    searchTavily(url, domain),
    searchParallel(url, domain),
  ])

  return NextResponse.json({ url, domain, exa, tavily, parallel })
}
