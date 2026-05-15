import { db } from '@/lib/db'
import { runEmbeddingPipeline, embedAllTargets } from '@/lib/hermes/embedding-pipeline'
import { runEntityResolution } from '@/lib/hermes/entity-resolution'
import { runScoring } from '@/lib/hermes/scoring'
import { runClustering } from '@/lib/hermes/clustering'
import { runIngestion, runMultiSourceIngestion } from '@/lib/hermes/ingestion'
import { runEnrichment } from '@/lib/hermes/enrichment'
import { runOutreach } from '@/lib/hermes/outreach'
import type { StepEvent, IngestionSource } from '@/lib/hermes/types'

// Step definitions per block (mirrors the frontend BLOCKS constant)
const BLOCK_STEPS: Record<string, string[]> = {
  ingestion: [
    'Init connector',
    'Execute search',
    'Parse response',
    'LLM extraction',
    'Schema validation',
    'Write to staging',
  ],
  enrichment: [
    'Load target',
    'Funding data',
    'Website scrape',
    'Email lookup',
    'Twitter enrichment',
    'Text blob synthesis',
    'Write enriched record',
  ],
  embedding: [
    'Load blob',
    'Call embedding model',
    'Validate dimensions',
    'Upsert to pgvector',
    'Similarity sanity check',
  ],
  clustering: [
    'Fetch embeddings',
    'Run HDBSCAN',
    'Report stats',
    'LLM label generation',
    'Write clusters',
    'Update target cluster IDs',
  ],
  entity_resolution: [
    'Load candidates',
    'Primary URL match',
    'Fuzzy name match',
    'Embedding similarity',
    'Merge duplicates',
    'Flag uncertain',
  ],
  scoring: [
    'Load entity + signals',
    'Thesis fit',
    'Recency decay',
    'Signal volume',
    'Investor/founder boost',
    'Write score',
  ],
  search: [
    'Accept query',
    'Embed query',
    'pgvector search',
    'Score-weighted rerank',
    'Sub-topic labeling',
    'Return results',
  ],
  outreach: [
    'Load target + enrichment',
    'Build LLM context',
    'Generate draft',
    'Validate quality',
    'Save to approval queue',
    'Confirm gate',
  ],
}

