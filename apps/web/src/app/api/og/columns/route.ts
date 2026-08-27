import { NextResponse } from 'next/server'
import { getOgColumns, setOgColumns, type OgColumn } from '@/lib/og'
import { allCheckIds } from '@/lib/horizon/draft-checks'

export async function GET() {
  const columns = await getOgColumns()
  return NextResponse.json({ columns, available: allCheckIds() })
}

export async function PUT(req: Request) {
  const { columns } = (await req.json()) as { columns?: OgColumn[] }
  if (!Array.isArray(columns) || columns.some((c) => !c?.label || !c?.checkId)) {
    return NextResponse.json({ error: 'columns must be [{label, checkId}, ...]' }, { status: 400 })
  }
  await setOgColumns(columns)
  return NextResponse.json({ ok: true, columns })
}
