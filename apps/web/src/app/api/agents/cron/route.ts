import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { runAgent, runAgentForAllTargets } from '@/lib/runAgent'

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const agents = await db.agent.findMany({
    where: { enabled: true, triggerType: { in: ['continuous', 'scheduled'] } },
  })

  const now = Date.now()

  for (const agent of agents) {
    if (agent.triggerType === 'continuous') {
      if (agent.scope === 'target') {
        runAgentForAllTargets(agent.id, 'cron').catch(() => {})
      } else {
        runAgent(agent.id, { trigger: 'cron' }).catch(() => {})
      }
      continue
    }

    // scheduled: check if interval has elapsed
    if (agent.triggerType === 'scheduled' && agent.intervalSeconds) {
      const lastRun = agent.lastRunAt ? agent.lastRunAt.getTime() : 0
      const elapsed = (now - lastRun) / 1000
      if (elapsed >= agent.intervalSeconds) {
        if (agent.scope === 'target') {
          runAgentForAllTargets(agent.id, 'cron').catch(() => {})
        } else {
          runAgent(agent.id, { trigger: 'cron' }).catch(() => {})
        }
      }
    }
  }

  return NextResponse.json({ ok: true, dispatched: agents.length })
}
