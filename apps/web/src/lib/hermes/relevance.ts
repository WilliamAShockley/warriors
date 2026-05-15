// Hermes Ingestion Pipeline — Relevance Gate (Claude Haiku classification)

import { anthropic } from '@/lib/claude'
import type { RawSignal } from './types'

const RELEVANCE_THRESHOLD = 0.4

export interface RelevanceResult {
  relevant: boolean
  score: number
  reason: string
}

/**
 * Classify a RawSignal for investment relevance using Claude Haiku.
 * Returns a score 0-1 and a reason. Passes if score >= 0.4.
 */
export async function classifyRelevance(signal: RawSignal): Promise<RelevanceResult> {
  const signalText = [
    `Name: ${signal.name}`,
    signal.description ? `Description: ${signal.description}` : null,
    signal.url ? `URL: ${signal.url}` : null,
    signal.rawContent ? `Content: ${signal.rawContent.slice(0, 500)}` : null,
    signal.author ? `Author: ${signal.author}` : null,
    `Source: ${signal.source}`,
    `Entity Type: ${signal.entityType}`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `You are a venture capital analyst classifying incoming signals for relevance. Score this signal 0-1 based on whether it is about a company, product, fundraise, hire, market trend, or technology that could be relevant for venture capital investment research.

Score guidelines:
- 0.8-1.0: Direct company/startup mention, fundraise announcement, key hire
- 0.5-0.7: Industry trend, technology development, market analysis relevant to startups
- 0.2-0.4: Tangentially related, generic news, opinion pieces
- 0.0-0.1: Completely irrelevant (sports, entertainment, politics unrelated to tech)

Signal:
${signalText}

Respond with ONLY a JSON object: {"score": 0.X, "reason": "one sentence explanation"}`,
        },
      ],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { relevant: false, score: 0, reason: 'Failed to parse LLM response' }
    }

    const parsed = JSON.parse(jsonMatch[0])
    const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(1, parsed.score)) : 0
    const reason = typeof parsed.reason === 'string' ? parsed.reason : 'No reason provided'

    return {
      relevant: score >= RELEVANCE_THRESHOLD,
      score,
      reason,
    }
  } catch (err) {
    console.error('Relevance classification failed:', err)
    // On error, let the signal through with a neutral score
    return {
      relevant: true,
      score: 0.5,
      reason: 'Classification failed — defaulting to pass-through',
    }
  }
}

/**
 * Batch classify signals, returning only those that pass the relevance gate.
 */
export async function filterByRelevance(
  signals: RawSignal[],
): Promise<{ signal: RawSignal; relevance: RelevanceResult }[]> {
  const results: { signal: RawSignal; relevance: RelevanceResult }[] = []

  // Process in parallel batches of 5 to avoid rate limits
  const batchSize = 5
  for (let i = 0; i < signals.length; i += batchSize) {
    const batch = signals.slice(i, i + batchSize)
    const classifications = await Promise.all(batch.map((s) => classifyRelevance(s)))

    for (let j = 0; j < batch.length; j++) {
      const relevance = classifications[j]
      if (relevance.relevant) {
        results.push({ signal: batch[j], relevance })
      }
    }
  }

  return results
}
