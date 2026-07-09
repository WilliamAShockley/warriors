import { NextResponse } from 'next/server'
import { createNote, listNotes } from '@/lib/notes'

export async function GET() {
  return NextResponse.json(await listNotes())
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const title = String(body?.title ?? '').trim()
  const text = String(body?.body ?? '').trim()
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })

  const note = await createNote({ title: title.slice(0, 200), body: text || title })
  if (!note) return NextResponse.json({ error: 'could not file the note' }, { status: 500 })
  return NextResponse.json({ note })
}
