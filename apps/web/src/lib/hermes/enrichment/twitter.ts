// Hermes Enrichment — Twitter/X Profile via Parallel Web + Claude Haiku extraction

import Parallel from 'parallel-web'
import { anthropic } from '@/lib/claude'

export interface TwitterEnrichmentResult {
  handle: string
  bio: string
  recentPosts: string[]
}

/**
 * Search for a founder's Twitter/X profile and recent posts using Parallel Web,
 * then extract structured data using Claude Haiku.
 */
export async function enrichTwitter(
  founderName: string,
  companyName: string,
): Promise<TwitterEnrichmentResult> {
  const client = new Parallel({ apiKey: process.env.PARALLEL_API_KEY! })
  const empty: TwitterEnrichmentResult = { handle: '', bio: '', recentPosts: [] }

  try {
    const taskRun = await client.taskRun.create({
      input: `Find the Twitter/X profile for ${founderName}, who is a founder of ${companyName}. Return their Twitter handle, bio, and their 5 most recent tweets or posts.`,
      processor: 'core-fast' as const,
      task_spec: {
        input_schema: {
          type: 'text' as const,
          description: 'Search for a specific person\'s Twitter/X profile and recent posts.',
        },
        output_schema: {
          type: 'text' as const,
          description: 'Twitter handle, bio, and recent posts for the person.',
        },
      },
    })

    const runResult = await client.taskRun.result(taskRun.run_id)
    const out = runResult.output as any
    const content: string = out?.content ?? out?.output ?? JSON.stringify(out)

    if (!content || content.length < 20) return empty

    // Use Claude Haiku to extract structured data
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [
        {
          role: 'user',
          content: `Extract Twitter/X profile information for ${founderName} (founder of ${companyName}) from this text. Return ONLY a JSON object with these fields:
- handle: string (e.g. "@johndoe") — empty string if not found
- bio: string — their Twitter bio, empty string if not found
- recentPosts: string[] — array of recent tweet texts (up to 5), empty array if none found

If no Twitter profile is found at all, return {"handle":"","bio":"","recentPosts":[]}.

Text:
${content}`,
        },
      ],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}'
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return empty

    const parsed = JSON.parse(jsonMatch[0])
    return {
      handle: typeof parsed.handle === 'string' ? parsed.handle : '',
      bio: typeof parsed.bio === 'string' ? parsed.bio : '',
      recentPosts: Array.isArray(parsed.recentPosts)
        ? parsed.recentPosts.filter((p: any) => typeof p === 'string')
        : [],
    }
  } catch (err) {
    console.error(`[hermes/enrichment/twitter] Failed for ${founderName} at ${companyName}:`, err)
    return empty
  }
}
