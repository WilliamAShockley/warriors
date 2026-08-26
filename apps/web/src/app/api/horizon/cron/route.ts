import { NextResponse } from 'next/server'
import { advance } from '@/lib/horizon/pipeline'

export const maxDuration = 300

/**
 * The single scheduled "advance" job (Vercel Cron). Stateless and idempotent:
 * every invocation reads current state, advances due items one step with
 * guarded transitions, and exits — kill/restart mid-campaign loses nothing.
 * The handler body is a plain async function so it could move to
 * Trigger.dev/Inngest later without rewrite.
 *
 * Auth mirrors the existing cron routes: Vercel invokes with
 * `Authorization: Bearer ${CRON_SECRET}` (also allowlisted in middleware).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const stats = await advance()
    return NextResponse.json({ ok: true, stats })
  } catch (err) {
    console.error('[horizon/cron]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
