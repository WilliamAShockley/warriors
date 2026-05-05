import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Notes are stored in the Setting model with keys like "market_note:<id>"
// The value is a JSON string: { id, title, content, createdAt }

function noteKey(id: string) {
  return `market_note:${id}`
}

function generateId() {
  return `mn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export async function GET() {
  try {
    const settings = await db.setting.findMany({
      where: {
        key: {
          startsWith: 'market_note:',
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    const notes = settings.map((s) => {
      try {
        return JSON.parse(s.value)
      } catch {
        return null
      }
    }).filter(Boolean)

    return NextResponse.json(notes)
  } catch (error) {
    console.error('Failed to fetch market notes:', error)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title, content } = await req.json()
    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const id = generateId()
    const now = new Date().toISOString()
    const note = { id, title: title.trim(), content: content?.trim() || '', createdAt: now }

    await db.setting.upsert({
      where: { key: noteKey(id) },
      create: { key: noteKey(id), value: JSON.stringify(note) },
      update: { value: JSON.stringify(note) },
    })

    return NextResponse.json(note, { status: 201 })
  } catch (error) {
    console.error('Failed to create market note:', error)
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, title, content } = await req.json()
    if (!id || !title?.trim()) {
      return NextResponse.json({ error: 'ID and title are required' }, { status: 400 })
    }

    const existing = await db.setting.findUnique({ where: { key: noteKey(id) } })
    if (!existing) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    let parsed: Record<string, unknown> = {}
    try {
      parsed = JSON.parse(existing.value)
    } catch {
      // ignore
    }

    const updated = {
      ...parsed,
      id,
      title: title.trim(),
      content: content?.trim() || '',
    }

    await db.setting.update({
      where: { key: noteKey(id) },
      data: { value: JSON.stringify(updated) },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Failed to update market note:', error)
    return NextResponse.json({ error: 'Failed to update note' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }

    await db.setting.delete({ where: { key: noteKey(id) } }).catch(() => {
      // already deleted or doesn't exist
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete market note:', error)
    return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 })
  }
}