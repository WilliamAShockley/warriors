import { NextResponse } from 'next/server'
import { editProspect, removeProspect } from '@/lib/linkedin/store'

export const dynamic = 'force-dynamic'

// PATCH { message?, firstName?, fullName?, note?, status? } — edit the
// draft or mark an outcome by hand.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const res = await editProspect(id, body ?? {})
  return NextResponse.json(res, { status: res.ok ? 200 : 409 })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ok = await removeProspect(id)
  return NextResponse.json({ ok }, { status: ok ? 200 : 409 })
}
