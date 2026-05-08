import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { searchAndSaveFounder } from '@/lib/founderSearch'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const target = await db.target.findUnique({ where: { id }, select: { id: true, websiteUrl: true } })
  if (!target?.websiteUrl) return NextResponse.json({ error: 'no websiteUrl' }, { status: 400 })
  try {
    console.log(`[founder-retry] Starting search for target ${id}, url: ${target.websiteUrl}`)
    await searchAndSaveFounder(target.id, target.websiteUrl)
    const updated = await db.target.findUnique({ where: { id }, select: { founderName: true } })
    console.log(`[founder-retry] Done for ${id}, founderName: ${updated?.founderName ?? 'null'}`)
    return NextResponse.json({ ok: true, founderName: updated?.founderName })
  } catch (err) {
    console.error(`[founder-retry] Failed for target ${id}:`, err)
    return NextResponse.json({ error: 'search failed' }, { status: 500 })
  }
}
