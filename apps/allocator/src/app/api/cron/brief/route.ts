import { NextResponse, type NextRequest } from 'next/server'
import { syncCalendar } from '@/lib/calendar'
import { syncGranola } from '@/lib/granola'
import { assembleBrief } from '@/lib/assembleBrief'

export const maxDuration = 300

// Daily edition job (Vercel cron, 09:00 UTC) — also the manual sync trigger:
//   curl -H "Authorization: Bearer $CRON_SECRET" <url>/api/cron/brief
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const report: Record<string, unknown> = {}

  try {
    report.calendar = await syncCalendar()
  } catch (err) {
    report.calendar = { error: err instanceof Error ? err.message : String(err) }
  }

  try {
    report.granola = await syncGranola()
  } catch (err) {
    report.granola = { error: err instanceof Error ? err.message : String(err) }
  }

  try {
    report.brief = await assembleBrief()
  } catch (err) {
    report.brief = { error: err instanceof Error ? err.message : String(err) }
  }

  const failed = Object.values(report).some(
    (step) => typeof step === 'object' && step !== null && 'error' in step
  )
  return NextResponse.json(report, { status: failed ? 500 : 200 })
}
