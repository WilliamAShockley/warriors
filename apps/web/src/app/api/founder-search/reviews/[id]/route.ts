import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  // body: { action: 'approve', output: string } | { action: 'deny' }

  const review = await db.founderReview.findUnique({ where: { id } })
  if (!review) return NextResponse.json({ error: 'not found' }, { status: 404 })

  if (body.action === 'approve' && body.output) {
    await db.target.update({
      where: { id: review.targetId },
      data: { founderName: body.output },
    })
    await db.activity.create({
      data: {
        targetId: review.targetId,
        type: 'founder_identified',
        description: `Founder identified via Parallel (user selected): ${body.output.split('\n')[0]}`,
      },
    })
    await db.founderReview.update({ where: { id }, data: { status: 'approved' } })
  } else if (body.action === 'deny') {
    await db.founderReview.update({ where: { id }, data: { status: 'denied' } })
  } else {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
