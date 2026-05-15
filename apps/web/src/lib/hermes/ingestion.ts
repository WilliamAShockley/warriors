// Hermes Ingestion Pipeline — Orchestrator
// Runs the 6-step pipeline: init -> search -> parse -> extract -> validate -> write

import { db } from '@/lib/db'
import { anthropic } from '@/lib/claude'
import type { RawSignal, IngestionConfig, IngestionSource, StepEvent } from './types'
import { generateFingerprint, checkDuplicate } from './dedup'
import { classifyRelevance } from './relevance'
import {
  searchParallelWeb,
  searchHackerNews,
  searchGoogleNews,
  searchLinkedInCompanies,
  searchLinkedInFounder,
  searchLinkedInMutuals,
  searchTwitter,
  searchVCTwitter,
} from './sources'

// ---------------------------------------------------------------------------
// Source adapter dispatcher
// ---------------------------------------------------------------------------

async function executeSource(config: IngestionConfig): Promise<RawSignal[]> {
  const { source, query, maxResults } = config

  switch (source) {
    case 'hackernews':
      return searchHackerNews(query, maxResults)

    case 'google_news':
      return searchGoogleNews(query, maxResults)

    case 'vc_website':
    case 'vc_portfolio':
    case 'techcrunch':
    case 'tbpn':
      return searchParallelWeb(query, source, maxResults)

    case 'linkedin_company':
      return searchLinkedInCompanies(query, maxResults)

    case 'linkedin_founder':
      return searchLinkedInFounder(query, maxResults)

    case 'linkedin_mutuals':
      return searchLinkedInMutuals(query, maxResults)

    case 'twitter_search':
      return searchTwitter(query, maxResults)

    case 'twitter_vc':
      return searchVCTwitter(query, maxResults)

    case 'monitor_hit':
      // monitor_hit source goes through Parallel Web as default
      return searchParallelWeb(query, source, maxResults)

    default:
      console.warn(`[hermes] Unknown source: ${source}, falling back to Parallel Web`)
      return searchParallelWeb(query, source as IngestionSource, maxResults)
  }
}

// ---------------------------------------------------------------------------
// LLM Extraction — parse freeform rawContent into structured RawSignals
// ---------------------------------------------------------------------------

async function llmExtractSignals(signals: RawSignal[]): Promise<RawSignal[]> {
  const extracted: RawSignal[] = []

  for (const signal of signals) {
    // If the signal already has structured data (name != batch label), pass through
    if (
      !signal.rawContent ||
      !signal.metadata?.resultType ||
      signal.metadata.resultType !== 'parallel_batch'
    ) {
      extracted.push(signal)
      continue
    }

    // Use Haiku to extract individual companies from the Parallel Web batch result
    try {
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: `Extract individual companies or people from this web research text. For each entity found, provide:
- name: company or person name
- type: "company" or "person"
- description: 1-2 sentence description
- url: website URL if mentioned (or null)
- linkedinUrl: LinkedIn URL if mentioned (or null)

Return ONLY a JSON array. If nothing found, return [].
Example: [{"name":"Acme AI","type":"company","description":"AI trading platform","url":"https://acme.ai","linkedinUrl":null}]

Text:
${signal.rawContent.slice(0, 3000)}`,
          },
        ],
      })

      const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        extracted.push(signal)
        continue
      }

      const parsed = JSON.parse(jsonMatch[0])
      if (!Array.isArray(parsed) || parsed.length === 0) {
        extracted.push(signal)
        continue
      }

      for (const entity of parsed) {
        extracted.push({
          entityType: entity.type === 'person' ? 'person' : 'company',
          source: signal.source,
          name: entity.name ?? 'Unknown',
          description: entity.description ?? undefined,
          url: entity.url ?? undefined,
          linkedinUrl: entity.linkedinUrl ?? undefined,
          sourceUrl: signal.sourceUrl,
          metadata: {
            ...signal.metadata,
            extractedFrom: 'llm_extraction',
            originalQuery: signal.metadata?.query,
          },
        })
      }
    } catch (err) {
      console.error('[hermes] LLM extraction failed:', err)
      extracted.push(signal)
    }
  }

  return extracted
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

