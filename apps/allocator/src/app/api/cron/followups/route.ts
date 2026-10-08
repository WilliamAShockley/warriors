import { NextResponse, type NextRequest } from 'next/server'
import { rawDb } from '@/lib/db'
import { ensureAdopted, runAsWorkspace } from '@/lib/tenant'

export const maxDuration = 300

// The follow-up tick (Vercel cron, hourly) — also the manual trigger:
//   curl -H "Authorization: Bearer $CRON_SECRET" <url>/api/cron/followups
// Walks every workspace that has an active cadence; each sequence only
// acts when its own randomized send time has come due.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureAdopted()
  let workspaceIds: string[] = []
  try {
    const rows = await rawDb.followUpSequence.findMany({
      where: { status: 'active', nextSendAt: { lte: new Date() } },
      select: { workspaceId: true },
      distinct: ['workspaceId'],
    })
    workspaceIds = rows.map((r) => r.workspaceId)
  } catch {}

  const report: Record<string, unknown> = {}
  for (const ws of workspaceIds) {
    report[ws] = await runAsWorkspace(ws, async () => {
      try {
        const { runFollowUps } = await import('@/lib/followups')
        return await runFollowUps()
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      }
    })
  }
  const failed = Object.values(report).some((r) => typeof r === 'object' && r !== null && 'error' in r)
  return NextResponse.json(report, { status: failed ? 500 : 200 })
}
