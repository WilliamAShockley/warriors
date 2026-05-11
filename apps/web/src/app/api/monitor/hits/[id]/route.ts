import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { syncGmailForTarget } from '@/lib/syncGmail'
import { fetchAndStoreNews } from '@/lib/news'
import { generateAndSaveResearchBrief } from '@/lib/research'
import { triggerEvent } from '@/lib/runAgent'
import { searchAndSaveFounder } from '@/lib/founderSearch'

function parseCompanyFromUrl(url: string): string {
  try {
    const hostname = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    const domainPart = hostname.split('.')[0]
    return domainPart.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim()
  } catch { return '' }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const hit = await db.monitorHit.findUnique({ where: { id } })
  if (!hit) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Reject
  if (body.status === 'rejected') {
    const updated = await db.monitorHit.update({
      where: { id },
      data: { status: 'rejected' },
    })
    return NextResponse.json(updated)
  }

  // Approve — create target
  if (body.status === 'approved') {
    const company = hit.url ? parseCompanyFromUrl(hit.url) : hit.companyName
    const target = await db.target.create({
      data: {
        name: hit.companyName,
        company: company || hit.companyName,
        websiteUrl: hit.url,
        stage: 'intro_sent',
        status: 'yellow',
        notes: `${hit.description}\n\nMatch reason: ${hit.matchReason}`,
      },
    })

    // Fire-and-forget background tasks
    syncGmailForTarget(target.id).catch(() => {})
    fetchAndStoreNews(target.id).catch(() => {})
    generateAndSaveResearchBrief(target.id).catch(() => {})
    triggerEvent('target.created', target.id).catch(() => {})

    // Optionally run cold outbound
    if (body.runColdOutbound && hit.url) {
      searchAndSaveFounder(target.id, hit.url).catch(() => {})
    }

    const updated = await db.monitorHit.update({
      where: { id },
      data: { status: 'approved', targetId: target.id },
    })

    return NextResponse.json({ ...updated, target })
  }

  return NextResponse.json({ error: 'invalid status' }, { status: 400 })
}
