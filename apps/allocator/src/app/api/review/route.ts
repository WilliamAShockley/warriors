import { NextResponse } from 'next/server'
import { approveProof, createProof, holdProof, nextProof, spikeProof } from '@/lib/review'

const PROOF_KINDS = ['email', 'post', 'analysis'] as const

// The head of the queue — one proof at a time, never a list.
export async function GET() {
  return NextResponse.json(await nextProof())
}

// { action: 'approve' | 'hold' | 'spike', id } reviews the proof on deck;
// { kind, title, body, ... } stages a new proof (the agents' entry point).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  if (body?.action && body?.id) {
    const id = String(body.id)
    if (body.action === 'approve') {
      const result = await approveProof(id)
      return NextResponse.json(result, { status: result.ok ? 200 : 502 })
    }
    if (body.action === 'hold') return NextResponse.json({ ok: await holdProof(id) })
    if (body.action === 'spike') return NextResponse.json({ ok: await spikeProof(id) })
    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  }

  const kind = String(body?.kind ?? '')
  const title = String(body?.title ?? '').trim()
  const text = String(body?.body ?? '').trim()
  if (!(PROOF_KINDS as readonly string[]).includes(kind) || !title || !text) {
    return NextResponse.json({ error: 'kind, title, and body required' }, { status: 400 })
  }

  let actionType = 'none'
  let actionJson: string | undefined
  if (kind === 'email') {
    const to = String(body?.to ?? '').trim()
    if (!to) return NextResponse.json({ error: 'an email proof needs a recipient' }, { status: 400 })
    actionType = 'send_email'
    actionJson = JSON.stringify({
      to,
      subject: String(body?.subject ?? title).slice(0, 200),
      ...(body?.threadId ? { threadId: String(body.threadId) } : {}),
    })
  }

  const proof = await createProof({
    kind,
    title: title.slice(0, 160),
    summary: String(body?.summary ?? '').trim().slice(0, 240) || undefined,
    body: text,
    actionType,
    actionJson,
    sourceUrl: String(body?.sourceUrl ?? '').trim() || undefined,
    todoId: String(body?.todoId ?? '').trim() || undefined,
  })
  return NextResponse.json({ ok: Boolean(proof), proof })
}
