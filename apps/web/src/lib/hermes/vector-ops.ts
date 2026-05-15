// Hermes — pgvector Operations via Prisma $queryRawUnsafe
// Handles vector similarity search, upserts, and entity resolution queries

import { db } from '@/lib/db'
import { toPgVector } from './embeddings'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchResult {
  id: string
  name: string
  company: string
  synthesizedBlob: string | null
  score: number | null
  sourceType: string | null
  clusterId: string | null
  similarity: number
}

export interface SearchFilters {
  sourceType?: string
  clusterId?: string
  minScore?: number
}

export interface SimilarEntity {
  id: string
  name: string
  company: string
  similarity: number
}

// ---------------------------------------------------------------------------
// Upsert Embeddings
// ---------------------------------------------------------------------------

/**
 * Store / update a Target's embedding vector in pgvector.
 */
export async function upsertEmbedding(
  targetId: string,
  embedding: number[],
): Promise<void> {
  const vectorStr = toPgVector(embedding)
  await db.$queryRawUnsafe(
    `UPDATE "Target" SET embedding = $1::vector WHERE id = $2`,
    vectorStr,
    targetId,
  )
}

/**
 * Store / update a Person's embedding vector in pgvector.
 */
export async function upsertPersonEmbedding(
  personId: string,
  embedding: number[],
): Promise<void> {
  const vectorStr = toPgVector(embedding)
  await db.$queryRawUnsafe(
    `UPDATE "Person" SET embedding = $1::vector WHERE id = $2`,
    vectorStr,
    personId,
  )
}

/**
 * Store / update a Cluster's embedding vector in pgvector.
 */
export async function upsertClusterEmbedding(
  clusterId: string,
  embedding: number[],
): Promise<void> {
  const vectorStr = toPgVector(embedding)
  await db.$queryRawUnsafe(
    `UPDATE "Cluster" SET embedding = $1::vector WHERE id = $2`,
    vectorStr,
    clusterId,
  )
}

// ---------------------------------------------------------------------------
// Semantic Search
// ---------------------------------------------------------------------------

/**
 * Semantic search over Target embeddings using cosine distance.
 * Returns targets ordered by similarity (highest first).
 */
export async function semanticSearch(
  queryEmbedding: number[],
  limit: number = 20,
  filters?: SearchFilters,
): Promise<SearchResult[]> {
  const vectorStr = toPgVector(queryEmbedding)

  // Build WHERE clauses dynamically
  const conditions: string[] = ['embedding IS NOT NULL']
  const params: any[] = [vectorStr]
  let paramIdx = 2

  if (filters?.sourceType) {
    conditions.push(`"sourceType" = $${paramIdx}`)
    params.push(filters.sourceType)
    paramIdx++
  }
  if (filters?.clusterId) {
    conditions.push(`"clusterId" = $${paramIdx}`)
    params.push(filters.clusterId)
    paramIdx++
  }
  if (filters?.minScore !== undefined) {
    conditions.push(`score >= $${paramIdx}`)
    params.push(filters.minScore)
    paramIdx++
  }

  conditions.push(`1 = 1`) // sentinel for trailing AND safety
  const whereClause = conditions.join(' AND ')

  params.push(limit)
  const limitParam = `$${paramIdx}`

  const sql = `
    SELECT id, name, company, "synthesizedBlob", score, "sourceType", "clusterId",
           1 - (embedding <=> $1::vector) AS similarity
    FROM "Target"
    WHERE ${whereClause}
    ORDER BY embedding <=> $1::vector
    LIMIT ${limitParam}
  `

  const rows = await db.$queryRawUnsafe(sql, ...params) as any[]

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    company: r.company,
    synthesizedBlob: r.synthesizedBlob,
    score: r.score !== null ? Number(r.score) : null,
    sourceType: r.sourceType,
    clusterId: r.clusterId,
    similarity: Number(r.similarity),
  }))
}

// ---------------------------------------------------------------------------
// Entity Resolution Helpers
// ---------------------------------------------------------------------------

/**
 * Find entities whose embedding cosine similarity exceeds a threshold.
 * Used for entity resolution — finding likely duplicates.
 */
export async function findSimilarEntities(
  embedding: number[],
  threshold: number = 0.92,
  excludeId?: string,
): Promise<SimilarEntity[]> {
  const vectorStr = toPgVector(embedding)

  let sql: string
  let params: any[]

  if (excludeId) {
    sql = `
      SELECT id, name, company,
             1 - (embedding <=> $1::vector) AS similarity
      FROM "Target"
      WHERE embedding IS NOT NULL
        AND id != $2
        AND 1 - (embedding <=> $1::vector) > $3
      ORDER BY embedding <=> $1::vector
      LIMIT 50
    `
    params = [vectorStr, excludeId, threshold]
  } else {
    sql = `
      SELECT id, name, company,
             1 - (embedding <=> $1::vector) AS similarity
      FROM "Target"
      WHERE embedding IS NOT NULL
        AND 1 - (embedding <=> $1::vector) > $2
      ORDER BY embedding <=> $1::vector
      LIMIT 50
    `
    params = [vectorStr, threshold]
  }

  const rows = await db.$queryRawUnsafe(sql, ...params) as any[]

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    company: r.company,
    similarity: Number(r.similarity),
  }))
}

/**
 * Fetch all target embeddings as raw number arrays.
 * Used for clustering. Returns only targets that have embeddings.
 */
export async function fetchAllEmbeddings(): Promise<
  { id: string; name: string; company: string; embedding: number[] }[]
> {
  const rows = await db.$queryRawUnsafe(`
    SELECT id, name, company, embedding::text
    FROM "Target"
    WHERE embedding IS NOT NULL
  `) as any[]

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    company: r.company,
    embedding: parseVectorText(r.embedding),
  }))
}

/**
 * Parse pgvector text representation '[0.1,0.2,...]' into a number array.
 */
function parseVectorText(text: string): number[] {
  const stripped = text.replace(/^\[/, '').replace(/\]$/, '')
  return stripped.split(',').map(Number)
}

/**
 * Compute cosine similarity between query embedding and a specific target.
 * Used for sanity checks.
 */
export async function cosineSimilarity(
  targetId: string,
  queryEmbedding: number[],
): Promise<number> {
  const vectorStr = toPgVector(queryEmbedding)

  const rows = await db.$queryRawUnsafe(
    `SELECT 1 - (embedding <=> $1::vector) AS similarity
     FROM "Target"
     WHERE id = $2 AND embedding IS NOT NULL`,
    vectorStr,
    targetId,
  ) as any[]

  if (rows.length === 0) return 0
  return Number(rows[0].similarity)
}
