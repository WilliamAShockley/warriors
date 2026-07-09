import { NextResponse } from 'next/server'
import { createContact } from '@/lib/book'
import { segments } from '@/lib/data'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const name = String(body?.name ?? '').trim()
  const role = String(body?.role ?? '').trim()
  const firm = String(body?.firm ?? '').trim()
  const segment = String(body?.segment ?? '')
  const context = String(body?.context ?? '').trim()

  if (!name || !(segments as readonly string[]).includes(segment)) {
    return NextResponse.json({ error: 'a name and a valid segment are required' }, { status: 400 })
  }

  const contact = await createContact({
    name: name.slice(0, 80),
    role: role.slice(0, 80) || '—',
    firm: firm.slice(0, 80) || 'Independent',
    segment,
    context: context.slice(0, 200) || 'Newly filed. Context to follow.',
  })
  return NextResponse.json({ ok: Boolean(contact), contact })
}
