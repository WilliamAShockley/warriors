import { NextResponse } from 'next/server'
import { claimNext, markRunnerSeen, reportResult } from '@/lib/linkedin/store'
import { activeWorkspaceId, runAsWorkspace } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

// The runner's door (apps/linkedin-nav/outreach_runner.py). It arrives
// with LINKEDIN_RUNNER_TOKEN (or the reader's own bearer word); the access
// gate has already vouched for it.
//
// The runner is one machine with one LinkedIn session, but the row it
// should work may sit in whichever workspace the reader signed in to — so
// with a database it looks across workspaces for queued rows and works
// each inside its own frame. On a multi-tenant instance that is only
// right while the instance has a single sender; see VISION.md.
//
// POST { action: 'claim' }            → { job } | { job: null, reason }
// POST { action: 'report', id, ok, … } → { ok }

async function workspacesWithQueue(): Promise<string[]> {
  if (!process.env.DATABASE_URL) return [await activeWorkspaceId()]
  const { rawDb } = await import('@/lib/db')
  const rows = await rawDb.linkedInProspect.findMany({
    where: { status: 'queued' },
    orderBy: { queuedAt: 'asc' },
    select: { workspaceId: true },
    take: 200,
  })
  return Array.from(new Set(rows.map((r) => r.workspaceId)))
}

async function workspaceOf(id: string): Promise<string> {
  if (!process.env.DATABASE_URL) return activeWorkspaceId()
  const { rawDb } = await import('@/lib/db')
  const row = await rawDb.linkedInProspect.findUnique({ where: { id }, select: { workspaceId: true } })
  return row?.workspaceId ?? (await activeWorkspaceId())
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  if (body?.action === 'claim') {
    await markRunnerSeen()
    let reason = 'nothing queued'
    for (const ws of await workspacesWithQueue()) {
      const res = await runAsWorkspace(ws, () => claimNext())
      if (res.job) return NextResponse.json(res)
      if (res.reason) reason = res.reason
    }
    return NextResponse.json({ job: null, reason })
  }

  if (body?.action === 'report' && typeof body?.id === 'string') {
    const ws = await workspaceOf(body.id)
    const prospect = await runAsWorkspace(ws, () =>
      reportResult({
        id: body.id,
        ok: Boolean(body.ok),
        channel: body.channel ?? null,
        sentText: typeof body.sentText === 'string' ? body.sentText : null,
        sentSubject: typeof body.sentSubject === 'string' ? body.sentSubject : null,
        fullName: typeof body.fullName === 'string' ? body.fullName : null,
        firstName: typeof body.firstName === 'string' ? body.firstName : null,
        headline: typeof body.headline === 'string' ? body.headline : null,
        error: typeof body.error === 'string' ? body.error : null,
        requeue: Boolean(body.requeue),
      })
    )
    return NextResponse.json({ ok: Boolean(prospect) })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
