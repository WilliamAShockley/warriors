import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const todos = await db.todo.findMany({
      orderBy: [
        { completed: 'asc' },
        { sortOrder: 'asc' },
        { createdAt: 'desc' },
      ],
    })
    return NextResponse.json(todos)
  } catch (error) {
    console.error('Failed to fetch todos:', error)
    return NextResponse.json({ error: 'Failed to fetch todos' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { text } = body

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    // Get the max sortOrder for incomplete todos to add at the end
    const maxSort = await db.todo.aggregate({
      _max: { sortOrder: true },
      where: { completed: false },
    })

    const todo = await db.todo.create({
      data: {
        text: text.trim(),
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    })

    return NextResponse.json(todo, { status: 201 })
  } catch (error) {
    console.error('Failed to create todo:', error)
    return NextResponse.json({ error: 'Failed to create todo' }, { status: 500 })
  }
}