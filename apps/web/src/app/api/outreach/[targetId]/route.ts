import { NextResponse } from 'next/server'
import { generateAndSaveOutreachBrief } from '@/lib/outreachResearch'

export async function GET(_req: Request, { params }: { params: Promise<{ targetId: string }> }) {
  const { targetId } = await params
  const data = await generateAndSaveOutreachBrief(targetId)
  if (!data) return NextResponse.json({ error: 'Not found or generation failed' }, { status: 404 })
  return NextResponse.json(data)
}

export async function POST(req: Request, { params }: { params: Promise<{ targetId: string }> }) {
  const { targetId } = await params
  const body = await req.json().catch(() => ({}))
  const data = await generateAndSaveOutreachBrief(targetId, body.force === true)
  if (!data) return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  return NextResponse.json(data)
}
