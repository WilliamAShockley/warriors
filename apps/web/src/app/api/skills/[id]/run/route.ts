import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { anthropic } from '@/lib/claude'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { targetId } = body

  const skill = await db.skill.findUnique({ where: { id } })
  if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })

  // Build context object from targetId if provided
  let context: Record<string, string> = {}

  if (targetId) {
    const target = await db.target.findUnique({
      where: { id: targetId },
      include: {
        activities: { orderBy: { date: 'desc' }, take: 20 },
        researchBrief: true,
        newsItems: { orderBy: { publishedAt: 'desc' }, take: 10 },
      },
    })

    if (target) {
      context = {
        name: target.name,
        company: target.company,
        stage: target.stage.replace(/_/g, ' '),
        email: target.email ?? 'not provided',
        linkedin: target.linkedin ?? 'not provided',
        notes: target.notes ?? 'none',
        last_contact: target.lastContacted
          ? new Date(target.lastContacted).toLocaleDateString()
          : 'never',
        activities: target.activities.length > 0
          ? target.activities
              .map(a => `[${a.type.toUpperCase()}] ${new Date(a.date).toLocaleDateString()}: ${a.description}`)
              .join('\n')
          : 'No activity logged',
        brief: target.researchBrief?.content ?? 'No research brief generated yet',
        news: target.newsItems.length > 0
          ? target.newsItems.map(n => `- ${n.headline} (${n.source})`).join('\n')
          : 'No news items yet',
      }
    }
  }

  // Replace {{variable}} placeholders in prompt
  let filledPrompt = skill.prompt
  for (const [key, value] of Object.entries(context)) {
    filledPrompt = filledPrompt.replaceAll(`{{${key}}}`, value)
  }

  const message = await anthropic.messages.create({
    model: skill.model as 'claude-opus-4-6' | 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{ role: 'user', content: filledPrompt }],
  })

  const output = message.content[0].type === 'text' ? message.content[0].text : ''
  return NextResponse.json({ output, skill: skill.name })
}