function validateSignal(signal: RawSignal): boolean {
  if (!signal.name || typeof signal.name !== 'string') return false
  if (!signal.source) return false
  if (!['company', 'person', 'signal'].includes(signal.entityType)) return false
  // Name must be at least 2 chars and not look like garbage
  if (signal.name.trim().length < 2) return false
  return true
}

// ---------------------------------------------------------------------------
// Write to staging — save to DB as Target, Person, or MonitorHit
// ---------------------------------------------------------------------------

async function writeToStaging(
  signal: RawSignal,
  fingerprint: string,
): Promise<{ id: string; type: 'target' | 'person' | 'monitor_hit' }> {
  if (signal.entityType === 'person') {
    const person = await db.person.create({
      data: {
        name: signal.name,
        currentRole: signal.metadata?.role ?? null,
        currentCompany: signal.metadata?.companySearched ?? null,
        linkedinUrl: signal.linkedinUrl ?? null,
        twitterHandle: signal.twitterHandle ?? null,
        bio: signal.description ?? null,
        sourceType: signal.source,
        sourceUrl: signal.sourceUrl ?? null,
      },
    })
    return { id: person.id, type: 'person' }
  }

  if (signal.entityType === 'company') {
    const target = await db.target.create({
      data: {
        name: signal.name,
        company: signal.name,
        websiteUrl: signal.url ?? null,
        linkedin: signal.linkedinUrl ?? null,
        notes: signal.description ?? null,
        sourceType: signal.source,
        sourceUrl: signal.sourceUrl ?? null,
        ingestedAt: new Date(),
        stage: 'intro_sent',
        status: 'yellow',
      },
    })
    return { id: target.id, type: 'target' }
  }

  // signal entityType -> MonitorHit (no specific theme, general signal)
  // For signals without a theme, store as a target with signal sourceType
  const target = await db.target.create({
    data: {
      name: signal.name,
      company: signal.name,
      websiteUrl: signal.url ?? null,
      notes: signal.description ?? null,
      sourceType: signal.source,
      sourceUrl: signal.sourceUrl ?? null,
      ingestedAt: new Date(),
      stage: 'intro_sent',
      status: 'yellow',
    },
  })
  return { id: target.id, type: 'target' }
}

// ---------------------------------------------------------------------------
// Step timer helper
// ---------------------------------------------------------------------------

