import { anthropic } from './claude'
import { db } from './db'

export async function detectAndSaveIndustry(targetId: string): Promise<string> {
  const target = await db.target.findUnique({ where: { id: targetId } })
  if (!target) return ''
  if (target.industry) return target.industry

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Company: "${target.company}"${target.notes ? `\nContext: ${target.notes}` : ''}

List 3 Google News search queries (one per line, no bullets) that would surface the most relevant recent news about this company and its industry. Be specific — use the company name in at least one query, and use industry keywords in the others.`,
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  const queries = text.split('\n').map(q => q.trim()).filter(Boolean).slice(0, 3)
  const industry = queries.join('|||')

  await db.target.update({ where: { id: targetId }, data: { industry } })
  return industry
}

export function parseIndustryQueries(industry: string): string[] {
  return industry.split('|||').map(q => q.trim()).filter(Boolean)
}
