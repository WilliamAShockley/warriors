import { NextResponse } from 'next/server'
import { setConfig } from '@/lib/linkedin/store'

export const dynamic = 'force-dynamic'

// POST { templates?, defaultTemplateId?, dailyCap? } — the named templates and the daily cap.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const config = await setConfig({ templates: body?.templates, defaultTemplateId: body?.defaultTemplateId, dailyCap: body?.dailyCap })
  return NextResponse.json({ ok: true, config })
}
