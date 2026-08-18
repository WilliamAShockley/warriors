import { NextResponse, type NextRequest } from 'next/server'
import { syncCalendar } from '@/lib/calendar'
import { syncGranola } from '@/lib/granola'
import { assembleBrief } from '@/lib/assembleBrief'
import { rawDb } from '@/lib/db'
import { ensureAdopted, runAsWorkspace, PRIMARY_WORKSPACE } from '@/lib/tenant'

export const maxDuration = 300

// Daily edition job (Vercel cron, 09:00 UTC) — also the manual sync trigger:
//   curl -H "Authorization: Bearer $CRON_SECRET" <url>/api/cron/brief
// One edition per workspace: every desk with a connected Google account
// gets its own morning paper; the primary desk always runs.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureAdopted()
  let workspaceIds: string[] = [PRIMARY_WORKSPACE]
  try {
    const tokens = await rawDb.googleToken.findMany({ select: { id: true } })
    workspaceIds = Array.from(new Set([PRIMARY_WORKSPACE, ...tokens.map((t) => t.id)]))
  } catch {}

  const report: Record<string, unknown> = {}
  for (const ws of workspaceIds) {
    report[ws] = await runAsWorkspace(ws, async () => {
      const r: Record<string, unknown> = {}
      try {
        r.calendar = await syncCalendar()
      } catch (err) {
        r.calendar = { error: err instanceof Error ? err.message : String(err) }
      }
      // Granola runs on the operator's personal API key — its notes belong
      // to the primary desk only, never a guest workspace.
      if (ws === PRIMARY_WORKSPACE) {
        try {
          r.granola = await syncGranola()
        } catch (err) {
          r.granola = { error: err instanceof Error ? err.message : String(err) }
        }
      }
      try {
        r.brief = await assembleBrief()
      } catch (err) {
        r.brief = { error: err instanceof Error ? err.message : String(err) }
      }
      try {
        const { sweepMailboxTasks } = await import('@/lib/inbound')
        r.mailDoor = await sweepMailboxTasks(true)
      } catch (err) {
        r.mailDoor = { error: err instanceof Error ? err.message : String(err) }
      }
      try {
        // The Register's nightly refresh: the stalest few entries get a
        // bounded web check so context stays current without anyone asking.
        const { enrichCompanies } = await import('@/lib/context')
        r.register = await enrichCompanies(3)
      } catch (err) {
        r.register = { error: err instanceof Error ? err.message : String(err) }
      }
      return r
    })
  }

  const failed = Object.values(report).some((steps) =>
    Object.values(steps as Record<string, unknown>).some(
      (step) => typeof step === 'object' && step !== null && 'error' in step
    )
  )
  return NextResponse.json(report, { status: failed ? 500 : 200 })
}
