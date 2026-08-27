import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getScope } from '@/lib/horizon/scope'
import { parseDrafts, parseSequence, effectiveBody } from '@/lib/horizon/types'

/** Queue state for the approval-queue UI (LinkedIn + manual email fallback). */
export async function GET() {
  const { workspaceId } = await getScope()
  const memberships = await db.campaignMembership.findMany({
    where: { placementState: { in: ['queued', 'claimed', 'placed'] }, campaign: { workspaceId } },
    include: { person: true, campaign: true },
    orderBy: { nextActionAt: 'asc' },
  })
  const touches = memberships.map((m) => {
    const sequence = parseSequence(m.campaign.sequence)
    const touch = sequence[m.currentTouchIndex]
    const draft = parseDrafts(m.drafts).find((d) => d.touchIndex === m.currentTouchIndex)
    return {
      touchId: m.id,
      campaign: m.campaign.name,
      person: m.person.name,
      linkedinUrl: m.person.linkedinUrl,
      email: m.person.email,
      channel: touch?.channel ?? 'unknown',
      touchIndex: m.currentTouchIndex,
      placementState: m.placementState,
      placementError: m.placementError,
      claimedAt: m.claimedAt,
      placedAt: m.placedAt,
      subject: draft?.subject,
      draftText: draft ? effectiveBody(draft) : '',
    }
  })
  return NextResponse.json({ touches })
}
