import { NextResponse } from 'next/server'
import { addContextNote, listContextNotes, removeContextNote } from '@/lib/reader-context'

// Dez's Context, from Settings: GET lists the notes; POST { text } files
// one; POST { id, remove: true } takes one down.

export async function GET() {
  return NextResponse.json(await listContextNotes())
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  if (body?.id && body?.remove) {
    return NextResponse.json({ ok: await removeContextNote(String(body.id)) })
  }

  const text = String(body?.text ?? '').trim()
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })
  const note = await addContextNote(text)
  return NextResponse.json({ ok: Boolean(note), note })
}
