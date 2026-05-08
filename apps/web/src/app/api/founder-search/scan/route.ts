import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { searchAndSaveFounder } from '@/lib/founderSearch'

export async function GET() {
  const targets = await db.target.findMany({
    where: { websiteUrl: { not: null }, founderName: null },
    select: { id: true, company: true, websiteUrl: true },
  })
  const pendingReviews = await db.founderReview.findMany({
    where: { targetId: { in: targets.map(t => t.id) }, status: 'pending' },
    select: { targetId: true },
  })
  const pendingIds = new Set(pendingReviews.map(r => r.targetId))
  return NextResponse.json(targets.filter(t => !pendingIds.has(t.id)))
}

export async function POST() {
  const targets = await db.target.findMany({
    where: { websiteUrl: { not: null }, founderName: null },
    select: { id: true, company: true, websiteUrl: true },
  })
  const pendingReviews = await db.founderReview.findMany({
    where: { targetId: { in: targets.map(t => t.id) }, status: 'pending' },
    select: { targetId: true },
  })
  const pendingIds = new Set(pendingReviews.map(r => r.targetId))
  const toProcess = targets.filter(t => !pendingIds.has(t.id))

  const results: { targetId: string; company: string; result: string }[] = []

  for (const target of toProcess) {
    const before = await db.target.findUnique({ where: { id: target.id }, select: { founderName: true } })
    await searchAndSaveFounder(target.id, target.websiteUrl!)
    const after = await db.target.findUnique({ where: { id: target.id }, select: { founderName: true } })
    results.push({
      targetId: target.id,
      company: target.company,
      result: after?.founderName && after.founderName !== before?.founderName ? 'saved' : 'queued_for_review',
    })
  }

  return NextResponse.json({ processed: toProcess.length, results })
}
