import { NextResponse } from 'next/server'
import { addProspects, getConfig, listProspects, runnerSeenAt, sentToday, storeKind, NOTE_LIMIT, SUBJECT_LIMIT } from '@/lib/linkedin/store'
import { runnerStatus } from '@/lib/linkedin/runner'

export const dynamic = 'force-dynamic'

// GET — the whole tracker: every prospect, the standing draft, today's count.
export async function GET() {
  const [prospects, config, today, seenAt] = await Promise.all([listProspects(), getConfig(), sentToday(), runnerSeenAt()])
  return NextResponse.json({ prospects, config, sentToday: today, noteLimit: NOTE_LIMIT, subjectLimit: SUBJECT_LIMIT, store: storeKind(), runner: { ...runnerStatus(), seenAt } })
}

// POST { urls: string | string[], note? } — file one or many profile URLs.
// A pasted block is split on whitespace and commas.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const raw: string[] = Array.isArray(body?.urls) ? body.urls.map(String) : String(body?.urls ?? body?.url ?? '').split(/[\s,]+/)
  const urls = raw.map((s) => s.trim()).filter(Boolean).slice(0, 200)
  if (urls.length === 0) return NextResponse.json({ error: 'paste a LinkedIn profile URL' }, { status: 400 })
  const result = await addProspects(urls, typeof body?.note === 'string' ? body.note : null)
  return NextResponse.json({ ok: result.added.length > 0, ...result })
}
