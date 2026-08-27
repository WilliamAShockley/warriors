import { NextResponse, after } from 'next/server'

// OG's API. GET deals a sheet (?tab=url for the URL sheet, else the name
// sheet) plus the column workflows and the provider roster. POST carries
// the verbs: seat-and-run a row, save the workflows, strike a row.
// Trials execute post-response — routed research plus drafting never fits
// an HTTP wait — and the sheet's polling watches the cells land.
export const maxDuration = 300

export async function GET(req: Request) {
  const { listOg, getOgWorkflows, OG_COLUMNS, OG_PROVIDERS, OG_STAGE1_VARS, OG_STAGE2_VARS } = await import('@/lib/og')
  const tab = new URL(req.url).searchParams.get('tab') === 'url' ? 'url' : 'name'
  const [sheet, workflows] = await Promise.all([listOg(tab), getOgWorkflows()])
  return NextResponse.json({
    ...sheet,
    workflows,
    columns: OG_COLUMNS,
    providers: OG_PROVIDERS,
    vars: { stage1: OG_STAGE1_VARS, stage2: OG_STAGE2_VARS },
  })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const og = await import('@/lib/og')

  if (body?.run) {
    const tab = body.run.tab === 'url' ? 'url' : 'name'
    const input = String(body.run.input ?? '').trim()
    if (!input) return NextResponse.json({ error: 'Nothing to seat.' }, { status: 400 })
    const id = await og.seatOgRun(tab, input)
    if (!id) return NextResponse.json({ error: 'No database — the OG sheet runs on the live desk.' }, { status: 503 })
    const { activeWorkspaceId, runAsWorkspace } = await import('@/lib/tenant')
    const ws = await activeWorkspaceId()
    after(() => runAsWorkspace(ws, () => og.runOgRow(id)))
    return NextResponse.json({ ok: true, id })
  }

  if (body?.workflows && typeof body.workflows === 'object') {
    const ok = await og.setOgWorkflows(body.workflows)
    return NextResponse.json(ok ? { ok } : { error: 'Could not save the workflows.' }, ok ? undefined : { status: 500 })
  }

  if (body?.strike) {
    await og.strikeOgRun(String(body.strike))
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown verb.' }, { status: 400 })
}
