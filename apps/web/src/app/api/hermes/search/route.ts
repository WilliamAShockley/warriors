// Hermes — Semantic Search API
// GET /api/hermes/search?q=tokenized+private+credit&limit=20&cluster=optional_cluster_id

import { NextResponse } from 'next/server'
import { embed } from '@/lib/hermes/embeddings'
import { semanticSearch, type SearchFilters } from '@/lib/hermes/vector-ops'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const query = url.searchParams.get('q')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100)
  const clusterId = url.searchParams.get('cluster') || undefined
  const sourceType = url.searchParams.get('sourceType') || undefined

  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: 'Query parameter "q" is required' },
      { status: 400 },
    )
  }

  try {
    // 1. Embed the query via Voyage AI
    const queryEmbedding = await embed(query)

    // 2. Build filters
    const filters: SearchFilters = {}
    if (clusterId) filters.clusterId = clusterId
    if (sourceType) filters.sourceType = sourceType

    // 3. Run pgvector similarity search (fetch more than limit for re-ranking)
    const fetchLimit = Math.min(limit * 3, 100)
    const rawResults = await semanticSearch(queryEmbedding, fetchLimit, filters)

    // 4. Re-rank by combined score: cosine similarity (0.6) + Target.score (0.4)
    const reranked = rawResults.map((r) => {
      const cosinePart = r.similarity * 0.6
      const scorePart = (r.score ?? 0) * 0.4
      return {
        ...r,
        combinedScore: cosinePart + scorePart,
      }
    })

    reranked.sort((a, b) => b.combinedScore - a.combinedScore)

    // 5. Trim to requested limit
    const results = reranked.slice(0, limit).map((r) => ({
      id: r.id,
      name: r.name,
      company: r.company,
      similarity: parseFloat(r.similarity.toFixed(4)),
      score: r.score !== null ? parseFloat(r.score.toFixed(4)) : null,
      combinedScore: parseFloat(r.combinedScore.toFixed(4)),
      cluster: r.clusterId,
      synthesizedBlob: r.synthesizedBlob
        ? r.synthesizedBlob.slice(0, 300) + (r.synthesizedBlob.length > 300 ? '...' : '')
        : null,
      sourceType: r.sourceType,
    }))

    return NextResponse.json({ results, query, count: results.length })
  } catch (err: any) {
    console.error('Hermes search error:', err)
    return NextResponse.json(
      { error: 'Search failed', details: err.message },
      { status: 500 },
    )
  }
}
