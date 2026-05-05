import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

type EmailDraft = {
  id: string
  name: string
  subject: string
  body: string
  createdAt: string
  updatedAt: string
}

const SETTING_KEY = 'email_drafts'

async function getDrafts(): Promise<EmailDraft[]> {
  const setting = await db.setting.findUnique({ where: { key: SETTING_KEY } })
  if (!setting) return []
  try {
    return JSON.parse(setting.value) as EmailDraft[]
  } catch {
    return []
  }
}

async function saveDrafts(drafts: EmailDraft[]) {
  await db.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(drafts) },
    update: { value: JSON.stringify(drafts) },
  })
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const drafts = await getDrafts()
  const draft = drafts.find((d) => d.id === id)
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(draft)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const drafts = await getDrafts()
  const index = drafts.findIndex((d) => d.id === id)
  if (index === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const draft = drafts[index]
  if (body.name !== undefined) draft.name = body.name.trim()
  if (body.subject !== undefined) draft.subject = body.subject.trim()
  if (body.body !== undefined) draft.body = body.body.trim()
  draft.updatedAt = new Date().toISOString()

  drafts[index] = draft
  await saveDrafts(drafts)

  return NextResponse.json(draft)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const drafts = await getDrafts()
  const filtered = drafts.filter((d) => d.id !== id)
  if (filtered.length === drafts.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  await saveDrafts(filtered)
  return NextResponse.json({ ok: true })
}