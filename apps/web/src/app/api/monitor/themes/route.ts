import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const themes = await db.monitorTheme.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { hits: { where: { status: 'pending' } } } },
    },
  })
  return NextResponse.json(themes)
}

export async function POST(req: Request) {
  const body = await req.json()
  if (!body.name || !body.description) {
    return NextResponse.json({ error: 'name and description required' }, { status: 400 })
  }
  const theme = await db.monitorTheme.create({
    data: {
      name: body.name,
      description: body.description,
      keywords: body.keywords ?? null,
      enabled: body.enabled ?? true,
    },
  })
  return NextResponse.json(theme, { status: 201 })
}
