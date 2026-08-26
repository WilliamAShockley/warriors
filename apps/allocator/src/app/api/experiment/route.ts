import { NextResponse, after } from 'next/server'
import {
  approveProof,
  distillProofLesson,
  editExperimentArm,
  experimentScoreboard,
  listExperiments,
  pickExperimentArm,
  spikeProof,
  superviseDelivery,
} from '@/lib/review'

// The Experiment: cold emails drafted both ways — with Dez's Context and
// without — decided here. GET lists the pairs on the desk plus the score;
// PATCH amends one arm inline; POST files the verdict:
//   { id, action: 'pick', arm }  — choose an arm (tracked; it goes on deck)
//   { id, action: 'send', arm }  — choose AND sign: the email actually sends
//   { id, action: 'spike' }      — kill the pair, no verdict on the tally

// A send runs the delivery watch post-response, same as the proof room.
export const maxDuration = 300

export async function GET() {
  const [experiments, score] = await Promise.all([listExperiments(), experimentScoreboard()])
  return NextResponse.json({ ...experiments, score })
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}))
  const id = String(body?.id ?? '').trim()
  const arm = Number(body?.arm)
  if (!id || !Number.isInteger(arm)) {
    return NextResponse.json({ error: 'id and arm required' }, { status: 400 })
  }
  const input: { body?: string; subject?: string } = {}
  if (body.body !== undefined) input.body = String(body.body)
  if (body.subject !== undefined) input.subject = String(body.subject)
  if (Object.keys(input).length === 0) {
    return NextResponse.json({ error: 'nothing to amend' }, { status: 400 })
  }
  const entry = await editExperimentArm(id, arm, input)
  if (!entry) return NextResponse.json({ error: 'could not amend that arm' }, { status: 400 })
  return NextResponse.json({ ok: true, entry })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const id = String(body?.id ?? '').trim()
  const action = String(body?.action ?? '')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  if (action === 'spike') {
    const ok = await spikeProof(id)
    if (ok) after(() => distillProofLesson(id))
    return NextResponse.json({ ok })
  }

  const arm = Number(body?.arm)
  if (!Number.isInteger(arm)) {
    return NextResponse.json({ error: 'arm required' }, { status: 400 })
  }

  if (action === 'pick') {
    const entry = await pickExperimentArm(id, arm)
    if (!entry) return NextResponse.json({ error: 'could not record the pick' }, { status: 400 })
    return NextResponse.json({ ok: true, entry })
  }

  if (action === 'send') {
    const entry = await pickExperimentArm(id, arm)
    if (!entry) return NextResponse.json({ error: 'could not record the pick' }, { status: 400 })
    const result = await approveProof(id)
    if (result.ok) {
      after(() => distillProofLesson(id))
      after(() => superviseDelivery(id))
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 502 })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
