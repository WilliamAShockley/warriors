import { db } from './db'
import { detectAndSaveIndustry, parseIndustryQueries } from './industry'

type ParsedItem = {
  headline: string
  url: string
  source: string
  publishedAt: Date
}

function parseRSS(xml: string): ParsedItem[] {
  const items: ParsedItem[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1]

    // Title — strip CDATA
    let headline = item
      .match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]
      ?.trim() ?? ''

    // Link
    const url = item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? ''

    // pubDate
    const pubDateStr = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? ''

    // Source name
    const source = item
      .match(/<source[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/source>/)?.[1]
      ?.trim() ?? ''

    // Strip " - Source" suffix from headline (Google News appends it)
    if (source && headline.endsWith(` - ${source}`)) {
      headline = headline.slice(0, -(source.length + 3)).trim()
    }

    const publishedAt = pubDateStr ? new Date(pubDateStr) : new Date()

    if (headline && url && !isNaN(publishedAt.getTime())) {
      items.push({ headline, url, source, publishedAt })
    }
  }

  return items
}

async function fetchNewsForQuery(query: string): Promise<ParsedItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Warriors/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const xml = await res.text()
    return parseRSS(xml)
  } catch {
    return []
  }
}

export async function fetchAndStoreNews(targetId: string): Promise<number> {
  const target = await db.target.findUnique({ where: { id: targetId } })
  if (!target) return 0

  // Ensure industry queries exist
  const industry = target.industry ?? await detectAndSaveIndustry(targetId)
  if (!industry) return 0

  const queries = parseIndustryQueries(industry)

  // Fetch all queries in parallel
  const results = await Promise.all(queries.map(fetchNewsForQuery))
  const allItems = results.flat()

  if (allItems.length === 0) return 0

  // Get existing URLs for this target to deduplicate
  const existing = await db.newsItem.findMany({
    where: { targetId },
    select: { url: true },
  })
  const existingUrls = new Set(existing.map((n: { url: string }) => n.url))

  const newItems = allItems.filter(item => !existingUrls.has(item.url))
  if (newItems.length === 0) return 0

  await db.newsItem.createMany({
    data: newItems.map(item => ({
      targetId,
      headline: item.headline,
      url: item.url,
      source: item.source,
      publishedAt: item.publishedAt,
    })),
  })

  return newItems.length
}
