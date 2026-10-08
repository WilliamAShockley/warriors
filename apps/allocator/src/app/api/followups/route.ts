import { NextResponse } from 'next/server'
import {
  getFollowUpMode,
  listFollowUps,
  resumeFollowUps,
  setFollowUpMode,
  stopFollowUps,
  type FollowUpMode,
} from '@/lib/followups'

// The follow-up cadence: the ledger, the mode switch, and per-sequence
// stop/resume. Sending itself only ever happens in the cron tick.
export async function GET() {
  const [mode, entries] = await Promise.all([getFollowUpMode(), listFollowUps()])
  return NextResponse.json({ live: Boolean(process.env.DATABASE_URL), mode, entries })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  if (['off', 'review', 'auto'].includes(body?.mode)) {
    const ok = await setFollowUpMode(body.mode as FollowUpMode)
    return NextResponse.json({ ok, mode: body.mode })
  }
  if (typeof body?.id === 'string' && body?.action === 'stop') {
    return NextResponse.json({ ok: await stopFollowUps(body.id) })
  }
  if (typeof body?.id === 'string' && body?.action === 'resume') {
    return NextResponse.json({ ok: await resumeFollowUps(body.id) })
  }
  return NextResponse.json({ error: 'bad request' }, { status: 400 })
}
