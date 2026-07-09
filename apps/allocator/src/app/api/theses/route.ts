import { NextResponse } from 'next/server'
import { createThesis, listDbTheses, retireThesis } from '@/lib/theses'

export async function GET() {
  return NextResponse.json(await listDbTheses())
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  if (body?.action === 'retire') {
    const ok = await retireThesis(String(body?.slug ?? ''))
    return NextResponse.json({ ok })
  }

  const t = body?.thesis
  const fields = ['name', 'chip', 'stance', 'summary', 'charter'] as const
  if (!t || fields.some((f) => !String(t[f] ?? '').trim())) {
    return NextResponse.json({ error: 'incomplete thesis' }, { status: 400 })
  }

  const created = await createThesis({
    name: String(t.name).slice(0, 80),
    chip: String(t.chip).slice(0, 40),
    stance: String(t.stance),
    summary: String(t.summary),
    charter: String(t.charter),
  })
  return NextResponse.json({ ok: Boolean(created), thesis: created })
}
