import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const briefs = await db.researchBrief.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { target: { select: { id: true, name: true, company: true, status: true } } },
  })
  return NextResponse.json(briefs)
}
