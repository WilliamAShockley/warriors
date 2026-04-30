import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { runAgent, runAgentForAllTargets } from '@/lib/runAgent'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { targetId } = body

  const agent = await db.agent.findUnique({ where: { id } })
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  if (!targetId && agent.scope === 'target') {
    // Run across all non-passed targets fire-and-forget
    runAgentForAllTargets(id, 'manual').catch(() => {})
    return NextResponse.json({ ok: true, message: 'Running across all targets in background' })
  }

  const run = await runAgent(id, { targetId: targetId ?? undefined, trigger: 'manual' })
  return NextResponse.json(run)
}
