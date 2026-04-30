import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const KEY = 'draft_email'

export async function GET() {
  const setting = await db.setting.findUnique({ where: { key: KEY } })
  return NextResponse.json({ value: setting?.value ?? '' })
}

export async function PUT(req: Request) {
  const { value } = await req.json()
  const setting = await db.setting.upsert({
    where: { key: KEY },
    update: { value },
    create: { key: KEY, value },
  })
  return NextResponse.json({ value: setting.value })
}
