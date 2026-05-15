// Hermes Source Adapter — Google News (RSS feed)
// Refactored from monitorScan.ts fetchGoogleNews() + parseRSS()

import type { RawSignal } from '../types'

/**
 * Parse RSS XML into items with title and url.
 * Same regex-based parser as monitorScan.ts.
 */
function parseRSS(xml: string): { title: string; url: string; pubDate?: string }[] {
  const items: { title: string; url: string; pubDate?: string }[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1]
    const title =
      item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() ?? ''
    const url = item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? ''
    const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? undefined

    if (title && url) {
      items.push({ title, url, pubDate })
    }
  }

  return items
}

/**
 * Search Google News via RSS feed.
 * Returns each news item as a RawSignal.
 */
export async function searchGoogleNews(
  query: string,
  maxResults: number = 10,
): Promise<RawSignal[]> {
  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`

    const res = await fetch(rssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Warriors/1.0)' },
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      console.error(`[hermes] Google News RSS returned ${res.status}`)
      return []
    }

    const xml = await res.text()
    const items = parseRSS(xml).slice(0, maxResults)

    return items.map(
      (item): RawSignal => ({
        entityType: 'signal',
        source: 'google_news',
        name: item.title,
        description: item.title,
        url: item.url,
        sourceUrl: item.url,
        publishedAt: item.pubDate ?? undefined,
        metadata: {
          rssSource: 'google_news',
          query,
        },
      }),
    )
  } catch (err) {
    console.error('[hermes] Google News search failed:', err)
    return []
  }
}
