import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { syncGmailForTarget } from '@/lib/syncGmail'
import { fetchAndStoreNews } from '@/lib/news'
import { generateAndSaveResearchBrief } from '@/lib/research'

export async function GET() {
  const targets = await db.target.findMany({
    include: { activities: { orderBy: { date: 'desc' }, take: 1 } },
    orderBy: { updatedAt: 'desc' },
  })
  return NextResponse.json(targets)
}

export async function POST(req: Request) {
  const body = await req.json()
  const target = await db.target.create({
    data: {
      name: body.name,
      company: body.company,
      email: body.email ?? null,
      linkedin: body.linkedin ?? null,
      stage: body.stage ?? 'intro_sent',
      status: body.status ?? 'yellow',
      notes: body.notes ?? null,
      starred: body.starred ?? false,
      starRank: body.starRank ?? null,
    },
  })
  // Fire-and-forget background tasks — don't block the response
  const tid = target.id
  syncGmailForTarget(tid).catch(() => {})
  fetchAndStoreNews(tid).catch(() => {})
  generateAndSaveResearchBrief(tid).catch(() => {})

  return NextResponse.json(target, { status: 201 })
}
