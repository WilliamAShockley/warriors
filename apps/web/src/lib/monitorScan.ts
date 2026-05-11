import { db } from './db'
import { anthropic } from './claude'
import Parallel from 'parallel-web'

// --- Source fetchers ---

async function fetchHackerNews(query: string): Promise<{ title: string; url: string; source: string }[]> {
  try {
    const res = await fetch(
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=10`,
      { signal: AbortSignal.timeout(10000) },
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.hits ?? [])
      .filter((h: any) => h.title && h.url)
      .map((h: any) => ({ title: h.title, url: h.url, source: 'hackernews' }))
  } catch {
    return []
  }
}

function parseRSS(xml: string): { title: string; url: string }[] {
  const items: { title: string; url: string }[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1]
    const title = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() ?? ''
    const url = item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? ''
    if (title && url) items.push({ title, url })
  }
  return items
}

async function fetchGoogleNews(query: string): Promise<{ title: string; url: string; source: string }[]> {
  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`
    const res = await fetch(rssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Warriors/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const xml = await res.text()
    return parseRSS(xml).map(item => ({ ...item, source: 'google_news' }))
  } catch {
    return []
  }
}

async function fetchParallel(themeDescription: string): Promise<{ title: string; url: string; source: string; rawOutput: string }[]> {
  try {
    const client = new Parallel({ apiKey: process.env.PARALLEL_API_KEY! })
    const taskRun = await client.taskRun.create({
      input: `Find 5-10 startups or companies that match this investment thesis: "${themeDescription}". For each, provide the company name and website URL. Focus on real, specific companies — not categories or trends.`,
      processor: 'core-fast' as const,
      task_spec: {
        input_schema: { type: 'text' as const, description: 'Investment thesis to search for matching companies.' },
        output_schema: { type: 'text' as const, description: 'List of companies with names and URLs.' },
      },
    })
    const runResult = await client.taskRun.result(taskRun.run_id)
    const out = runResult.output as any
    const content: string = out?.content ?? out?.output ?? JSON.stringify(out)
    return [{ title: 'Parallel search results', url: '', source: 'parallel', rawOutput: content }]
  } catch (err) {
    console.error('Parallel scan failed:', err)
    return []
  }
}

// --- Query generation ---

async function generateQueries(description: string, keywords: string | null): Promise<string[]> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Generate 3-5 concise search queries to find startups matching this investment thesis. Return ONLY a JSON array of strings, nothing else.

Thesis: ${description}
${keywords ? `Keywords: ${keywords}` : ''}

Example output: ["AI trading platforms fintech", "machine learning quantitative hedge fund startup"]`,
      }],
    })
    const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
    const parsed = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? '[]')
    return Array.isArray(parsed) ? parsed.slice(0, 5) : []
  } catch {
    // Fallback: use description words as single query
    return [description.slice(0, 100)]
  }
}

// --- AI evaluation ---

type RawHit = { title: string; url: string; source: string; rawOutput?: string }

type EvaluatedHit = {
  companyName: string
  url: string | null
  description: string
  matchReason: string
  source: string
  sourceUrl: string | null
}

async function evaluateHits(rawHits: RawHit[], themeDescription: string): Promise<EvaluatedHit[]> {
  if (rawHits.length === 0) return []

  const hitSummary = rawHits.map((h, i) => {
    if (h.source === 'parallel' && h.rawOutput) {
      return `[${i}] SOURCE: Parallel Web Research\n${h.rawOutput}`
    }
    return `[${i}] SOURCE: ${h.source} | TITLE: ${h.title} | URL: ${h.url}`
  }).join('\n\n')

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are evaluating search results to find real companies that match an investment thesis. For each result, determine if it references a real, specific company (not a news aggregator, blog, or category page).

Investment thesis: "${themeDescription}"

Search results:
${hitSummary}

For each real company found, extract:
- companyName: the company name
- url: the company website (best guess if not explicit, or null)
- description: 1-2 sentence description of what they do
- matchReason: why they match the thesis (1 sentence)
- source: which source it came from (parallel, hackernews, or google_news)
- sourceUrl: the original URL from the search result (or null)

Return ONLY a JSON array. If no real companies found, return [].
Example: [{"companyName":"Acme AI","url":"https://acme.ai","description":"AI-powered trading","matchReason":"Matches AI in capital markets thesis","source":"hackernews","sourceUrl":"https://news.ycombinator.com/..."}]`,
      }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    const parsed = JSON.parse(jsonMatch[0])
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.error('AI evaluation failed:', err)
    return []
  }
}

// --- Dedup ---

