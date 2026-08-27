import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createContact, updateContact, type ContactAmendment } from '@/lib/book'
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

// Amend an existing entry. Only provided fields change; blank optional
// fields (relationship, follow-up, location) are cleared.
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}))
  const id = String(body?.id ?? '').trim()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const amendment: ContactAmendment = {}

  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 80)
    if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    amendment.name = name
  }
  if (body.segment !== undefined) {
    const segment = String(body.segment)
    if (!(segments as readonly string[]).includes(segment)) {
      return NextResponse.json({ error: 'invalid segment' }, { status: 400 })
    }
    amendment.segment = segment
  }
  if (body.role !== undefined) amendment.role = String(body.role).trim().slice(0, 80) || '—'
  if (body.firm !== undefined) amendment.firm = String(body.firm).trim().slice(0, 80) || 'Independent'
  if (body.context !== undefined) amendment.context = String(body.context).trim().slice(0, 200) || 'Context to follow.'
  if (body.relationship !== undefined) amendment.relationship = String(body.relationship).trim().slice(0, 2000) || null
  if (body.followUp !== undefined) amendment.followUp = String(body.followUp).trim().slice(0, 500) || null
  if (body.location !== undefined) amendment.location = String(body.location).trim().slice(0, 80) || null

  if (Object.keys(amendment).length === 0) {
    return NextResponse.json({ error: 'nothing to amend' }, { status: 400 })
  }

  const contact = await updateContact(id, amendment)
  if (!contact) return NextResponse.json({ error: 'could not amend the entry' }, { status: 500 })

  // The contact page is statically cached once rendered — an amendment
  // must bust it, or the old entry keeps serving.
  revalidatePath(`/book/${id}`)
  revalidatePath('/book')
  return NextResponse.json({ ok: true, contact })
}
