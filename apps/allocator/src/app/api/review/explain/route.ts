import { NextResponse } from 'next/server'
import { explainSelection } from '@/lib/review'

export const maxDuration = 60

// Highlight-to-provenance: given a highlighted passage of the proof on
// deck, say where the language came from — the research, the thread, the
// reader's own voice boilerplate — or flag it as unsupported.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const id = String(body?.id ?? '').trim()
  const selection = String(body?.selection ?? '').trim()
  if (!id || !selection) {
    return NextResponse.json({ error: 'id and selection required' }, { status: 400 })
  }

  const result = await explainSelection(id, selection.slice(0, 600))
  if (!result) {
    return NextResponse.json(
      { error: 'The desk could not trace it — try again, or check it by hand.' },
      { status: 502 }
    )
  }
  return NextResponse.json(result)
}
