import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const items = await db.newsItem.findMany({
    orderBy: { publishedAt: 'desc' },
    include: { target: { select: { id: true, name: true, company: true } } },
  })
  return NextResponse.json(items)
}
