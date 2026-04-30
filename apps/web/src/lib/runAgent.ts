import { db } from '@/lib/db'
import { anthropic } from '@/lib/claude'

function buildContext(target: {
  name: string
  company: string
  stage: string
  email: string | null
  linkedin: string | null
  lastContacted: Date | null
  notes: string | null
  activities: { type: string; date: Date; description: string }[]
  researchBrief: { content: string } | null
  newsItems: { headline: string; source: string }[]
}): Record<string, string> {
  return {
    name: target.name,
    company: target.company,
    stage: target.stage.replace(/_/g, ' '),
    email: target.email ?? 'not provided',
    linkedin: target.linkedin ?? 'not provided',
    notes: target.notes ?? 'none',
    last_contact: target.lastContacted
      ? new Date(target.lastContacted).toLocaleDateString()
      : 'never',
    activities:
      target.activities.length > 0
        ? target.activities
            .map(a => `[${a.type.toUpperCase()}] ${new Date(a.date).toLocaleDateString()}: ${a.description}`)
            .join('\n')
        : 'No activity logged',
    brief: target.researchBrief?.content ?? 'No research brief generated yet',
    news:
      target.newsItems.length > 0
        ? target.newsItems.map(n => `- ${n.headline} (${n.source})`).join('\n')
        : 'No news items yet',
  }
}

export async function runAgent(
  agentId: string,
  opts: { targetId?: string; trigger?: string } = {}
) {
  const { targetId, trigger = 'manual' } = opts

  const agent = await db.agent.findUnique({ where: { id: agentId } })
  if (!agent) throw new Error(`Agent ${agentId} not found`)

  let filledPrompt = agent.prompt

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
      const context = buildContext(target)
      for (const [key, value] of Object.entries(context)) {
        filledPrompt = filledPrompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'gi'), value)
      }
    }
  }

  let status = 'success'
  let output = ''

  try {
    const message = await anthropic.messages.create({
      model: agent.model as 'claude-opus-4-6' | 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: filledPrompt }],
    })
    output = message.content[0].type === 'text' ? message.content[0].text : ''
  } catch (err) {
    status = 'error'
    output = err instanceof Error ? err.message : String(err)
  }

  const run = await db.agentRun.create({
    data: { agentId, targetId: targetId ?? null, status, output, trigger },
  })

  // Update lastRunAt on agent
  await db.agent.update({
    where: { id: agentId },
    data: { lastRunAt: new Date() },
  })

  // Auto-log activity for target-scoped success runs
  if (targetId && status === 'success') {
    await db.activity.create({
      data: {
        targetId,
        type: 'agent',
        description: `[${agent.name}] ${output.slice(0, 300)}${output.length > 300 ? '...' : ''}`,
      },
    })
  }

  return run
}

export async function runAgentForAllTargets(agentId: string, trigger: string) {
  const targets = await db.target.findMany({
    where: { stage: { not: 'passed' } },
    select: { id: true },
  })
  for (const t of targets) {
    await runAgent(agentId, { targetId: t.id, trigger })
  }
}

export async function triggerEvent(eventType: string, targetId: string) {
  const agents = await db.agent.findMany({
    where: { enabled: true, triggerType: 'event', eventType },
  })
  for (const agent of agents) {
    const opts = agent.scope === 'target'
      ? { targetId, trigger: 'event' }
      : { trigger: 'event' }
    runAgent(agent.id, opts).catch(() => {})
  }
}
