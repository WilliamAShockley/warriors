import { NextResponse } from 'next/server'
import { generateAndSaveResearchBrief } from '@/lib/research'
import { db } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ targetId: string }> }) {
  const { targetId } = await params
  const brief = await db.researchBrief.findUnique({ where: { targetId } })
  return NextResponse.json(brief ?? { content: null })
}

export async function POST(req: Request, { params }: { params: Promise<{ targetId: string }> }) {
  const { targetId } = await params
  const { force } = await req.json().catch(() => ({ force: false }))
  const content = await generateAndSaveResearchBrief(targetId, force ?? true)
  return NextResponse.json({ content })
}
