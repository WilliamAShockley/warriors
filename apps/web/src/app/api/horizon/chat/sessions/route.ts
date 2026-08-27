import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getScope } from '@/lib/horizon/scope'

export async function GET() {
  const { workspaceId } = await getScope()
  const sessions = await db.chatSession.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  })
  return NextResponse.json({ sessions })
}