function createStepEmitter(block: string, emit: (event: StepEvent) => void) {
  return {
    emit(
      step: number,
      name: string,
      status: StepEvent['status'],
      startTime: number,
      extra?: { input?: any; output?: any; error?: string | null },
    ) {
      emit({
        block,
        step,
        name,
        status,
        durationMs: Date.now() - startTime,
        ...extra,
      })
    },
  }
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function runIngestion(
  config: IngestionConfig,
  emit: (event: StepEvent) => void,
): Promise<RawSignal[]> {
  const block = 'ingestion'
  const stepper = createStepEmitter(block, emit)
  const allSignals: RawSignal[] = []

  // ─── Step 1: Initialize connector ───
  let t = Date.now()
  stepper.emit(1, 'Initialize connector', 'running', t, {
    input: { source: config.source, query: config.query },
  })
  try {
    // Validate the config
    if (!config.source || !config.query) {
      throw new Error('source and query are required')
    }
    stepper.emit(1, 'Initialize connector', 'success', t, {
      output: { source: config.source },
    })
  } catch (err: any) {
    stepper.emit(1, 'Initialize connector', 'error', t, {
      error: err.message,
    })
    return []
  }

  // ─── Step 2: Execute search/crawl ───
  t = Date.now()
  stepper.emit(2, 'Execute search', 'running', t)
  let rawResults: RawSignal[] = []
  try {
    rawResults = await executeSource(config)
    stepper.emit(2, 'Execute search', 'success', t, {
      output: { count: rawResults.length },
    })
  } catch (err: any) {
    stepper.emit(2, 'Execute search', 'error', t, {
      error: err.message,
    })
    return []
  }

  if (rawResults.length === 0) {
    stepper.emit(3, 'Parse response', 'success', Date.now(), {
      output: { count: 0, note: 'No results to parse' },
    })
    return []
  }

  // ─── Step 3: Parse raw response ───
  t = Date.now()
  stepper.emit(3, 'Parse response', 'running', t)
  // For most sources, parsing is already done in the adapter.
  // This step is mainly for logging/tracking.
  stepper.emit(3, 'Parse response', 'success', t, {
    output: { rawCount: rawResults.length },
  })

  // ─── Step 4: LLM extraction (if needed) ───
  t = Date.now()
  stepper.emit(4, 'LLM extraction', 'running', t)
  let extractedSignals: RawSignal[]
  try {
    extractedSignals = await llmExtractSignals(rawResults)
    stepper.emit(4, 'LLM extraction', 'success', t, {
      output: {
        beforeCount: rawResults.length,
        afterCount: extractedSignals.length,
      },
    })
  } catch (err: any) {
    stepper.emit(4, 'LLM extraction', 'error', t, {
      error: err.message,
    })
    // Fall back to raw results
    extractedSignals = rawResults
  }

  // ─── Step 5: Schema validation + relevance + dedup ───
  t = Date.now()
  stepper.emit(5, 'Validate & filter', 'running', t)
  const validSignals: RawSignal[] = []
  let invalidCount = 0
  let irrelevantCount = 0
  let dupeCount = 0

  try {
    for (const signal of extractedSignals) {
      // Validate schema
      if (!validateSignal(signal)) {
        invalidCount++
        continue
      }

      // Relevance gate
      const relevance = await classifyRelevance(signal)
      if (!relevance.relevant) {
        irrelevantCount++
        continue
      }

      // Dedup check
      const fingerprint = generateFingerprint(signal)
      const isDupe = await checkDuplicate(fingerprint, signal)
      if (isDupe) {
        dupeCount++
        continue
      }

      validSignals.push(signal)
    }

    stepper.emit(5, 'Validate & filter', 'success', t, {
      output: {
        total: extractedSignals.length,
        valid: validSignals.length,
        invalid: invalidCount,
        irrelevant: irrelevantCount,
        duplicates: dupeCount,
      },
    })
  } catch (err: any) {
    stepper.emit(5, 'Validate & filter', 'error', t, {
      error: err.message,
    })
  }

  if (validSignals.length === 0) {
    stepper.emit(6, 'Write to staging', 'success', Date.now(), {
      output: { written: 0 },
    })
    return []
  }

  // ─── Step 6: Write to staging ───
  t = Date.now()
  stepper.emit(6, 'Write to staging', 'running', t)
  const written: { id: string; type: string }[] = []
  try {
    for (const signal of validSignals) {
      const fp = generateFingerprint(signal)
      const result = await writeToStaging(signal, fp)
      written.push(result)
      allSignals.push(signal)
    }

    stepper.emit(6, 'Write to staging', 'success', t, {
      output: {
        written: written.length,
        targets: written.filter((w) => w.type === 'target').length,
        persons: written.filter((w) => w.type === 'person').length,
      },
    })
  } catch (err: any) {
    stepper.emit(6, 'Write to staging', 'error', t, {
      error: err.message,
      output: { partiallyWritten: written.length },
    })
  }

  // Log the run
  try {
    await db.hermesRun.create({
      data: {
        block: 'ingestion',
        status: 'passed',
        steps: JSON.stringify([]),
        durationMs: Date.now() - t,
        completedAt: new Date(),
      },
    })
  } catch {
    // Non-critical — don't fail the pipeline for logging
  }

  return allSignals
}

// ---------------------------------------------------------------------------
// Multi-source ingestion — run multiple configs in sequence
// ---------------------------------------------------------------------------

export async function runMultiSourceIngestion(
  configs: IngestionConfig[],
  emit: (event: StepEvent) => void,
): Promise<RawSignal[]> {
  const allSignals: RawSignal[] = []

  for (const config of configs) {
    try {
      const signals = await runIngestion(config, emit)
      allSignals.push(...signals)
    } catch (err) {
      console.error(`[hermes] Ingestion failed for source=${config.source}:`, err)
      emit({
        block: 'ingestion',
        step: 0,
        name: `Source ${config.source} failed`,
        status: 'error',
        durationMs: 0,
        error: err instanceof Error ? err.message : String(err),
      })
      // Continue with other sources — never let one crash the whole pipeline
    }
  }

  return allSignals
}