function normalizeDomain(url: string): string {
  try {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

// --- Main scan ---

export type ScanSteps = {
  queries?: { generated: string[] }
  sources?: {
    parallel: number
    hackerNews: number
    googleNews: number
    total: number
  }
  evaluation?: {
    companiesFound: number
    companies: { name: string; url: string | null }[]
  }
  dedup?: {
    before: number
    duplicatesRemoved: number
    after: number
  }
  saved?: {
    newHits: number
  }
}

export type ScanResult = {
  themeId: string
  themeName: string
  hits: number
  steps: ScanSteps
  error?: string
}

export async function scanTheme(themeId: string): Promise<ScanResult> {
  const steps: ScanSteps = {}

  const theme = await db.monitorTheme.findUnique({ where: { id: themeId } })
  if (!theme) return { themeId, themeName: '', hits: 0, steps, error: 'Theme not found' }
  if (!theme.enabled) return { themeId, themeName: theme.name, hits: 0, steps, error: 'Theme is disabled' }

  // 1. Generate queries
  const queries = await generateQueries(theme.description, theme.keywords)
  steps.queries = { generated: queries }

  // 2. Fetch from all sources in parallel
  const querySlice = queries.slice(0, 3)
  const [parallelResults, ...searchResults] = await Promise.all([
    fetchParallel(theme.description),
    ...querySlice.flatMap(q => [
      fetchHackerNews(q),
      fetchGoogleNews(q),
    ]),
  ])

  // Split search results back into HN and Google News
  const hnResults: RawHit[] = []
  const gnResults: RawHit[] = []
  for (let i = 0; i < searchResults.length; i++) {
    const items = searchResults[i]
    if (i % 2 === 0) hnResults.push(...items)
    else gnResults.push(...items)
  }

  const allRawHits: RawHit[] = [
    ...parallelResults,
    ...hnResults,
    ...gnResults,
  ]

  steps.sources = {
    parallel: parallelResults.length,
    hackerNews: hnResults.length,
    googleNews: gnResults.length,
    total: allRawHits.length,
  }

  if (allRawHits.length === 0) {
    await db.monitorTheme.update({ where: { id: themeId }, data: { lastScannedAt: new Date() } })
    return { themeId, themeName: theme.name, hits: 0, steps }
  }

  // 3. AI evaluation
  const evaluated = await evaluateHits(allRawHits, theme.description)
  steps.evaluation = {
    companiesFound: evaluated.length,
    companies: evaluated.map(e => ({ name: e.companyName, url: e.url })),
  }

  if (evaluated.length === 0) {
    await db.monitorTheme.update({ where: { id: themeId }, data: { lastScannedAt: new Date() } })
    return { themeId, themeName: theme.name, hits: 0, steps }
  }

  // 4. Dedup against existing hits + existing targets
  const existingHits = await db.monitorHit.findMany({
    where: { themeId },
    select: { companyName: true, url: true },
  })
  const existingTargets = await db.target.findMany({
    select: { company: true, websiteUrl: true },
  })

  const existingDomains = new Set<string>()
  const existingNames = new Set<string>()
  for (const h of existingHits) {
    existingNames.add(h.companyName.toLowerCase())
    if (h.url) existingDomains.add(normalizeDomain(h.url))
  }
  for (const t of existingTargets) {
    existingNames.add(t.company.toLowerCase())
    if (t.websiteUrl) existingDomains.add(normalizeDomain(t.websiteUrl))
  }

  const newHits = evaluated.filter(hit => {
    if (existingNames.has(hit.companyName.toLowerCase())) return false
    if (hit.url && existingDomains.has(normalizeDomain(hit.url))) return false
    return true
  })

  steps.dedup = {
    before: evaluated.length,
    duplicatesRemoved: evaluated.length - newHits.length,
    after: newHits.length,
  }

  if (newHits.length === 0) {
    await db.monitorTheme.update({ where: { id: themeId }, data: { lastScannedAt: new Date() } })
    return { themeId, themeName: theme.name, hits: 0, steps }
  }

  // 5. Insert
  await db.monitorHit.createMany({
    data: newHits.map(hit => ({
      themeId,
      companyName: hit.companyName,
      url: hit.url ?? null,
      description: hit.description,
      matchReason: hit.matchReason,
      source: hit.source,
      sourceUrl: hit.sourceUrl ?? null,
      status: 'pending',
      rawData: JSON.stringify(hit),
    })),
  })

  await db.monitorTheme.update({ where: { id: themeId }, data: { lastScannedAt: new Date() } })

  steps.saved = { newHits: newHits.length }

  return { themeId, themeName: theme.name, hits: newHits.length, steps }
}

export async function scanAllThemes(): Promise<ScanResult[]> {
  const themes = await db.monitorTheme.findMany({ where: { enabled: true } })
  const results: ScanResult[] = []
  for (const theme of themes) {
    const result = await scanTheme(theme.id)
    results.push(result)
  }
  return results
}
