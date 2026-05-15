// Hermes — Entity Resolution
// Matches, merges, and flags duplicate entities across ingestion sources

import { db } from '@/lib/db'
import { findSimilarEntities } from './vector-ops'
import type { StepEvent } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Levenshtein distance between two strings.
 * Classic dynamic programming implementation.
 */
export function levenshteinDistance(a: string, b: string): number {
  const la = a.length
  const lb = b.length
  if (la === 0) return lb
  if (lb === 0) return la

  // Use two rows instead of full matrix for space efficiency
  let prev = new Array(lb + 1)
  let curr = new Array(lb + 1)

  for (let j = 0; j <= lb; j++) prev[j] = j

  for (let i = 1; i <= la; i++) {
    curr[0] = i
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost, // substitution
      )
    }
    ;[prev, curr] = [curr, prev]
  }

  return prev[lb]
}

/**
 * Normalize a URL to its base domain.
 * Strips protocol, www, trailing slashes, paths.
 */
export function normalizeDomain(url: string): string {
  try {
    let cleaned = url.trim().toLowerCase()
    if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
      cleaned = 'https://' + cleaned
    }
    const parsed = new URL(cleaned)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    // If URL parsing fails, do basic cleanup
    return url
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CandidateTarget {
  id: string
  name: string
  company: string
  websiteUrl: string | null
  linkedin: string | null
  sourceType: string | null
  hasEmbedding: boolean
}

interface MatchPair {
  sourceId: string
  matchId: string
  matchType: 'domain' | 'linkedin' | 'fuzzy_name' | 'embedding'
  confidence: number
  details: string
}

// ---------------------------------------------------------------------------
// Main Entity Resolution
// ---------------------------------------------------------------------------

function makeStep(
  step: number,
  name: string,
  status: StepEvent['status'],
  durationMs: number,
  extra?: Partial<StepEvent>,
): StepEvent {
  return { block: 'entity_resolution', step, name, status, durationMs, ...extra }
}

/**
 * Run entity resolution across all targets.
 * 1. Load candidates
 * 2. Exact domain match
 * 3. Exact LinkedIn URL match
 * 4. Fuzzy company name match (Levenshtein <= 2)
 * 5. Embedding similarity (cosine > 0.92)
 * 6. Merge confirmed / flag uncertain
 */
export async function runEntityResolution(
  emit: (event: StepEvent) => void,
): Promise<{ merged: number; flagged: number }> {
  let t0: number
  let merged = 0
  let flagged = 0

  // -----------------------------------------------------------------------
  // Step 1: Load candidate records
  // -----------------------------------------------------------------------
  t0 = Date.now()
  emit(makeStep(1, 'Load candidate records', 'running', 0))

  const allTargets = await db.$queryRawUnsafe(`
    SELECT id, name, company, "websiteUrl", linkedin, "sourceType",
           (embedding IS NOT NULL) AS "hasEmbedding"
    FROM "Target"
    ORDER BY "createdAt" ASC
  `) as CandidateTarget[]

  emit(makeStep(1, 'Load candidate records', 'success', Date.now() - t0, {
    output: { candidateCount: allTargets.length },
  }))

  if (allTargets.length < 2) {
    emit(makeStep(2, 'Match search', 'success', 0, {
      output: { message: 'Not enough targets for entity resolution' },
    }))
    return { merged: 0, flagged: 0 }
  }

  const matches: MatchPair[] = []
  const seenPairs = new Set<string>()

  function addMatch(pair: MatchPair) {
    const key = [pair.sourceId, pair.matchId].sort().join('|')
    if (!seenPairs.has(key)) {
      seenPairs.add(key)
      matches.push(pair)
    }
  }

  // -----------------------------------------------------------------------
  // Step 2: Exact domain URL match
  // -----------------------------------------------------------------------
  t0 = Date.now()
  emit(makeStep(2, 'Exact domain match', 'running', 0))

  const domainMap = new Map<string, string[]>()
  for (const t of allTargets) {
    if (t.websiteUrl) {
      const domain = normalizeDomain(t.websiteUrl)
      if (domain) {
        const existing = domainMap.get(domain) || []
        existing.push(t.id)
        domainMap.set(domain, existing)
      }
    }
  }

  let domainMatches = 0
  for (const [domain, ids] of domainMap) {
    if (ids.length > 1) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          addMatch({
            sourceId: ids[i],
            matchId: ids[j],
            matchType: 'domain',
            confidence: 0.95,
            details: `Shared domain: ${domain}`,
          })
          domainMatches++
        }
      }
    }
  }

  emit(makeStep(2, 'Exact domain match', 'success', Date.now() - t0, {
    output: { domainMatches },
  }))

  // -----------------------------------------------------------------------
  // Step 3: Exact LinkedIn URL match
  // -----------------------------------------------------------------------
  t0 = Date.now()
  emit(makeStep(3, 'Exact LinkedIn match', 'running', 0))

  const linkedinMap = new Map<string, string[]>()
  for (const t of allTargets) {
    if (t.linkedin) {
      const normalized = t.linkedin.trim().toLowerCase().replace(/\/$/, '')
      const existing = linkedinMap.get(normalized) || []
      existing.push(t.id)
      linkedinMap.set(normalized, existing)
    }
  }

  let linkedinMatches = 0
  for (const [url, ids] of linkedinMap) {
    if (ids.length > 1) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          addMatch({
            sourceId: ids[i],
            matchId: ids[j],
            matchType: 'linkedin',
            confidence: 0.98,
            details: `Shared LinkedIn: ${url}`,
          })
          linkedinMatches++
        }
      }
    }
  }

  emit(makeStep(3, 'Exact LinkedIn match', 'success', Date.now() - t0, {
    output: { linkedinMatches },
  }))

  // -----------------------------------------------------------------------
  // Step 4: Fuzzy company name match (Levenshtein <= 2)
  // -----------------------------------------------------------------------
  t0 = Date.now()
  emit(makeStep(4, 'Fuzzy name match', 'running', 0))

  let fuzzyMatches = 0
  const normalizedNames = allTargets.map((t) => ({
    id: t.id,
    normalized: t.company.trim().toLowerCase().replace(/[^a-z0-9\s]/g, ''),
  }))

  // O(n^2) but typically n is small (hundreds, not millions)
  for (let i = 0; i < normalizedNames.length; i++) {
    for (let j = i + 1; j < normalizedNames.length; j++) {
      const a = normalizedNames[i]
      const b = normalizedNames[j]
      // Only compare if names are roughly the same length (optimization)
      if (Math.abs(a.normalized.length - b.normalized.length) <= 2) {
        const dist = levenshteinDistance(a.normalized, b.normalized)
        if (dist <= 2 && dist > 0) {
          addMatch({
            sourceId: a.id,
            matchId: b.id,
            matchType: 'fuzzy_name',
            confidence: dist === 1 ? 0.85 : 0.7,
            details: `Levenshtein distance: ${dist} ("${a.normalized}" vs "${b.normalized}")`,
          })
          fuzzyMatches++
        }
      }
    }
  }

  emit(makeStep(4, 'Fuzzy name match', 'success', Date.now() - t0, {
    output: { fuzzyMatches },
  }))

  // -----------------------------------------------------------------------
  // Step 5: Embedding similarity (cosine > 0.92)
  // -----------------------------------------------------------------------
  t0 = Date.now()
  emit(makeStep(5, 'Embedding similarity match', 'running', 0))

  let embeddingMatches = 0
  const targetsWithEmbeddings = allTargets.filter((t) => t.hasEmbedding)

  // For each target with an embedding, find similar entities
  // Process in smaller chunks to avoid overwhelming the DB
  const EMBED_BATCH = 20
  for (let i = 0; i < targetsWithEmbeddings.length; i += EMBED_BATCH) {
    const batch = targetsWithEmbeddings.slice(i, i + EMBED_BATCH)

    for (const target of batch) {
      try {
        // Fetch this target's embedding
        const rows = await db.$queryRawUnsafe(
          `SELECT embedding::text FROM "Target" WHERE id = $1 AND embedding IS NOT NULL`,
          target.id,
        ) as { embedding: string }[]

        if (rows.length === 0) continue

        const embText = rows[0].embedding
        const embedding = embText
          .replace(/^\[/, '')
          .replace(/\]$/, '')
          .split(',')
          .map(Number)

        const similar = await findSimilarEntities(embedding, 0.92, target.id)

        for (const match of similar) {
          addMatch({
            sourceId: target.id,
            matchId: match.id,
            matchType: 'embedding',
            confidence: match.similarity,
            details: `Cosine similarity: ${match.similarity.toFixed(4)}`,
          })
          embeddingMatches++
        }
      } catch (err) {
        console.error(`Embedding similarity check failed for ${target.id}:`, err)
      }
    }
  }

  emit(makeStep(5, 'Embedding similarity match', 'success', Date.now() - t0, {
    output: { embeddingMatches },
  }))

  // -----------------------------------------------------------------------
  // Step 6: Merge confirmed / flag uncertain
  // -----------------------------------------------------------------------
  t0 = Date.now()
  emit(makeStep(6, 'Merge & flag results', 'running', 0))

  for (const match of matches) {
    if (match.confidence >= 0.9) {
      // High confidence — auto-merge: keep the richer record
      try {
        const [source, target] = await Promise.all([
          db.target.findUnique({
            where: { id: match.sourceId },
            select: {
              id: true, synthesizedBlob: true, notes: true,
              websiteUrl: true, linkedin: true, email: true,
              industry: true, founderName: true, score: true,
              _count: { select: { activities: true, newsItems: true, fundingRounds: true } },
            },
          }),
          db.target.findUnique({
            where: { id: match.matchId },
            select: {
              id: true, synthesizedBlob: true, notes: true,
              websiteUrl: true, linkedin: true, email: true,
              industry: true, founderName: true, score: true,
              _count: { select: { activities: true, newsItems: true, fundingRounds: true } },
            },
          }),
        ])

        if (!source || !target) continue

        // Determine which record is "richer"
        const sourceRichness =
          (source.synthesizedBlob?.length || 0) +
          (source._count.activities + source._count.newsItems + source._count.fundingRounds) * 100

        const targetRichness =
          (target.synthesizedBlob?.length || 0) +
          (target._count.activities + target._count.newsItems + target._count.fundingRounds) * 100

        const keepId = sourceRichness >= targetRichness ? source.id : target.id
        const mergeId = keepId === source.id ? target.id : source.id
        const keep = keepId === source.id ? source : target
        const merge = keepId === source.id ? target : source

        // Enrich the keeper with any missing fields from the merged record
        const updateData: Record<string, any> = {}
        if (!keep.websiteUrl && merge.websiteUrl) updateData.websiteUrl = merge.websiteUrl
        if (!keep.linkedin && merge.linkedin) updateData.linkedin = merge.linkedin
        if (!keep.email && merge.email) updateData.email = merge.email
        if (!keep.industry && merge.industry) updateData.industry = merge.industry
        if (!keep.founderName && merge.founderName) updateData.founderName = merge.founderName
        if (!keep.notes && merge.notes) updateData.notes = merge.notes

        // Append synthesized blobs if both exist
        if (keep.synthesizedBlob && merge.synthesizedBlob) {
          updateData.synthesizedBlob =
            keep.synthesizedBlob + '\n\n---\n\n' + merge.synthesizedBlob
        } else if (!keep.synthesizedBlob && merge.synthesizedBlob) {
          updateData.synthesizedBlob = merge.synthesizedBlob
        }

        if (Object.keys(updateData).length > 0) {
          await db.target.update({ where: { id: keepId }, data: updateData })
        }

        // Reassign related records from merged to keeper
        await Promise.all([
          db.activity.updateMany({
            where: { targetId: mergeId },
            data: { targetId: keepId },
          }),
          db.newsItem.updateMany({
            where: { targetId: mergeId },
            data: { targetId: keepId },
          }),
          db.fundingRound.updateMany({
            where: { targetId: mergeId },
            data: { targetId: keepId },
          }),
          db.person.updateMany({
            where: { targetId: mergeId },
            data: { targetId: keepId },
          }),
        ])

        // Delete the merged record
        await db.target.delete({ where: { id: mergeId } })
        merged++
      } catch (err) {
        console.error(`Failed to merge ${match.sourceId} + ${match.matchId}:`, err)
      }
    } else {
      // Lower confidence — flag for manual review
      try {
        await db.activity.create({
          data: {
            targetId: match.sourceId,
            type: 'note',
            description: `[Entity Resolution] Possible duplicate: ${match.matchType} match (confidence: ${(match.confidence * 100).toFixed(0)}%). ${match.details}`,
          },
        })
        flagged++
      } catch (err) {
        console.error(`Failed to flag match ${match.sourceId} <> ${match.matchId}:`, err)
      }
    }
  }

  emit(makeStep(6, 'Merge & flag results', 'success', Date.now() - t0, {
    output: { merged, flagged, totalMatches: matches.length },
  }))

  return { merged, flagged }
}
