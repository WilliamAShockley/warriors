// Hermes Outreach — LLM-Personalized Email Draft Generation
//
// Replaces template substitution with a full Claude Opus call.
// Receives full context: company summary, founder background,
// funding stage, recent news, sub-topic. Generates a short,
// personalized email referencing specific signals.

import { anthropic } from '@/lib/claude'
import { db } from '@/lib/db'

export interface PersonalizedDraft {
  subject: string
  body: string
}

/**
 * Generate a personalized cold email draft using Claude Opus.
 * Pulls all available enrichment data from the DB and builds
 * a rich context block for the LLM.
 */
export async function generatePersonalizedDraft(
  targetId: string,
): Promise<PersonalizedDraft> {
  // Load target with all related data
  const target = await db.target.findUnique({
    where: { id: targetId },
    include: {
      fundingRounds: { orderBy: { createdAt: 'desc' } },
      persons: true,
      outreachBrief: true,
      newsItems: { orderBy: { publishedAt: 'desc' }, take: 5 },
      activities: { orderBy: { date: 'desc' }, take: 10 },
    },
  })

  if (!target) {
    throw new Error(`Target ${targetId} not found`)
  }

  // Build context block
  const contextParts: string[] = []

  // Company basics
  contextParts.push(`Company: ${target.company}`)
  if (target.websiteUrl) contextParts.push(`Website: ${target.websiteUrl}`)
  if (target.industry) contextParts.push(`Industry: ${target.industry}`)
  contextParts.push(`Deal stage: ${target.stage.replace(/_/g, ' ')}`)

  // Synthesized blob (the richest single source of context)
  if (target.synthesizedBlob) {
    contextParts.push(`Company profile:\n${target.synthesizedBlob}`)
  }

  // Founder info
  const founderName = target.founderName ?? target.name
  const founderFirstName = target.founderFirstName ?? founderName.split(' ')[0]
  contextParts.push(`Founder/CEO: ${founderName}`)

  // Person records (career history, twitter, etc.)
  if (target.persons.length > 0) {
    const personDetails = target.persons
      .map((p) => {
        const parts = [`${p.name} (${p.currentRole ?? 'role unknown'})`]
        if (p.bio) parts.push(`Bio: ${p.bio}`)
        if (p.careerHistory) {
          try {
            const history = JSON.parse(p.careerHistory)
            if (Array.isArray(history)) {
              parts.push(
                `Career: ${history.map((h: any) => `${h.role} at ${h.employer}`).join(', ')}`,
              )
            }
          } catch { /* ignore parse errors */ }
        }
        if (p.twitterHandle) parts.push(`Twitter: ${p.twitterHandle}`)
        return parts.join('\n  ')
      })
      .join('\n\n')
    contextParts.push(`Key people:\n${personDetails}`)
  }

  // Funding rounds
  if (target.fundingRounds.length > 0) {
    const fundingText = target.fundingRounds
      .map((r) => {
        const parts = [r.stage, r.amount].filter(Boolean)
        if (r.leadInvestor) parts.push(`led by ${r.leadInvestor}`)
        if (r.date) parts.push(`(${r.date.toISOString().split('T')[0]})`)
        return `- ${parts.join(' | ')}`
      })
      .join('\n')
    contextParts.push(`Funding history:\n${fundingText}`)
  }

  // Outreach brief
  if (target.outreachBrief) {
    contextParts.push(`Outreach brief summary: ${target.outreachBrief.summary}`)
    contextParts.push(`Funding stage assessment: ${target.outreachBrief.fundingStage}`)
  }

  // Recent news
  if (target.newsItems.length > 0) {
    const newsText = target.newsItems
      .map((n) => `- ${n.headline} (${n.source}, ${n.publishedAt.toISOString().split('T')[0]})`)
      .join('\n')
    contextParts.push(`Recent news:\n${newsText}`)
  }

  // Notes
  if (target.notes) {
    contextParts.push(`Internal notes: ${target.notes}`)
  }

  const contextBlock = contextParts.join('\n\n')

  // Generate with Claude Opus
  const message = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 600,
    messages: [
      {
        role: 'user',
        content: `You are writing a cold email from a venture capitalist to ${founderName} (${founderFirstName}), the founder of ${target.company}. Write a short, personalized outreach email.

RULES:
- Subject line: short, specific, no clickbait. Reference something concrete about their company.
- Body: 3-5 sentences max. Open with a specific signal (recent funding, product launch, tweet, news, etc.) that shows you did your homework.
- Tone: warm, direct, not sycophantic. Peer-to-peer, not sales-y.
- End with a soft ask (15-min call, coffee, etc.) — never "I'd love to invest."
- Use ${founderFirstName}'s first name.
- Do NOT use placeholders like [Your Name] — leave the sign-off as just a dash.
- Return ONLY a JSON object: {"subject": "...", "body": "..."}

Context about the company and founder:
${contextBlock}`,
      },
    ],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  if (!raw) {
    throw new Error('Empty response from Claude Opus')
  }

  // Parse JSON from response
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Failed to extract JSON from Claude response')
  }

  const parsed = JSON.parse(jsonMatch[0])
  return {
    subject: parsed.subject ?? '',
    body: parsed.body ?? '',
  }
}
