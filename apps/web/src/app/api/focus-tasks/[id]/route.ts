import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()

    const data: Record<string, unknown> = {}
    if (typeof body.text === 'string') data.text = body.text.trim()
    if (typeof body.completed === 'boolean') {
      data.completed = body.completed
      data.completedAt = body.completed ? new Date() : null
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const task = await db.focusTask.update({
      where: { id },
      data,
    })

    return NextResponse.json(task)
  } catch (error) {
    console.error('Failed to update focus task:', error)
    return NextResponse.json({ error: 'Failed to update focus task' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.focusTask.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete focus task:', error)
    return NextResponse.json({ error: 'Failed to delete focus task' }, { status: 500 })
  }
}
