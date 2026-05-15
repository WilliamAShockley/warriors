// Hermes Enrichment — Text Blob Synthesis via Claude Haiku
//
// Generates the synthesized text blob that will be embedded for vector search.
// Quality here is critical — everything downstream depends on this blob.

import { anthropic } from '@/lib/claude'
import type { FundingRoundData } from '../enrichment-types'

interface SynthesisInput {
  companyName: string
  founderName?: string | null
  websiteUrl?: string | null
  industry?: string | null
  notes?: string | null
  stage?: string
  websiteContent?: { homepage: string; about: string }
  fundingRounds?: FundingRoundData[]
  founderTwitter?: { handle: string; bio: string; recentPosts: string[] }
  email?: string | null
}

/**
 * Synthesize all enriched data into a coherent text blob for embedding.
 * Uses Claude Haiku to produce a dense, information-rich paragraph.
 *
 * Example output:
 * "Valinor is a New York-based startup building onchain infrastructure for
 *  private credit markets. Founded by Connor Dougherty, a former Goldman Sachs
 *  VP who previously built DeFi protocols at Compound. The company raised a
 *  $12M Series A led by a16z crypto in January 2024..."
 */
export async function synthesizeTextBlob(input: SynthesisInput): Promise<string> {
  const contextParts: string[] = []

  contextParts.push(`Company: ${input.companyName}`)

  if (input.founderName) {
    contextParts.push(`Founder/CEO: ${input.founderName}`)
  }

  if (input.websiteUrl) {
    contextParts.push(`Website: ${input.websiteUrl}`)
  }

  if (input.industry) {
    contextParts.push(`Industry: ${input.industry}`)
  }

  if (input.stage) {
    contextParts.push(`Deal stage: ${input.stage.replace(/_/g, ' ')}`)
  }

  if (input.notes) {
    contextParts.push(`Notes: ${input.notes}`)
  }

  if (input.websiteContent) {
    if (input.websiteContent.homepage) {
      contextParts.push(
        `Homepage content:\n${input.websiteContent.homepage.slice(0, 2000)}`,
      )
    }
    if (input.websiteContent.about) {
      contextParts.push(
        `About page content:\n${input.websiteContent.about.slice(0, 2000)}`,
      )
    }
  }

  if (input.fundingRounds && input.fundingRounds.length > 0) {
    const fundingText = input.fundingRounds
      .map((r) => {
        const parts = [r.stage, r.amount, r.date, r.leadInvestor].filter(Boolean)
        const co = r.coInvestors?.length ? ` (co-investors: ${r.coInvestors.join(', ')})` : ''
        return `- ${parts.join(' | ')}${co}`
      })
      .join('\n')
    contextParts.push(`Funding rounds:\n${fundingText}`)
  }

  if (input.founderTwitter) {
    if (input.founderTwitter.handle) {
      contextParts.push(`Founder Twitter: ${input.founderTwitter.handle}`)
    }
    if (input.founderTwitter.bio) {
      contextParts.push(`Founder Twitter bio: ${input.founderTwitter.bio}`)
    }
    if (input.founderTwitter.recentPosts.length > 0) {
      contextParts.push(
        `Recent tweets:\n${input.founderTwitter.recentPosts.slice(0, 5).map((p) => `- ${p}`).join('\n')}`,
      )
    }
  }

  if (input.email) {
    contextParts.push(`Contact email: ${input.email}`)
  }

  const contextBlock = contextParts.join('\n\n')

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `You are a VC analyst writing a concise company profile for an internal database. Using ALL the data below, write a single dense paragraph (3-6 sentences) that captures:

1. What the company does (product/market)
2. Who founded it and their background (if known)
3. Funding status and key investors (if known)
4. Any notable signals (recent tweets, industry trends, traction)

Be factual and specific. Do not add speculation. If data is missing, skip that aspect — do not mention it's missing. Write in third person. This text will be used for semantic search, so include specific keywords and details.

Data:
${contextBlock}

Company profile paragraph:`,
        },
      ],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    return text || buildFallbackBlob(input)
  } catch (err) {
    console.error(`[hermes/enrichment/synthesize] Failed for ${input.companyName}:`, err)
    return buildFallbackBlob(input)
  }
}

/**
 * Fallback: build a basic text blob from structured data if LLM synthesis fails.
 */
function buildFallbackBlob(input: SynthesisInput): string {
  const parts: string[] = []

  parts.push(input.companyName)

  if (input.industry) {
    parts.push(`operates in ${input.industry}`)
  }

  if (input.founderName) {
    parts.push(`founded by ${input.founderName}`)
  }

  if (input.fundingRounds && input.fundingRounds.length > 0) {
    const latest = input.fundingRounds[0]
    const fundingDesc = [latest.stage, latest.amount].filter(Boolean).join(' ')
    if (fundingDesc) parts.push(`raised ${fundingDesc}`)
  }

  if (input.notes) {
    parts.push(input.notes)
  }

  return parts.join('. ') + '.'
}
