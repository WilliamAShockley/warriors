import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { executeDraft } from '@/lib/morningReport/execute'

// Manual approval: execute a pending draft (send the email / create the event).
// This is the path every action takes by default, since the autonomy gate
// leaves drafts "pending" unless explicitly armed.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const draft = await db.actionDraft.findUnique({ where: { id } })
    if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (draft.status === 'executed') {
      return NextResponse.json({ error: 'Already executed' }, { status: 409 })
    }

    const outcome = await executeDraft(draft, { auto: false })
    const updated = await db.actionDraft.findUnique({ where: { id } })

    return NextResponse.json(
      { ...outcome, draft: updated },
      { status: outcome.ok ? 200 : 502 },
    )
  } catch (error: any) {
    console.error('Failed to approve draft:', error)
    return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 500 })
  }
}
