// Hermes — Scoring Engine
// Computes a weighted relevance score for each target based on:
//   thesis fit, recency, signal volume, investor/founder boosts

import { db } from '@/lib/db'
import { embed } from './embeddings'
import { toPgVector } from './embeddings'
import type { StepEvent } from './types'

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

const WEIGHT_THESIS_FIT = 0.4
const WEIGHT_RECENCY = 0.25
const WEIGHT_SIGNAL_VOLUME = 0.2
const WEIGHT_BOOSTS = 0.15

// Known tier-1 VCs — boost if a target is backed by one
const WATCHLIST_VCS = new Set([
  'a16z', 'andreessen horowitz',
  'paradigm',
  'sequoia', 'sequoia capital',
  'polychain', 'polychain capital',
  'multicoin', 'multicoin capital',
  'pantera', 'pantera capital',
  'dragonfly',
  'framework ventures',
  'electric capital',
  'coinbase ventures',
  'binance labs',
  'galaxy digital',
  'variant', 'variant fund',
  'placeholder', 'placeholder ventures',
  'haun ventures',
  'lightspeed',
])

// Keywords indicating TradFi + crypto crossover background
const TRADFI_KEYWORDS = [
  'goldman', 'morgan stanley', 'jpmorgan', 'jp morgan', 'citadel',
  'jane street', 'two sigma', 'de shaw', 'bridgewater', 'blackrock',
  'point72', 'millennium', 'barclays', 'deutsche bank', 'ubs',
  'credit suisse', 'citi', 'bank of america', 'merrill',
]
const CRYPTO_KEYWORDS = [
  'crypto', 'blockchain', 'web3', 'defi', 'nft', 'token', 'protocol',
  'smart contract', 'dao', 'solidity', 'ethereum', 'bitcoin', 'solana',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStep(
  step: number,
  name: string,
  status: StepEvent['status'],
  durationMs: number,
  extra?: Partial<StepEvent>,
): StepEvent {
  return { block: 'scoring', step, name, status, durationMs, ...extra }
}

/**
 * Check if text contains TradFi + crypto crossover keywords.
 */
function hasTradFiCryptoBackground(text: string): boolean {
  const lower = text.toLowerCase()
  const hasTradFi = TRADFI_KEYWORDS.some((kw) => lower.includes(kw))
  const hasCrypto = CRYPTO_KEYWORDS.some((kw) => lower.includes(kw))
  return hasTradFi && hasCrypto
}

/**
 * Check if any investor in the funding rounds is on the watchlist.
 */
function hasWatchlistVC(fundingRounds: { leadInvestor: string | null; coInvestors: string | null }[]): boolean {
  for (const round of fundingRounds) {
    if (round.leadInvestor) {
      const lead = round.leadInvestor.trim().toLowerCase()
      if (WATCHLIST_VCS.has(lead)) return true
    }
    if (round.coInvestors) {
      try {
        const coInvestors: string[] = JSON.parse(round.coInvestors)
        for (const inv of coInvestors) {
          if (WATCHLIST_VCS.has(inv.trim().toLowerCase())) return true
        }
      } catch {
        // coInvestors might be a comma-separated string
        const parts = round.coInvestors.split(',')
        for (const inv of parts) {
          if (WATCHLIST_VCS.has(inv.trim().toLowerCase())) return true
        }
      }
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Score a single target
// ---------------------------------------------------------------------------

/**
 * Score a single target. Returns the computed score (0-1).
 *
 * @param targetId - The target to score
 * @param thesisEmbedding - Optional pre-computed thesis embedding for batch scoring
 */
export async function scoreTarget(
  targetId: string,
  thesisEmbedding?: number[],
): Promise<number> {
  // Load target with all signals
  const target = await db.target.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      name: true,
      company: true,
      synthesizedBlob: true,
      founderName: true,
      activities: {
        select: { date: true, type: true },
        orderBy: { date: 'desc' },
      },
      newsItems: {
        select: { publishedAt: true },
        orderBy: { publishedAt: 'desc' },
      },
      fundingRounds: {
        select: { leadInvestor: true, coInvestors: true, date: true },
      },
      persons: {
        select: { bio: true, careerHistory: true },
      },
    },
  })

  if (!target) return 0

  // ------- 1. Thesis fit (cosine similarity, 0-1) -------
  let thesisFit = 0.5 // default if no embedding available
  if (thesisEmbedding) {
    const vectorStr = toPgVector(thesisEmbedding)
    try {
      const rows = await db.$queryRawUnsafe(
        `SELECT 1 - (embedding <=> $1::vector) AS similarity
         FROM "Target"
         WHERE id = $2 AND embedding IS NOT NULL`,
        vectorStr,
        targetId,
      ) as { similarity: number }[]

      if (rows.length > 0) {
        thesisFit = Math.max(0, Math.min(1, Number(rows[0].similarity)))
      }
    } catch {
      // If query fails (no embedding), keep default
    }
  }

  // ------- 2. Recency decay -------
  const allDates: Date[] = [
    ...target.activities.map((a) => new Date(a.date)),
    ...target.newsItems.map((n) => new Date(n.publishedAt)),
    ...target.fundingRounds
      .filter((r) => r.date)
      .map((r) => new Date(r.date!)),
  ]

  let recency = 0.1 // low default if no signals
  if (allDates.length > 0) {
    const mostRecent = Math.max(...allDates.map((d) => d.getTime()))
    const daysSince = (Date.now() - mostRecent) / (1000 * 60 * 60 * 24)
    recency = Math.exp(-0.02 * daysSince)
  }

  // ------- 3. Signal volume -------
  const distinctSources = new Set<string>()
  for (const a of target.activities) distinctSources.add(`activity_${a.type}`)
  for (const n of target.newsItems) distinctSources.add('news')
  for (const f of target.fundingRounds) distinctSources.add('funding')
  if (target.synthesizedBlob) distinctSources.add('synthesized')
  if (target.persons.length > 0) distinctSources.add('persons')

  const signalVolume = Math.min(distinctSources.size / 5, 1)

  // ------- 4. Investor/founder boosts -------
  let boosts = 0

  // VC watchlist boost
  if (hasWatchlistVC(target.fundingRounds)) {
    boosts += 0.1
  }

  // TradFi + crypto founder background boost
  const founderTexts = [
    ...(target.persons || []).map((p) => [p.bio || '', p.careerHistory || ''].join(' ')),
    target.synthesizedBlob || '',
  ].join(' ')

  if (hasTradFiCryptoBackground(founderTexts)) {
    boosts += 0.1
  }

  // Cap boosts at 1
  boosts = Math.min(boosts, 1)

  // ------- Final weighted score -------
  const finalScore =
    WEIGHT_THESIS_FIT * thesisFit +
    WEIGHT_RECENCY * recency +
    WEIGHT_SIGNAL_VOLUME * signalVolume +
    WEIGHT_BOOSTS * boosts

  // Clamp to 0-1
  const clamped = Math.max(0, Math.min(1, finalScore))

  // Write score to DB
  await db.target.update({
    where: { id: targetId },
    data: { score: clamped },
  })

  return clamped
}

// ---------------------------------------------------------------------------
// Batch scoring
// ---------------------------------------------------------------------------

/**
 * Score all targets with embeddings. Uses MonitorTheme descriptions
 * to generate the thesis embedding.
 */
export async function runScoring(
  emit: (event: StepEvent) => void,
): Promise<void> {
  let t0: number

  // -----------------------------------------------------------------------
  // Step 1: Load all targets and signals
  // -----------------------------------------------------------------------
  t0 = Date.now()
  emit(makeStep(1, 'Load entities and signals', 'running', 0))

  const targets = await db.target.findMany({
    select: { id: true, name: true },
  })

  emit(makeStep(1, 'Load entities and signals', 'success', Date.now() - t0, {
    output: { targetCount: targets.length },
  }))

  if (targets.length === 0) return

  // -----------------------------------------------------------------------
  // Step 2: Generate thesis embedding from MonitorTheme descriptions
  // -----------------------------------------------------------------------
  t0 = Date.now()
  emit(makeStep(2, 'Generate thesis embedding', 'running', 0))

  let thesisEmbedding: number[] | undefined
  try {
    const themes = await db.monitorTheme.findMany({
      where: { enabled: true },
      select: { name: true, description: true },
    })

    if (themes.length > 0) {
      const thesisText = themes
        .map((t) => `${t.name}: ${t.description}`)
        .join('\n\n')
      thesisEmbedding = await embed(thesisText)
    }
  } catch (err: any) {
    console.error('Failed to generate thesis embedding:', err)
  }

  emit(makeStep(2, 'Generate thesis embedding', 'success', Date.now() - t0, {
    output: { hasThesis: !!thesisEmbedding },
  }))

  // -----------------------------------------------------------------------
  // Step 3: Compute recency decay for all targets
  // -----------------------------------------------------------------------
  t0 = Date.now()
  emit(makeStep(3, 'Compute recency decay', 'running', 0))
  // (Handled per-target in scoreTarget)
  emit(makeStep(3, 'Compute recency decay', 'success', Date.now() - t0))

  // -----------------------------------------------------------------------
  // Step 4: Compute signal volume
  // -----------------------------------------------------------------------
  t0 = Date.now()
  emit(makeStep(4, 'Compute signal volume', 'running', 0))
  // (Handled per-target in scoreTarget)
  emit(makeStep(4, 'Compute signal volume', 'success', Date.now() - t0))

  // -----------------------------------------------------------------------
  // Step 5: Compute investor/founder boosts
  // -----------------------------------------------------------------------
  t0 = Date.now()
  emit(makeStep(5, 'Compute investor/founder boosts', 'running', 0))
  // (Handled per-target in scoreTarget)
  emit(makeStep(5, 'Compute investor/founder boosts', 'success', Date.now() - t0))

  // -----------------------------------------------------------------------
  // Step 6: Write final scores
  // -----------------------------------------------------------------------
  t0 = Date.now()
  emit(makeStep(6, 'Score all targets', 'running', 0))

  let scored = 0
  let failed = 0

  for (const target of targets) {
    try {
      await scoreTarget(target.id, thesisEmbedding)
      scored++
    } catch (err) {
      console.error(`Failed to score target ${target.id}:`, err)
      failed++
    }
  }

  emit(makeStep(6, 'Score all targets', 'success', Date.now() - t0, {
    output: { scored, failed },
  }))
}
