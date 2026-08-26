import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getScope } from '@/lib/horizon/scope'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { workspaceId } = await getScope()
  const session = await db.chatSession.findFirst({ where: { id, workspaceId } })
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const messages = await db.chatMessage.findMany({
    where: { sessionId: id },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({
    session,
    messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt })),
  })
}
