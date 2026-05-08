import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { searchAndSaveFounder } from '@/lib/founderSearch'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const target = await db.target.findUnique({ where: { id }, select: { id: true, websiteUrl: true } })
  if (!target?.websiteUrl) return NextResponse.json({ error: 'no websiteUrl' }, { status: 400 })
  try {
    await searchAndSaveFounder(target.id, target.websiteUrl)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'search failed' }, { status: 500 })
  }
}
