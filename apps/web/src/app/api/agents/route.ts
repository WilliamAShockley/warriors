import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const agents = await db.agent.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      runs: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  })
  return NextResponse.json(agents)
}

export async function POST(req: Request) {
  const body = await req.json()
  const agent = await db.agent.create({
    data: {
      name: body.name,
      description: body.description ?? '',
      prompt: body.prompt,
      triggerType: body.triggerType ?? 'manual',
      intervalSeconds: body.intervalSeconds ?? null,
      eventType: body.eventType ?? null,
      scope: body.scope ?? 'global',
      model: body.model ?? 'claude-opus-4-6',
      enabled: body.enabled ?? true,
    },
  })
  return NextResponse.json(agent, { status: 201 })
}
