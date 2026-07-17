import { NextResponse, after } from 'next/server'
import {
  amendProof,
  approveProof,
  approveViaLinkedIn,
  createProof,
  distillProofLesson,
  holdProof,
  ledger,
  nextProof,
  redoProof,
  spikeProof,
} from '@/lib/review'
import { workDocketItem } from '@/lib/apollo/worker'

// A redirect re-runs the full drafting pass after the response.
export const maxDuration = 300

const PROOF_KINDS = ['email', 'post', 'analysis'] as const

// The head of the queue — one proof at a time, never a list — plus the
// straight-through ledger.
export async function GET() {
  const [queue, theLedger] = await Promise.all([nextProof(), ledger()])
  return NextResponse.json({ ...queue, ledger: theLedger })
}

// { action: 'approve' | 'hold' | 'spike', id } reviews the proof on deck;
// { kind, title, body, ... } stages a new proof (the agents' entry point).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  if (body?.action && body?.id) {
    const id = String(body.id)
    if (body.action === 'approve') {
      const result = await approveProof(id)
      // A verdict with commentary becomes a standing lesson for future drafts.
      if (result.ok) after(() => distillProofLesson(id))
      return NextResponse.json(result, { status: result.ok ? 200 : 502 })
    }
    if (body.action === 'redo') {
      const correction = String(body?.correction ?? '').trim().slice(0, 1000)
      if (!correction) return NextResponse.json({ error: 'a correction is required' }, { status: 400 })
      const redo = await redoProof(id, correction)
      if (!redo) return NextResponse.json({ error: 'could not redirect' }, { status: 500 })
      after(() =>
        workDocketItem(redo.todoId, redo.taskText, {
          correction,
          previousTo: redo.previousTo,
          previousTitle: redo.previousTitle,
        })
      )
      return NextResponse.json({ ok: true })
    }
    if (body.action === 'approve_linkedin') {
      const result = await approveViaLinkedIn(id)
      if (result.ok) after(() => distillProofLesson(id))
      return NextResponse.json(result, { status: result.ok ? 200 : 502 })
    }
    if (body.action === 'hold') return NextResponse.json({ ok: await holdProof(id) })
    if (body.action === 'spike') {
      const ok = await spikeProof(id)
      if (ok) after(() => distillProofLesson(id))
      return NextResponse.json({ ok })
    }
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
  const linkedinUrl = String(body?.linkedinUrl ?? '').trim()
  if (kind === 'email') {
    const to = String(body?.to ?? '').trim()
    if (!to && !linkedinUrl) {
      return NextResponse.json(
        { error: 'an email proof needs a recipient address or a LinkedIn URL' },
        { status: 400 }
      )
    }
    if (to) {
      actionType = 'send_email'
      actionJson = JSON.stringify({
        to,
        subject: String(body?.subject ?? title).slice(0, 200),
        ...(body?.threadId ? { threadId: String(body.threadId) } : {}),
      })
    }
  }

  const proof = await createProof({
    kind,
    title: title.slice(0, 160),
    summary: String(body?.summary ?? '').trim().slice(0, 240) || undefined,
    body: text,
    actionType,
    actionJson,
    sourceUrl: String(body?.sourceUrl ?? '').trim() || undefined,
    linkedinUrl: linkedinUrl.slice(0, 300) || undefined,
    todoId: String(body?.todoId ?? '').trim() || undefined,
    grounding: String(body?.grounding ?? '').trim().slice(0, 20_000) || undefined,
    audience: ['founder', 'investor', 'other'].includes(body?.audience) ? body.audience : undefined,
    mode: ['cold', 'follow_up'].includes(body?.mode) ? body.mode : undefined,
  })
  return NextResponse.json({ ok: Boolean(proof), proof })
}

// Amend the proof on deck inline: the draft itself, the email envelope,
// or the reader's commentary on the output.
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}))
  const id = String(body?.id ?? '').trim()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const input: { body?: string; subject?: string; to?: string; commentary?: string } = {}
  if (body.body !== undefined) {
    const text = String(body.body).trim()
    if (!text) return NextResponse.json({ error: 'the draft cannot be empty' }, { status: 400 })
    input.body = text.slice(0, 20_000)
  }
  if (body.subject !== undefined) input.subject = String(body.subject).trim().slice(0, 200)
  if (body.to !== undefined) {
    const to = String(body.to).trim()
    if (!to) return NextResponse.json({ error: 'the recipient cannot be empty' }, { status: 400 })
    input.to = to.slice(0, 200)
  }
  if (body.commentary !== undefined) input.commentary = String(body.commentary).slice(0, 4000)

  if (Object.keys(input).length === 0) {
    return NextResponse.json({ error: 'nothing to amend' }, { status: 400 })
  }

  const proof = await amendProof(id, input)
  if (!proof) return NextResponse.json({ error: 'could not amend the proof' }, { status: 500 })
  return NextResponse.json({ ok: true, proof })
}
