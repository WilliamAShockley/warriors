import { NextResponse } from 'next/server'
import { addContactNote, listContactNotes } from '@/lib/book'

// Notes on a person in the Book. The section on the contact page fetches
// client-side, so the statically cached pages never serve stale notes.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const contactId = String(searchParams.get('contactId') ?? '').trim()
  if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 })
  return NextResponse.json(await listContactNotes(contactId))
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const contactId = String(body?.contactId ?? '').trim()
  const text = String(body?.body ?? '').trim()
  if (!contactId || !text) {
    return NextResponse.json({ error: 'contactId and body required' }, { status: 400 })
  }
  const note = await addContactNote(contactId, text.slice(0, 4000))
  return NextResponse.json({ ok: Boolean(note), note })
}
