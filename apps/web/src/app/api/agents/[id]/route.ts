import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const agent = await db.agent.findUnique({
    where: { id },
    include: { runs: { orderBy: { createdAt: 'desc' }, take: 10 } },
  })
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(agent)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const agent = await db.agent.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.prompt !== undefined && { prompt: body.prompt }),
      ...(body.triggerType !== undefined && { triggerType: body.triggerType }),
      ...(body.intervalSeconds !== undefined && { intervalSeconds: body.intervalSeconds }),
      ...(body.eventType !== undefined && { eventType: body.eventType }),
      ...(body.scope !== undefined && { scope: body.scope }),
      ...(body.model !== undefined && { model: body.model }),
      ...(body.enabled !== undefined && { enabled: body.enabled }),
    },
  })
  return NextResponse.json(agent)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await db.agent.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
