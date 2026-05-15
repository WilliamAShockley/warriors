// Hermes Source Adapter — Parallel Web (web research via Parallel API)
// Follows the exact pattern from monitorScan.ts and founderSearch.ts

import Parallel from 'parallel-web'
import type { RawSignal, IngestionSource } from '../types'

/**
 * Search using the Parallel Web API.
 * Used for: VC portfolio announcements, TechCrunch, TBPN, general web search.
 *
 * Matches the API usage pattern from monitorScan.ts:
 *   - Creates a taskRun with processor: 'core-fast'
 *   - Polls for result via client.taskRun.result(run_id)
 *   - Extracts content from output.content ?? output.output ?? JSON.stringify(output)
 */
export async function searchParallelWeb(
  query: string,
  source: IngestionSource,
  maxResults: number = 10,
): Promise<RawSignal[]> {
  try {
    const client = new Parallel({ apiKey: process.env.PARALLEL_API_KEY! })

    const promptBySource: Record<string, string> = {
      vc_website: `Search for venture capital firms and their recent investments related to: "${query}". For each, provide the VC firm name, website, and any recent portfolio companies mentioned.`,
      vc_portfolio: `Find portfolio companies from top VC firms related to: "${query}". For each company, provide name, website URL, what they do, and which VC invested.`,
      techcrunch: `Search TechCrunch and tech news for recent startup funding announcements and company launches related to: "${query}". Provide company name, URL, funding amount if mentioned, and a brief description.`,
      tbpn: `Search The Business & Product News for startups and companies related to: "${query}". For each, provide company name, website URL, and what they do.`,
    }

    const defaultPrompt = `Find ${maxResults} startups or companies that match this description: "${query}". For each, provide the company name, website URL, a brief description, and any funding information. Focus on real, specific companies — not categories or trends.`

    const taskRun = await client.taskRun.create({
      input: promptBySource[source] ?? defaultPrompt,
      processor: 'core-fast' as const,
      task_spec: {
        input_schema: {
          type: 'text' as const,
          description: 'Search query for companies and startups.',
        },
        output_schema: {
          type: 'text' as const,
          description: 'List of companies with names, URLs, and descriptions.',
        },
      },
    })

    const runResult = await client.taskRun.result(taskRun.run_id)
    const out = runResult.output as any
    const content: string = out?.content ?? out?.output ?? JSON.stringify(out)

    if (!content || content === '{}' || content === 'null') {
      return []
    }

    // The Parallel API returns freeform text — we return it as a single
    // signal with rawContent for downstream LLM extraction to parse
    return [
      {
        entityType: 'company',
        source,
        name: `Parallel Web: ${query.slice(0, 50)}`,
        description: `Search results for: ${query}`,
        rawContent: content,
        metadata: {
          query,
          processor: 'core-fast',
          resultType: 'parallel_batch',
        },
      },
    ]
  } catch (err) {
    console.error(`[hermes] Parallel Web search failed for source=${source}:`, err)
    return []
  }
}
