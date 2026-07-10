import { NextResponse } from 'next/server'
import { getTask, saveFeedback } from '@/lib/apollo/store'
import { distillLesson } from '@/lib/apollo/run'

export const maxDuration = 60

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const task = await getTask(id)
  if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(task)
}

// Reader feedback — the reward signal. Distills one lesson for future runs.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const verdict = body?.verdict === 'good' || body?.verdict === 'needs-work' ? body.verdict : null
  if (!verdict) return NextResponse.json({ error: 'verdict required' }, { status: 400 })

  const note = body?.note ? String(body.note).slice(0, 1000) : null
  const ok = await saveFeedback(id, verdict, note)
  if (ok) {
    const task = await getTask(id)
    if (task) await distillLesson(task)
  }
  return NextResponse.json({ ok })
}
