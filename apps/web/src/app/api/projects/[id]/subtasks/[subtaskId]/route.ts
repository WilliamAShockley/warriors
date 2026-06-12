import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; subtaskId: string }> }
) {
  try {
    const { subtaskId } = await params
    const body = await req.json()

    const data: Record<string, unknown> = {}
    if (typeof body.text === 'string') data.text = body.text.trim()
    if (typeof body.completed === 'boolean') data.completed = body.completed
    if (typeof body.sortOrder === 'number') data.sortOrder = body.sortOrder

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const subtask = await db.projectSubtask.update({
      where: { id: subtaskId },
      data,
    })

    return NextResponse.json(subtask)
  } catch (error) {
    console.error('Failed to update subtask:', error)
    return NextResponse.json({ error: 'Failed to update subtask' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; subtaskId: string }> }
) {
  try {
    const { subtaskId } = await params
    await db.projectSubtask.delete({ where: { id: subtaskId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete subtask:', error)
    return NextResponse.json({ error: 'Failed to delete subtask' }, { status: 500 })
  }
}