// Simulated input/output payloads per block for realistic step data
function stubInput(block: string, stepIdx: number): Record<string, unknown> {
  const base: Record<string, Record<string, unknown>[]> = {
    ingestion: [
      { connector: 'parallel_api', config: { maxResults: 50 } },
      { query: 'AI infrastructure startups Series A', sources: ['parallel', 'crunchbase'] },
      { rawResults: 47, format: 'json' },
      { model: 'claude-sonnet-4-20250514', candidates: 47 },
      { schema: 'Target', requiredFields: ['name', 'company', 'sourceUrl'] },
      { validRecords: 32, destination: 'staging_targets' },
    ],
    enrichment: [
      { targetId: 'clx_abc123', company: 'Acme AI' },
      { targetId: 'clx_abc123', sources: ['crunchbase', 'pitchbook'] },
      { url: 'https://acme-ai.com', timeout: 5000 },
      { domain: 'acme-ai.com', patterns: ['info@', 'hello@', 'founders@'] },
      { handle: '@acmeai', fields: ['bio', 'followers', 'recent_tweets'] },
      { fields: ['company', 'funding', 'website_text', 'emails', 'twitter'] },
      { targetId: 'clx_abc123', enrichedFields: 6 },
    ],
    embedding: [
      { targetId: 'clx_abc123', blobLength: 2847 },
      { model: 'text-embedding-3-large', dimensions: 1024 },
      { expected: 1024, received: 1024 },
      { table: 'targets', operation: 'upsert', id: 'clx_abc123' },
      { topK: 5, threshold: 0.7 },
    ],
    clustering: [
      { count: 156, dimensions: 1024 },
      { minClusterSize: 5, minSamples: 3, metric: 'cosine' },
      { clustersFormed: 12, noisePoints: 8 },
      { model: 'claude-sonnet-4-20250514', clusters: 12 },
      { destination: 'clusters', count: 12 },
      { targetsUpdated: 148, orphans: 8 },
    ],
    entity_resolution: [
      { candidates: 312, threshold: 0.85 },
      { candidatePairs: 48360, urlField: 'websiteUrl' },
      { remaining: 47200, algorithm: 'jaro_winkler', threshold: 0.9 },
      { remaining: 46800, model: 'text-embedding-3-large' },
      { duplicateSets: 23, totalMerged: 51 },
      { uncertainPairs: 7, confidenceRange: [0.75, 0.85] },
    ],
    scoring: [
      { entityId: 'clx_abc123', signalCount: 14 },
      { thesisKeywords: ['AI', 'infrastructure', 'developer tools'] },
      { halfLifeDays: 90, signalDates: '2024-01..2024-06' },
      { totalSignals: 14, uniqueSources: 6 },
      { hasFounderLinkedin: true, investorMentions: 3 },
      { entityId: 'clx_abc123', finalScore: 0.847 },
    ],
    search: [
      { query: 'AI companies building developer infrastructure', limit: 20 },
      { model: 'text-embedding-3-large', queryLength: 48 },
      { index: 'targets_embedding', topK: 50, efSearch: 200 },
      { candidates: 50, scoreField: 'score', alpha: 0.3 },
      { results: 20, model: 'claude-sonnet-4-20250514' },
      { count: 20, format: 'ranked_list' },
    ],
    outreach: [
      { targetId: 'clx_abc123', company: 'Acme AI', founder: 'Jane Smith' },
      { sections: ['company_brief', 'funding', 'thesis_fit', 'mutual_connections'] },
      { model: 'claude-sonnet-4-20250514', tone: 'warm_professional', maxTokens: 500 },
      { checks: ['no_hallucination', 'correct_name', 'personalized', 'under_500_words'] },
      { queueId: 'oq_xyz789', status: 'pending_review' },
      { gateType: 'human_approval', autoSend: false },
    ],
  }
  return base[block]?.[stepIdx] ?? { step: stepIdx + 1 }
}

function stubOutput(block: string, stepIdx: number): Record<string, unknown> {
  const base: Record<string, Record<string, unknown>[]> = {
    ingestion: [
      { connected: true, latencyMs: 45 },
      { resultsReturned: 47, apiCallMs: 1230 },
      { parsed: 47, errors: 0 },
      { extracted: 32, skipped: 15, reason: 'insufficient_data' },
      { valid: 32, invalid: 0 },
      { written: 32, table: 'staging_targets' },
    ],
    enrichment: [
      { loaded: true, existingFields: 4 },
      { rounds: 2, lastRound: 'Series A — $12M', leadInvestor: 'Sequoia' },
      { pageTitle: 'Acme AI — Developer Infrastructure', textLength: 3200 },
      { found: ['jane@acme-ai.com'], confidence: 0.92 },
      { followers: 2340, bio: 'Building the future of developer tools', recentTweets: 5 },
      { blobLength: 2847, sections: 5 },
      { updated: true, enrichedFields: ['funding', 'website', 'email', 'twitter', 'blob'] },
    ],
    embedding: [
      { blobPreview: 'Acme AI is a developer infrastructure company...', tokens: 412 },
      { dimensions: 1024, model: 'text-embedding-3-large', latencyMs: 89 },
      { valid: true, l2Norm: 1.0 },
      { upserted: true, rowsAffected: 1 },
      { topMatch: 'BuildKit AI', similarity: 0.89, sanityPass: true },
    ],
    clustering: [
      { loaded: 156, dimensions: 1024 },
      { clusters: 12, noisePoints: 8, silhouetteScore: 0.72 },
      { avgClusterSize: 12.3, largestCluster: 28, smallestCluster: 5 },
      { labels: ['AI Dev Tools', 'Fintech Infrastructure', 'Health AI', '...'] },
      { written: 12, table: 'clusters' },
      { updated: 148, unassigned: 8 },
    ],
    entity_resolution: [
      { loaded: 312, pairsToCheck: 48360 },
      { urlMatches: 18, confirmed: 18 },
      { fuzzyMatches: 12, falsePositives: 3, confirmed: 9 },
      { embeddingMatches: 5, threshold: 0.95 },
      { mergedGroups: 23, recordsRemoved: 51, survivingRecords: 261 },
      { flagged: 7, reviewRequired: true },
    ],
    scoring: [
      { signals: 14, categories: ['funding', 'news', 'social', 'website'] },
      { thesisFitScore: 0.91, matchedKeywords: ['AI', 'infrastructure'] },
      { decayMultiplier: 0.85, oldestSignalDays: 145 },
      { volumeScore: 0.78, normalizedCount: 14 },
      { founderBoost: 0.05, investorBoost: 0.03 },
      { finalScore: 0.847, written: true },
    ],
    search: [
      { accepted: true, queryTokens: 8 },
      { dimensions: 1024, latencyMs: 12 },
      { candidates: 50, searchTimeMs: 34 },
      { reranked: 20, topScore: 0.94, bottomScore: 0.61 },
      { subtopics: ['Developer Tools', 'CI/CD', 'API Infrastructure'] },
      { returned: 20, topResult: 'Acme AI', topScore: 0.94 },
    ],
    outreach: [
      { loaded: true, founderName: 'Jane Smith', founderEmail: 'jane@acme-ai.com' },
      { contextLength: 1847, sections: 4 },
      { draftLength: 342, subject: 'Loved your approach to dev infra' },
      { passed: true, checks: { noHallucination: true, correctName: true, personalized: true, underWordLimit: true } },
      { queued: true, queuePosition: 3 },
      { confirmed: true, gate: 'human_approval', autoSend: false },
    ],
  }
  return base[block]?.[stepIdx] ?? { ok: true }
}

