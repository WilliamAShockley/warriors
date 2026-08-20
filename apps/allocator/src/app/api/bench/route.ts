import { NextResponse, after } from 'next/server'

// The Bench's API. GET deals the sheet; POST carries the verbs: seat a
// row, pull the Register on, run a row (or the sheet), crown a winner,
// note, promote, strike. Runs execute post-response — four engines at
// 240s ceilings never fit an HTTP wait — and the sheet's polling watches
// the cells land.
export const maxDuration = 300

// One "run the sheet" click caps at this many rows (× four engines) so the
// whole batch concludes inside the function window — each engine takes its
// rows one at a time (per-provider lanes), so the cap × a realistic run
// must fit 300s. The sheet says so when rows are left over; a second
// click picks them up.
const RUN_ALL_CAP = 3

// ?kind=person deals the People sheet; anything else deals Company. The
// editable charges ride along only for Company — person charges are the
// house defaults, not (yet) reader-amendable.
export async function GET(req: Request) {
  const { listBench, listCharges } = await import('@/lib/bench')
  const kind = new URL(req.url).searchParams.get('kind') === 'person' ? 'person' : 'company'
  if (kind === 'person') return NextResponse.json(await listBench('person'))
  const [sheet, charges] = await Promise.all([listBench('company'), listCharges()])
  return NextResponse.json({ ...sheet, charges })
}

async function startRun(rowIds: string[]) {
  const { queueTrials } = await import('@/lib/bench')
  const { activeWorkspaceId, runAsWorkspace } = await import('@/lib/tenant')
  const ws = await activeWorkspaceId()
  const queued: string[] = []
  for (const id of rowIds) queued.push(...(await queueTrials(id)))
  if (queued.length > 0) {
    after(async () => {
      const { runQueuedTrials } = await import('@/lib/bench')
      await runAsWorkspace(ws, () => runQueuedTrials(queued))
    })
  }
  return queued.length
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const bench = await import('@/lib/bench')

  if (body?.add) {
    const kind = body.add.kind === 'person' ? 'person' : 'company'
    const id = await bench.addBenchRow({
      kind,
      companyName: body.add.companyName ? String(body.add.companyName) : undefined,
      personName: body.add.personName ? String(body.add.personName) : undefined,
      linkedinUrl: body.add.linkedinUrl ? String(body.add.linkedinUrl) : undefined,
      founderHint: body.add.founderHint ? String(body.add.founderHint) : undefined,
      websiteHint: body.add.websiteHint ? String(body.add.websiteHint) : undefined,
      contextHint: body.add.contextHint ? String(body.add.contextHint) : undefined,
    })
    if (!id)
      return NextResponse.json(
        {
          error:
            kind === 'person'
              ? 'a person needs at least two of the three: full name, company, LinkedIn URL'
              : 'the row did not take',
        },
        { status: kind === 'person' ? 400 : 500 }
      )
    // Seat and run in one motion when asked.
    const started = body.add.run === true ? await startRun([id]) : 0
    return NextResponse.json({ ok: true, id, started })
  }

  if (body?.importRegister === true) {
    return NextResponse.json({ ok: true, ...(await bench.importRegister()) })
  }

  if (body?.run) {
    const started = await startRun([String(body.run)])
    return NextResponse.json({ ok: started > 0, started })
  }

  // Retry: fresh trials only for this row's failed engines.
  if (body?.retry) {
    const { queueRetries } = await import('@/lib/bench')
    const { activeWorkspaceId, runAsWorkspace } = await import('@/lib/tenant')
    const ws = await activeWorkspaceId()
    const queued = await queueRetries(String(body.retry))
    if (queued.length > 0) {
      after(async () => {
        const { runQueuedTrials } = await import('@/lib/bench')
        await runAsWorkspace(ws, () => runQueuedTrials(queued))
      })
    }
    return NextResponse.json({ ok: queued.length > 0, started: queued.length })
  }

  if (body?.runAll === true) {
    const { db } = await import('@/lib/db')
    const kind = body.kind === 'person' ? 'person' : 'company'
    const rows = await db.benchRow.findMany({ where: { kind }, orderBy: { createdAt: 'desc' }, take: 100 })
    const trials = await db.benchTrial.findMany({
      where: { status: { in: ['queued', 'running'] } },
      select: { rowId: true } as any,
    })
    const busy = new Set((trials as any[]).map((t) => t.rowId))
    const idle = (rows as any[]).filter((r) => !busy.has(r.id))
    const batch = idle.slice(0, RUN_ALL_CAP)
    const started = await startRun(batch.map((r) => r.id))
    return NextResponse.json({ ok: true, started, rowsRun: batch.length, rowsLeft: idle.length - batch.length })
  }

  if (body?.verdict?.rowId) {
    const ok = await bench.setVerdict(String(body.verdict.rowId), body.verdict.winner ? String(body.verdict.winner) : null)
    return NextResponse.json({ ok })
  }

  if (body?.notes?.rowId !== undefined) {
    const ok = await bench.setNotes(String(body.notes.rowId), String(body.notes.notes ?? ''))
    return NextResponse.json({ ok })
  }

  if (body?.promote?.rowId && body?.promote?.provider) {
    const ok = await bench.promoteTrial(String(body.promote.rowId), String(body.promote.provider))
    return NextResponse.json({ ok })
  }

  if (body?.charge?.provider) {
    const ok = await bench.setCharge(String(body.charge.provider), String(body.charge.template ?? ''))
    return NextResponse.json({ ok })
  }

  if (typeof body?.chargeAll === 'string') {
    const ok = await bench.setAllCharges(body.chargeAll)
    return NextResponse.json({ ok })
  }

  if (body?.remove) {
    return NextResponse.json({ ok: await bench.removeBenchRow(String(body.remove)) })
  }

  return NextResponse.json({ error: 'no verb recognized' }, { status: 400 })
}
