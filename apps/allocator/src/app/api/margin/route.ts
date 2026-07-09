import { NextResponse } from 'next/server'
import { createMargin, listMargin } from '@/lib/margin'

export const maxDuration = 60

export async function GET() {
  return NextResponse.json(await listMargin())
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const text = String(body?.text ?? '').trim()
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

  const entry = await createMargin(text)
  if (!entry) return NextResponse.json({ error: 'could not file the entry' }, { status: 500 })
  return NextResponse.json({ entry })
}
