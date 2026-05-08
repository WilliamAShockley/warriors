import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const reviews = await db.founderReview.findMany({
    where: { status: 'pending' },
    include: { target: { select: { id: true, company: true, websiteUrl: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(reviews.map(r => ({
    ...r,
    candidates: JSON.parse(r.candidates),
  })))
}
