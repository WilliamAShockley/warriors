import { anthropic } from './claude'
import { db } from './db'

export async function generateAndSaveResearchBrief(targetId: string, force = false): Promise<string> {
  const target = await db.target.findUnique({
    where: { id: targetId },
    include: { researchBrief: true },
  })
  if (!target) return ''
  if (target.researchBrief && !force) return target.researchBrief.content

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `You are a VC analyst. Write a structured one-pager company brief for **${target.company}**${target.notes ? ` (context: ${target.notes})` : ''}.

Format it in clean markdown with these sections:

## What They Do
2–3 sentences on core product/service.

## Market
Target market, rough size, key tailwinds.

## Business Model
How they make money.

## Competitive Landscape
Key competitors and how ${target.company} differentiates.

## Recent Developments
Any notable funding rounds, partnerships, product launches, or press. If unknown, note that.

## VC Angle
Why this company is or isn't interesting from a venture perspective. Be direct.

Keep each section tight — this is a one-pager, not a memo. Be specific and opinionated.`,
    }],
  })

  const content = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  if (!content) return ''

  await db.researchBrief.upsert({
    where: { targetId },
    create: { targetId, content },
    update: { content },
  })

  return content
}
