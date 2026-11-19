import { NextResponse } from 'next/server'
import { setConfig } from '@/lib/linkedin/store'

export const dynamic = 'force-dynamic'

// POST { template?, subject?, dailyCap? } — the standing draft and the daily cap.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const config = await setConfig({ template: body?.template, subject: body?.subject, dailyCap: body?.dailyCap })
  return NextResponse.json({ ok: true, config })
}
