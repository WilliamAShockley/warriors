// Hermes Enrichment — Funding Data via Parallel Web + Claude Haiku extraction

import Parallel from 'parallel-web'
import { anthropic } from '@/lib/claude'
import type { FundingRoundData } from '../enrichment-types'

/**
 * Search for funding round data for a company using Parallel Web,
 * then extract structured FundingRoundData[] using Claude Haiku.
 */
export async function enrichFunding(
  companyName: string,
  websiteUrl?: string,
): Promise<FundingRoundData[]> {
  const client = new Parallel({ apiKey: process.env.PARALLEL_API_KEY! })

  const query = websiteUrl
    ? `${companyName} (${websiteUrl}) funding round investors amount`
    : `${companyName} funding round investors amount`

  try {
    const taskRun = await client.taskRun.create({
      input: query,
      processor: 'core-fast' as const,
      task_spec: {
        input_schema: {
          type: 'text' as const,
          description: 'Search query for company funding data.',
        },
        output_schema: {
          type: 'text' as const,
          description:
            'Return detailed funding round information including amounts, stages, dates, and investors.',
        },
      },
    })

    const runResult = await client.taskRun.result(taskRun.run_id)
    const out = runResult.output as any
    const content: string = out?.content ?? out?.output ?? JSON.stringify(out)

    if (!content || content.length < 20) return []

    // Use Claude Haiku to extract structured funding rounds from raw content
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: `Extract all funding rounds from this text about ${companyName}. Return ONLY a JSON array of objects with these fields:
- amount: string (e.g. "$25M") or null
- stage: string (e.g. "Seed", "Series A", "Series B") or null
- date: string (e.g. "2024-03-15" or "March 2024") or null
- leadInvestor: string or null
- coInvestors: string[] or []
- sourceUrl: string or null

If no funding rounds are found, return [].

Text:
${content}`,
        },
      ],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]'
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) return []

    return parsed.map((r: any) => ({
      amount: r.amount ?? undefined,
      stage: r.stage ?? undefined,
      date: r.date ?? undefined,
      leadInvestor: r.leadInvestor ?? undefined,
      coInvestors: Array.isArray(r.coInvestors) ? r.coInvestors : undefined,
      sourceUrl: r.sourceUrl ?? undefined,
    }))
  } catch (err) {
    console.error(`[hermes/enrichment/funding] Failed for ${companyName}:`, err)
    return []
  }
}
