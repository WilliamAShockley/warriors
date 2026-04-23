import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const target = await db.target.findUnique({
    where: { id },
    include: { activities: { orderBy: { date: 'desc' } } },
  })
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(target)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const target = await db.target.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.company !== undefined && { company: body.company }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.linkedin !== undefined && { linkedin: body.linkedin }),
      ...(body.stage !== undefined && { stage: body.stage }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.lastContacted !== undefined && { lastContacted: new Date(body.lastContacted) }),
      ...(body.starred !== undefined && { starred: body.starred }),
      ...(body.starRank !== undefined && { starRank: body.starRank }),
    },
  })
  return NextResponse.json(target)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await db.target.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
