// Hermes — Embedding Pipeline
// Generates and stores vector embeddings for targets using Voyage AI + pgvector

import { db } from '@/lib/db'
import { embed, embedBatch } from './embeddings'
import { upsertEmbedding, cosineSimilarity } from './vector-ops'
import type { StepEvent } from './types'

const EXPECTED_DIMENSIONS = 1024

// ---------------------------------------------------------------------------
// Helper: emit a step event with timing
// ---------------------------------------------------------------------------

function makeStep(
  block: string,
  step: number,
  name: string,
  status: StepEvent['status'],
  durationMs: number,
  extra?: Partial<StepEvent>,
): StepEvent {
  return { block, step, name, status, durationMs, ...extra }
}

// ---------------------------------------------------------------------------
// Single Target Embedding Pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full embedding pipeline for a single target:
 * 1. Load synthesized blob
 * 2. Call Voyage AI
 * 3. Validate dimensions
 * 4. Upsert to pgvector
 * 5. Sanity check (self-similarity)
 */
export async function runEmbeddingPipeline(
  targetId: string,
  emit: (event: StepEvent) => void,
): Promise<void> {
  const block = 'embedding'
  let t0: number

  // Step 1: Load synthesized blob
  t0 = Date.now()
  emit(makeStep(block, 1, 'Load synthesized blob', 'running', 0))

  const target = await db.target.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, company: true, synthesizedBlob: true },
  })

  if (!target) {
    emit(makeStep(block, 1, 'Load synthesized blob', 'error', Date.now() - t0, {
      error: `Target ${targetId} not found`,
    }))
    return
  }

  if (!target.synthesizedBlob) {
    emit(makeStep(block, 1, 'Load synthesized blob', 'error', Date.now() - t0, {
      error: `Target ${targetId} has no synthesizedBlob — run enrichment first`,
    }))
    return
  }

  emit(makeStep(block, 1, 'Load synthesized blob', 'success', Date.now() - t0, {
    output: { targetName: target.name, blobLength: target.synthesizedBlob.length },
  }))

  // Step 2: Call Voyage AI
  t0 = Date.now()
  emit(makeStep(block, 2, 'Generate embedding via Voyage AI', 'running', 0))

  let embedding: number[]
  try {
    embedding = await embed(target.synthesizedBlob)
  } catch (err: any) {
    emit(makeStep(block, 2, 'Generate embedding via Voyage AI', 'error', Date.now() - t0, {
      error: err.message,
    }))
    return
  }

  emit(makeStep(block, 2, 'Generate embedding via Voyage AI', 'success', Date.now() - t0, {
    output: { dimensions: embedding.length },
  }))

  // Step 3: Validate dimensions
  t0 = Date.now()
  emit(makeStep(block, 3, 'Validate dimensions', 'running', 0))

  if (embedding.length !== EXPECTED_DIMENSIONS) {
    emit(makeStep(block, 3, 'Validate dimensions', 'error', Date.now() - t0, {
      error: `Expected ${EXPECTED_DIMENSIONS} dimensions, got ${embedding.length}`,
    }))
    return
  }

  emit(makeStep(block, 3, 'Validate dimensions', 'success', Date.now() - t0, {
    output: { dimensions: EXPECTED_DIMENSIONS },
  }))

  // Step 4: Upsert to pgvector
  t0 = Date.now()
  emit(makeStep(block, 4, 'Upsert embedding to pgvector', 'running', 0))

  try {
    await upsertEmbedding(targetId, embedding)
  } catch (err: any) {
    emit(makeStep(block, 4, 'Upsert embedding to pgvector', 'error', Date.now() - t0, {
      error: err.message,
    }))
    return
  }

  emit(makeStep(block, 4, 'Upsert embedding to pgvector', 'success', Date.now() - t0))

  // Step 5: Sanity check — self-similarity should be > 0.99
  t0 = Date.now()
  emit(makeStep(block, 5, 'Similarity sanity check', 'running', 0))

  try {
    const selfSim = await cosineSimilarity(targetId, embedding)
    if (selfSim < 0.5) {
      emit(makeStep(block, 5, 'Similarity sanity check', 'error', Date.now() - t0, {
        error: `Self-similarity too low: ${selfSim.toFixed(4)}`,
      }))
      return
    }

    emit(makeStep(block, 5, 'Similarity sanity check', 'success', Date.now() - t0, {
      output: { selfSimilarity: selfSim.toFixed(4) },
    }))
  } catch (err: any) {
    emit(makeStep(block, 5, 'Similarity sanity check', 'error', Date.now() - t0, {
      error: err.message,
    }))
  }
}

// ---------------------------------------------------------------------------
// Batch Embedding Pipeline
// ---------------------------------------------------------------------------

/**
 * Embed all targets that have a synthesizedBlob but no embedding.
 * Processes in batches of 50.
 */
export async function embedAllTargets(): Promise<{
  embedded: number
  skipped: number
  failed: number
}> {
  const BATCH_SIZE = 50
  let embedded = 0
  let skipped = 0
  let failed = 0

  // Find targets that need embedding
  // We can't filter on Unsupported("vector") with Prisma, so use raw SQL
  const candidates = await db.$queryRawUnsafe(`
    SELECT id, "synthesizedBlob"
    FROM "Target"
    WHERE "synthesizedBlob" IS NOT NULL
      AND embedding IS NULL
  `) as { id: string; synthesizedBlob: string }[]

  if (candidates.length === 0) {
    return { embedded: 0, skipped: 0, failed: 0 }
  }

  // Process in batches
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE)
    const texts = batch.map((c) => c.synthesizedBlob)

    try {
      const embeddings = await embedBatch(texts)

      for (let j = 0; j < batch.length; j++) {
        const emb = embeddings[j]
        if (!emb || emb.length !== EXPECTED_DIMENSIONS) {
          console.error(`Invalid embedding for target ${batch[j].id}: got ${emb?.length ?? 0} dims`)
          failed++
          continue
        }

        try {
          await upsertEmbedding(batch[j].id, emb)
          embedded++
        } catch (err) {
          console.error(`Failed to upsert embedding for target ${batch[j].id}:`, err)
          failed++
        }
      }
    } catch (err) {
      console.error(`Batch embedding failed for batch starting at index ${i}:`, err)
      failed += batch.length
    }
  }

  return { embedded, skipped, failed }
}
