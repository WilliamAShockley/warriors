import { db } from './db'
import { draftColdEmail } from './draftEmail'
import { anthropic } from './claude'
import Parallel from 'parallel-web'

export async function extractFounderName(content: string): Promise<string | null> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: `Extract the CEO's full name from this text. If no CEO is explicitly mentioned, pick the founder most likely to be CEO (e.g. "Founder & CEO", "Co-Founder & CEO", or the sole founder). Reply with ONLY the person's name (e.g. "John Smith") and nothing else. If no founder name is found, reply with exactly "NONE".

${content}`,
      }],
    })
    const result = message.content[0]
    const name = result.type === 'text' ? result.text.trim() : null
    if (!name || name === 'NONE') return null
    return name
  } catch {
    return null
  }
}

export function guessEmail(founderName: string, websiteUrl: string): string | null {
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
      input: `Who is the CEO of ${cleanUrl}? If no CEO is listed, who is the founder most likely to be CEO?`,
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
    const name = await extractFounderName(content)

    if (name) {
      const nameParts = name.trim().split(/\s+/)
      const firstName = nameParts[0]
      const lastName = nameParts.slice(1).join(' ') || null
      const email = !hasEmail ? guessEmail(name, websiteUrl) : null
      await db.target.update({ where: { id: targetId }, data: { founderName: name, founderFirstName: firstName, founderLastName: lastName, ...(email && { email }) } })
      await db.activity.create({
        data: {
          targetId,
          type: 'founder_identified',
          description: `Founder identified via Parallel (${confidence}): ${name}${email ? ` (${email})` : ''}`,
        },
      })
      draftColdEmail(targetId).catch(() => {})
    }
  } catch (err) {
    console.error(`Founder search failed for target ${targetId}:`, err)
  }
}
