import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getScope } from '@/lib/horizon/scope'

export async function GET() {
  const { workspaceId } = await getScope()
  const missions = await db.mission.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    include: {
      campaign: { select: { id: true, name: true, status: true } },
      approvals: { where: { status: 'pending' }, select: { id: true, kind: true } },
    },
  })
  const withCounts = await Promise.all(
    missions.map(async (m) => {
      const states = m.campaignId
        ? await db.campaignMembership.groupBy({
            by: ['state'],
            where: { campaignId: m.campaignId },
            _count: true,
          })
        : []
      return {
        id: m.id, title: m.title, type: m.type, status: m.status, createdAt: m.createdAt,
        campaign: m.campaign, pendingApprovals: m.approvals,
        stateCounts: Object.fromEntries(states.map((s) => [s.state, s._count])),
      }
    })
  )
  return NextResponse.json({ missions: withCounts })
}
