import { NextResponse } from 'next/server'
import { amendCompany, listCompanies, removeCompany, upsertCompany } from '@/lib/context'

// The Register's API. GET lists; POST { name, ... } files or updates by
// name; POST { id, remove: true } strikes an entry; PATCH { id, ... }
// amends fields explicitly (empty strings clear).

export async function GET() {
  return NextResponse.json(await listCompanies())
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  if (body?.id && body?.remove === true) {
    return NextResponse.json({ ok: await removeCompany(String(body.id)) })
  }

  const name = String(body?.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'a company name is required' }, { status: 400 })

  const company = await upsertCompany({
    name,
    founderFirstName: body?.founderFirstName ? String(body.founderFirstName) : undefined,
    founderFullName: body?.founderFullName ? String(body.founderFullName) : undefined,
    context: body?.context ? String(body.context) : undefined,
    websiteUrl: body?.websiteUrl ? String(body.websiteUrl) : undefined,
    founderEmail: body?.founderEmail ? String(body.founderEmail) : undefined,
    linkedinUrl: body?.linkedinUrl ? String(body.linkedinUrl) : undefined,
  })
  return NextResponse.json({ ok: Boolean(company), company })
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}))
  const id = String(body?.id ?? '').trim()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const input: Record<string, string> = {}
  for (const f of ['name', 'founderFirstName', 'founderFullName', 'context', 'websiteUrl', 'founderEmail', 'linkedinUrl']) {
    if (body[f] !== undefined) input[f] = String(body[f])
  }
  if (Object.keys(input).length === 0) {
    return NextResponse.json({ error: 'nothing to amend' }, { status: 400 })
  }
  const company = await amendCompany(id, input)
  if (!company) return NextResponse.json({ error: 'could not amend the entry' }, { status: 500 })
  return NextResponse.json({ ok: true, company })
}
