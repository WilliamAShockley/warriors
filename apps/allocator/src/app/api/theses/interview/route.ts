import { NextResponse } from 'next/server'
import { interviewTurn, type InterviewTurn } from '@/lib/theses'

export const maxDuration = 60

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const turns: InterviewTurn[] = Array.isArray(body?.turns)
    ? body.turns
        .filter((t: any) => (t?.role === 'desk' || t?.role === 'reader') && typeof t?.text === 'string')
        .slice(0, 20)
    : []
  if (turns.length === 0 || turns[turns.length - 1].role !== 'reader') {
    return NextResponse.json({ error: 'transcript must end with the reader' }, { status: 400 })
  }

  try {
    return NextResponse.json(await interviewTurn(turns))
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'interview failed' },
      { status: 500 }
    )
  }
}
