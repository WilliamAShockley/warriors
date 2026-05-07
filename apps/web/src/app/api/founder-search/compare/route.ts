import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/claude'

async function extractFounderWithClaude(searchResults: string, url: string): Promise<string> {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Based on these search results about the company at ${url}, extract the founder's full name(s). Return only the name(s), one per line. If not found, return "Not found".\n\n${searchResults}`,
    }],
  })
  return msg.content[0].type === 'text' ? msg.content[0].text.trim() : 'Not found'
}

async function searchExa(url: string, domain: string): Promise<{ results: string; raw: unknown; error?: string }> {
  const start = Date.now()
  try {
    // First try findSimilar on the URL to surface team/about pages
    const similar = await fetch('https://api.exa.ai/findSimilar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.EXA_API_KEY! },
      body: JSON.stringify({ url, numResults: 5, contents: { text: { maxCharacters: 1000 } } }),
    })
    const similarData = await similar.json()

    // Also do a direct search
    const search = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.EXA_API_KEY! },
      body: JSON.stringify({
        query: `${domain} founder CEO`,
        numResults: 5,
        useAutoprompt: true,
        contents: { text: { maxCharacters: 1000 } },
      }),
    })
    const searchData = await search.json()

    const combined = [
      ...(similarData.results ?? []),
      ...(searchData.results ?? []),
    ]
    const text = combined.map((r: { title?: string; url?: string; text?: string }) =>
      `[${r.title}] ${r.url}\n${r.text ?? ''}`
    ).join('\n\n')

    return { results: text, raw: combined, elapsed: Date.now() - start } as any
  } catch (e) {
    return { results: '', raw: null, error: String(e) }
  }
}

async function searchTavily(url: string, domain: string): Promise<{ results: string; raw: unknown; error?: string }> {
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
    const text = (data.results ?? []).map((r: { title?: string; url?: string; content?: string }) =>
      `[${r.title}] ${r.url}\n${r.content ?? ''}`
    ).join('\n\n')

    return { results: text, raw: data.results, elapsed: Date.now() - start } as any
  } catch (e) {
    return { results: '', raw: null, error: String(e) }
  }
}

async function searchParallel(url: string, domain: string): Promise<{ results: string; raw: unknown; error?: string }> {
  const start = Date.now()
  try {
    const res = await fetch('https://api.parallel.ai/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.PARALLEL_API_KEY!,
      },
      body: JSON.stringify({
        objective: `Find the first and last name of the founder(s) of the company at ${url} (${domain})`,
        search_queries: [
          `${domain} founder name`,
          `${domain} CEO founder LinkedIn`,
          `who founded ${domain}`,
        ],
      }),
    })
    const data = await res.json()
    const text = (data.results ?? []).map((r: { title?: string; url?: string; excerpts?: string[] }) =>
      `[${r.title}] ${r.url}\n${(r.excerpts ?? []).join(' ')}`
    ).join('\n\n')

    return { results: text, raw: data.results, elapsed: Date.now() - start } as any
  } catch (e) {
    return { results: '', raw: null, error: String(e) }
  }
}

export async function POST(req: Request) {
  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })

  const domain = new URL(url).hostname.replace('www.', '')

  // Hit all three in parallel
  const [exaData, tavilyData, parallelData] = await Promise.all([
    searchExa(url, domain),
    searchTavily(url, domain),
    searchParallel(url, domain),
  ])

  // Extract founder name from each using Claude
  const [exaFounder, tavilyFounder, parallelFounder] = await Promise.all([
    exaData.results ? extractFounderWithClaude(exaData.results, url) : Promise.resolve('No results'),
    tavilyData.results ? extractFounderWithClaude(tavilyData.results, url) : Promise.resolve('No results'),
    parallelData.results ? extractFounderWithClaude(parallelData.results, url) : Promise.resolve('No results'),
  ])

  return NextResponse.json({
    url,
    domain,
    exa: { founder: exaFounder, error: exaData.error, elapsed: (exaData as any).elapsed },
    tavily: { founder: tavilyFounder, error: tavilyData.error, elapsed: (tavilyData as any).elapsed },
    parallel: { founder: parallelFounder, error: parallelData.error, elapsed: (parallelData as any).elapsed },
  })
}
