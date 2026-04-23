import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const skill = await db.skill.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.prompt !== undefined && { prompt: body.prompt }),
      ...(body.section !== undefined && { section: body.section }),
      ...(body.model !== undefined && { model: body.model }),
    },
  })
  return NextResponse.json(skill)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await db.skill.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
