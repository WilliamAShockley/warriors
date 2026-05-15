// Hermes Source Adapter — Hacker News (via Algolia API)
// Refactored from monitorScan.ts fetchHackerNews()

import type { RawSignal } from '../types'

/**
 * Search Hacker News stories via the Algolia HN API.
 * Returns each story as a RawSignal.
 */
export async function searchHackerNews(
  query: string,
  maxResults: number = 10,
): Promise<RawSignal[]> {
  try {
    const res = await fetch(
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${maxResults}`,
      { signal: AbortSignal.timeout(10_000) },
    )

    if (!res.ok) {
      console.error(`[hermes] HN API returned ${res.status}`)
      return []
    }

    const data = await res.json()
    const hits = data.hits ?? []

    return hits
      .filter((h: any) => h.title && h.url)
      .map((h: any): RawSignal => ({
        entityType: 'signal',
        source: 'hackernews',
        name: h.title,
        description: h.title,
        url: h.url,
        sourceUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
        publishedAt: h.created_at ?? undefined,
        author: h.author ?? undefined,
        rawContent: h.story_text ?? undefined,
        metadata: {
          objectID: h.objectID,
          points: h.points,
          numComments: h.num_comments,
        },
      }))
  } catch (err) {
    console.error('[hermes] Hacker News search failed:', err)
    return []
  }
}
