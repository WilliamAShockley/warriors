import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getScope } from '@/lib/horizon/scope'
import { applyApprovalResolution } from '@/lib/horizon/pipeline'

/**
 * Resolve an approval. This route (driven by the structured approval-queue
 * UI) is the ONLY write path into the Approval table — the chat agent has no
 * tool that reaches it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { workspaceId } = await getScope()
  const approval = await db.approval.findFirst({ where: { id, mission: { workspaceId } } })
  if (!approval) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const status = body?.status === 'rejected' ? 'rejected' : 'approved'
  try {
    await applyApprovalResolution(id, {
      status,
      messageStrategy: body?.messageStrategy,
      sequence: body?.sequence,
      includedMembershipIds: body?.includedMembershipIds,
      draftEdits: body?.draftEdits,
      resolvedBy: 'operator',
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
