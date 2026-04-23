import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateTargetSummary } from '@/lib/claude'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const target = await db.target.findUnique({
    where: { id },
    include: { activities: { orderBy: { date: 'desc' } } },
  })
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const summary = await generateTargetSummary(target)
  return NextResponse.json({ summary })
}
