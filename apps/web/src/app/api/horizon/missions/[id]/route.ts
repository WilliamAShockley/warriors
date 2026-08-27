import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getScope } from '@/lib/horizon/scope'
import { setMissionStatus } from '@/lib/horizon/events'
import { buildCampaignReport, isLinkedInPaused, setLinkedInPaused } from '@/lib/horizon/pipeline'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { workspaceId } = await getScope()
  const mission = await db.mission.findFirst({
    where: { id, workspaceId },
    include: { campaign: true },
  })
  if (!mission) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const [events, approvals, report, liPaused] = await Promise.all([
    db.missionEvent.findMany({ where: { missionId: id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    db.approval.findMany({ where: { missionId: id }, orderBy: { createdAt: 'desc' } }),
    buildCampaignReport(id),
    isLinkedInPaused(id),
  ])
  return NextResponse.json({ mission, events, approvals, report, linkedinPaused: liPaused })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { workspaceId } = await getScope()
  const mission = await db.mission.findFirst({ where: { id, workspaceId } })
  if (!mission) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const action = String(body?.action ?? '')

  if (action === 'pause') await setMissionStatus(id, 'paused', 'user')
  else if (action === 'resume') await setMissionStatus(id, 'running', 'user')
  else if (action === 'cancel') {
    await setMissionStatus(id, 'failed', 'user', 'cancelled by operator')
    if (mission.campaignId) {
      await db.campaign.update({ where: { id: mission.campaignId }, data: { status: 'paused' } })
      await db.campaignMembership.updateMany({
        where: { campaignId: mission.campaignId, state: { in: ['sourced', 'enriched', 'drafted', 'approved', 'queued'] } },
        data: { state: 'closed', outcome: 'mission-cancelled', placementState: null, nextActionAt: null },
      })
    }
  } else if (action === 'resume-linkedin') await setLinkedInPaused(id, false)
  else return NextResponse.json({ error: 'unknown action' }, { status: 400 })

  const updated = await db.mission.findUnique({ where: { id } })
  return NextResponse.json({ mission: updated })
}
