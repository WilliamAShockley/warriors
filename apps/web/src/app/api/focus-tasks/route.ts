import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const tasks = await db.focusTask.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(tasks)
  } catch (error) {
    console.error('Failed to fetch focus tasks:', error)
    return NextResponse.json({ error: 'Failed to fetch focus tasks' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { text } = body

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    // Auto-complete any existing active focus task
    await db.focusTask.updateMany({
      where: { completed: false },
      data: { completed: true, completedAt: new Date() },
    })

    const task = await db.focusTask.create({
      data: { text: text.trim() },
    })

    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    console.error('Failed to create focus task:', error)
    return NextResponse.json({ error: 'Failed to create focus task' }, { status: 500 })
  }
}
