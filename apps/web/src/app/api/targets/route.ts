import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { syncGmailForTarget } from '@/lib/syncGmail'
import { fetchAndStoreNews } from '@/lib/news'
import { generateAndSaveResearchBrief } from '@/lib/research'
import { triggerEvent } from '@/lib/runAgent'
import { searchAndSaveFounder } from '@/lib/founderSearch'

export async function GET() {
  const targets = await db.target.findMany({
    include: { activities: { orderBy: { date: 'desc' }, take: 1 } },
    orderBy: { updatedAt: 'desc' },
  })
  return NextResponse.json(targets)
}

function parseCompanyFromUrl(url: string): string {
  try {
    const hostname = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    const domainPart = hostname.split('.')[0]
    return domainPart.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim()
  } catch { return '' }
}

export async function POST(req: Request) {
  const body = await req.json()
  const company = body.company || (body.websiteUrl ? parseCompanyFromUrl(body.websiteUrl) : '')
  const target = await db.target.create({
    data: {
      name: body.name ?? '',
      company,
      email: body.email ?? null,
      linkedin: body.linkedin ?? null,
      websiteUrl: body.websiteUrl ?? null,
      founderName: body.founderName ?? null,
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
  triggerEvent('target.created', tid).catch(() => {})
  if (target.websiteUrl && !target.founderName) {
    searchAndSaveFounder(tid, target.websiteUrl).catch(() => {})
  }

  return NextResponse.json(target, { status: 201 })
}
