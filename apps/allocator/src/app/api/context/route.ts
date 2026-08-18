import { NextResponse, after } from 'next/server'
import { amendCompany, listCompanies, removeCompany, upsertCompany } from '@/lib/context'

// The Register's API. GET lists; POST { name, ... } files or updates by
// name; POST { id, remove: true } strikes an entry; PATCH { id, ... }
// amends fields explicitly (empty strings clear).
//
// File-time enrichment runs post-response (a bounded web check can take
// up to a minute), hence the elevated ceiling.
export const maxDuration = 120

export async function GET() {
  return NextResponse.json(await listCompanies())
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  if (body?.id && body?.remove === true) {
    return NextResponse.json({ ok: await removeCompany(String(body.id)) })
  }

  // Research It Now: run the enrichment synchronously and answer honestly —
  // the reader sees the real error instead of a spinner that gives up.
  if (body?.id && body?.enrich === true) {
    const { enrichCompanyById, listCompanies } = await import('@/lib/context')
    const result = await enrichCompanyById(String(body.id))
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error ?? 'enrichment failed' }, { status: 502 })
    }
    const { companies } = await listCompanies()
    return NextResponse.json({ ok: true, company: companies.find((c) => c.id === String(body.id)) ?? null })
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

  // File-time enrichment: a never-refreshed entry fills itself in right
  // after filing — the bounded web check runs behind the response, in the
  // filer's workspace (pinned now; the request context won't survive).
  if (company && !company.enrichedOn) {
    const { activeWorkspaceId, runAsWorkspace } = await import('@/lib/tenant')
    const ws = await activeWorkspaceId()
    after(async () => {
      const { enrichCompanyById } = await import('@/lib/context')
      await runAsWorkspace(ws, () => enrichCompanyById(company.id))
    })
  }
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
