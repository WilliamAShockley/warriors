import { NextResponse } from 'next/server'
import { runOg, type OgMode } from '@/lib/og'

export const maxDuration = 300

export async function POST(req: Request) {
  const { mode, input } = (await req.json()) as { mode?: OgMode; input?: string }
  if (mode !== 'name' && mode !== 'url') {
    return NextResponse.json({ error: 'mode must be "name" or "url"' }, { status: 400 })
  }
  if (!input?.trim()) return NextResponse.json({ error: 'input is required' }, { status: 400 })
  const row = await runOg(mode, input.trim())
  return NextResponse.json({ run: row })
}
