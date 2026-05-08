import { db } from './db'
import Parallel from 'parallel-web'

function extractCleanName(content: string): string {
  // Look for bold names that are actual person names (not headers like "Founders of...")
  const boldMatches = (content.match(/\*\*([^*]+)\*\*/g) ?? [])
    .map(m => m.replace(/\*\*/g, '').trim())
    .filter(m => m.includes(' ') && !m.toLowerCase().includes('founder') && !m.endsWith(':'))

  if (boldMatches.length > 0) return boldMatches[0]

  // Look for "- Name" list items (common Parallel format)
  const listMatch = content.match(/^[-•]\s+(.+?)(?:\s[–—-]\s|$)/m)
  if (listMatch) {
    const name = listMatch[1].replace(/\*\*/g, '').trim()
    if (name.includes(' ') && !name.toLowerCase().includes('founder')) return name
  }

  // Look for "Name is the founder" pattern
  const isFounder = content.match(/^(.+?)\s+is\s+the\s+(?:founder|co-founder|ceo)/im)
  if (isFounder) {
    const name = isFounder[1].replace(/\*\*/g, '').trim()
    if (name.includes(' ')) return name
  }

  // Fallback: first non-heading, non-header line
  const fallback = content.split('\n')
    .map(l => l.replace(/[#*_]/g, '').trim())
    .find(l => l && !l.toLowerCase().includes('founder') && !l.endsWith(':'))
  return fallback ?? content
}

function guessEmail(founderName: string, websiteUrl: string): string | null {
  try {
    const firstName = founderName.split(' ')[0].toLowerCase()
    if (!firstName) return null
    const hostname = websiteUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    return `${firstName}@${hostname}`
  } catch {
    return null
  }
}

export async function searchAndSaveFounder(targetId: string, websiteUrl: string) {
  const client = new Parallel({ apiKey: process.env.PARALLEL_API_KEY! })
  const cleanUrl = websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')

  try {
    const existing = await db.target.findUnique({ where: { id: targetId }, select: { email: true } })
    const hasEmail = !!existing?.email

    const taskRun = await client.taskRun.create({
      input: `Can you tell me who the founder of ${cleanUrl} is?`,
      processor: 'core-fast' as const,
      task_spec: {
        input_schema: { type: 'text' as const, description: 'The user request to execute.' },
        output_schema: { type: 'text' as const, description: 'Return a helpful final answer in clear markdown that addresses the user request.' },
      },
    })
    const runResult = await client.taskRun.result(taskRun.run_id)
    const out = runResult.output as any
    const content: string = out?.content ?? out?.output ?? JSON.stringify(out)
    const confidence: string = out?.basis?.[0]?.confidence ?? 'unknown'
    const name = extractCleanName(content)

    if (name && name !== content) {
      // Got a clean name — save it and guess the email
      const email = !hasEmail ? guessEmail(name, websiteUrl) : null
      await db.target.update({ where: { id: targetId }, data: { founderName: name, ...(email && { email }) } })
      await db.activity.create({
        data: {
          targetId,
          type: 'founder_identified',
          description: `Founder identified via Parallel (${confidence}): ${name}${email ? ` (${email})` : ''}`,
        },
      })
    } else if (content) {
      // Got a response but couldn't extract a clean name — save raw content
      const fallbackName = content.split('\n').find(l => l.trim())?.replace(/[#*_]/g, '').trim()
      if (fallbackName) {
        const email = !hasEmail ? guessEmail(fallbackName, websiteUrl) : null
        await db.target.update({ where: { id: targetId }, data: { founderName: fallbackName, ...(email && { email }) } })
        await db.activity.create({
          data: {
            targetId,
            type: 'founder_identified',
            description: `Founder identified via Parallel (${confidence}): ${fallbackName}${email ? ` (${email})` : ''}`,
          },
        })
      }
    }
  } catch (err) {
    console.error(`Founder search failed for target ${targetId}:`, err)
  }
}
