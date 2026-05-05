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

export async function GET() {
  const drafts = await getDrafts()
  return NextResponse.json(drafts)
}

export async function POST(req: Request) {
  const body = await req.json()
  const { name, subject, body: emailBody } = body

  if (!name || !subject) {
    return NextResponse.json({ error: 'Name and subject are required' }, { status: 400 })
  }

  const drafts = await getDrafts()
  const now = new Date().toISOString()
  const newDraft: EmailDraft = {
    id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
    subject: subject.trim(),
    body: (emailBody ?? '').trim(),
    createdAt: now,
    updatedAt: now,
  }

  drafts.unshift(newDraft)
  await saveDrafts(drafts)

  return NextResponse.json(newDraft, { status: 201 })
}