import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { refreshNextStep } from '@/lib/refreshNextStep'

export async function POST(req: Request) {
  const body = await req.json()
  const activity = await db.activity.create({
    data: {
      targetId: body.targetId,
      type: body.type,
      description: body.description,
      date: body.date ? new Date(body.date) : new Date(),
    },
  })

  // Update lastContacted on the target
  await db.target.update({
    where: { id: body.targetId },
    data: { lastContacted: activity.date },
  })

  // Regenerate next step in background
  refreshNextStep(body.targetId).catch(() => {})

  return NextResponse.json(activity, { status: 201 })
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  await db.activity.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
