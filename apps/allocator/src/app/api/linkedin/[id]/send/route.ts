import { NextResponse } from 'next/server'
import { queueProspect } from '@/lib/linkedin/store'
import { kickRunner } from '@/lib/linkedin/runner'

export const dynamic = 'force-dynamic'

// POST { rehearse?: boolean } — the reader's go-ahead for this one person.
// Queues the row and, where the app runs beside his LinkedIn session,
// starts the Playwright runner. Rehearse = everything but the send button.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const res = await queueProspect(id, Boolean(body?.rehearse))
  if (!res.ok) return NextResponse.json(res, { status: 409 })
  const runner = kickRunner(new URL(req.url).origin)
  return NextResponse.json({ ...res, runner })
}
