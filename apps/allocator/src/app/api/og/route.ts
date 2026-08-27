import { NextResponse, after } from 'next/server'

// OG's API. GET deals a sheet (?tab=url for the URL sheet, else the
// name sheet). POST carries the verbs: seat-and-run a row, save the
// column picks, strike a row. Trials execute post-response — a research
// pass plus a skill draft never fits an HTTP wait — and the sheet's
// polling watches the row land.
export const maxDuration = 300

export async function GET(req: Request) {
  const { listOg } = await import('@/lib/og')
  const tab = new URL(req.url).searchParams.get('tab') === 'url' ? 'url' : 'name'
  return NextResponse.json(await listOg(tab))
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

  if (Array.isArray(body?.columns)) {
    const ok = await og.setOgColumns(body.columns.map(String))
    return NextResponse.json(ok ? { ok } : { error: 'Could not save the columns.' }, ok ? undefined : { status: 500 })
  }

  if (body?.strike) {
    await og.strikeOgRun(String(body.strike))
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown verb.' }, { status: 400 })
}