// Blocks that have real pipeline implementations
const REAL_BLOCKS = new Set(['ingestion', 'enrichment', 'embedding', 'clustering', 'entity_resolution', 'scoring', 'outreach'])

/**
 * Run a real pipeline block, streaming step events as NDJSON.
 * Each pipeline function accepts an `emit` callback that we wire to the stream.
 */
async function runRealBlock(
  block: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  body: Record<string, any>,
): Promise<{ allEvents: StepEvent[]; hasFailed: boolean }> {
  const allEvents: StepEvent[] = []
  let hasFailed = false

  function emit(event: StepEvent) {
    if (event.status === 'error') hasFailed = true
    allEvents.push(event)
    controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
  }

  try {
    switch (block) {
      case 'ingestion': {
        // Accept queries + sources from request body
        const queries: string[] = body.queries ?? []
        const sources: IngestionSource[] = body.sources ?? ['hackernews', 'google_news', 'techcrunch']

        if (queries.length === 0) {
          emit({ block, step: 0, name: 'No queries provided', status: 'error', durationMs: 0, error: 'Provide at least one search query via the thesis decomposer' })
          break
        }

        // Build configs: each query x each source
        const configs = queries.flatMap(query =>
          sources.map(source => ({ source, query, maxResults: 10 }))
        )

        emit({ block, step: 0, name: 'Pipeline started', status: 'success', durationMs: 0, output: { totalConfigs: configs.length, queries, sources } as any })
        await runMultiSourceIngestion(configs, emit)
        break
      }

      case 'enrichment': {
        const targetId = body.targetId as string | undefined
        if (targetId) {
          await runEnrichment(targetId, emit)
        } else {
          // Enrich all targets missing synthesized blobs
          const targets = await db.target.findMany({
            where: { synthesizedBlob: null },
            select: { id: true, company: true },
            take: 10,
          })
          emit({ block, step: 0, name: 'Batch enrichment started', status: 'success', durationMs: 0, output: { targetsToEnrich: targets.length } as any })
          for (const t of targets) {
            await runEnrichment(t.id, emit)
          }
        }
        break
      }

      case 'embedding': {
        emit({ block, step: 1, name: 'Find targets needing embeddings', status: 'running', durationMs: 0 })
        const t0 = Date.now()
        const result = await embedAllTargets()
        emit({
          block,
          step: 1,
          name: 'Batch embedding pipeline',
          status: result.failed > 0 ? 'error' : 'success',
          durationMs: Date.now() - t0,
          output: result as any,
          error: result.failed > 0 ? `${result.failed} targets failed to embed` : null,
        })
        break
      }

      case 'clustering':
        await runClustering(emit)
        break

      case 'entity_resolution':
        await runEntityResolution(emit)
        break

      case 'scoring':
        await runScoring(emit)
        break

      case 'outreach': {
        const targetId = body.targetId as string | undefined
        if (targetId) {
          await runOutreach(targetId, emit)
        } else {
          emit({ block, step: 0, name: 'No target specified', status: 'error', durationMs: 0, error: 'Provide a targetId to generate outreach' })
        }
        break
      }
    }
  } catch (err: any) {
    hasFailed = true
    const errorEvent: StepEvent = {
      block,
      step: 0,
      name: 'Pipeline error',
      status: 'error',
      durationMs: 0,
      error: err.message || String(err),
    }
    allEvents.push(errorEvent)
    controller.enqueue(encoder.encode(JSON.stringify(errorEvent) + '\n'))
    console.error(`[hermes] Real block "${block}" failed:`, err)
  }

  return { allEvents, hasFailed }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ block: string }> }
) {
  const { block } = await params

  const steps = BLOCK_STEPS[block]
  if (!steps) {
    return Response.json({ error: `Unknown block: ${block}` }, { status: 400 })
  }

  // Parse request body for real block params (queries, targetId, sources, etc.)
  let body: Record<string, any> = {}
  try {
    body = await req.json()
  } catch {
    // No body is fine for blocks that don't need params
  }

  const encoder = new TextEncoder()
  const startedAt = new Date()

  const stream = new ReadableStream({
    async start(controller) {
      let hasFailed = false
      let allEvents: any[] = []

      if (REAL_BLOCKS.has(block)) {
        // ---------- Real pipeline execution ----------
        const result = await runRealBlock(block, controller, encoder, body)
        allEvents = result.allEvents
        hasFailed = result.hasFailed
      } else {
        // ---------- Stub simulation for blocks not yet wired ----------
        for (let i = 0; i < steps.length; i++) {
          const stepNum = i + 1

          // Emit "running" event
          const runningEvent = {
            block,
            step: stepNum,
            name: steps[i],
            status: 'running' as const,
            durationMs: 0,
            input: stubInput(block, i),
          }
          controller.enqueue(encoder.encode(JSON.stringify(runningEvent) + '\n'))

          // Simulate processing time (150-800ms per step)
          const delay = 150 + Math.floor(Math.random() * 650)
          await new Promise(resolve => setTimeout(resolve, delay))

          // Simulate occasional failure (10% chance on step 4+ for realism)
          const shouldFail = i >= 3 && Math.random() < 0.1
          const status = shouldFail ? 'error' : 'success'
          if (shouldFail) hasFailed = true

          const completedEvent = {
            block,
            step: stepNum,
            name: steps[i],
            status,
            durationMs: delay,
            input: stubInput(block, i),
            ...(shouldFail
              ? { error: `Simulated failure in "${steps[i]}": connection timeout after ${delay}ms` }
              : { output: stubOutput(block, i) }),
          }

          allEvents.push(completedEvent)
          controller.enqueue(encoder.encode(JSON.stringify(completedEvent) + '\n'))

          // Stop execution on failure
          if (shouldFail) break
        }
      }

      // Save the run to the database
      const completedAt = new Date()
      const totalDurationMs = completedAt.getTime() - startedAt.getTime()
      try {
        await db.hermesRun.create({
          data: {
            block,
            status: hasFailed ? 'failed' : 'passed',
            steps: JSON.stringify(allEvents),
            durationMs: totalDurationMs,
            startedAt,
            completedAt,
          },
        })
      } catch {
        // DB write failure should not break the stream
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked',
    },
  })
}
