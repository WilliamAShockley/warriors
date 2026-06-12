import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { text } = body

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    const maxSort = await db.projectSubtask.aggregate({
      _max: { sortOrder: true },
      where: { projectId: id },
    })

    const subtask = await db.projectSubtask.create({
      data: {
        projectId: id,
        text: text.trim(),
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    })

    return NextResponse.json(subtask, { status: 201 })
  } catch (error) {
    console.error('Failed to create subtask:', error)
    return NextResponse.json({ error: 'Failed to create subtask' }, { status: 500 })
  }
}
