import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getScope } from '@/lib/horizon/scope'
import { parseDrafts } from '@/lib/horizon/types'

export async function GET() {
  const { workspaceId } = await getScope()
  const approvals = await db.approval.findMany({
    where: { status: 'pending', mission: { workspaceId } },
    include: { mission: { select: { id: true, title: true, campaignId: true } } },
    orderBy: { createdAt: 'asc' },
  })

  // Hydrate per-kind detail so the queue can render dense review UIs.
  const detailed = await Promise.all(
    approvals.map(async (a) => {
      if (a.kind === 'target-list') {
        const payload = (a.payload ?? {}) as { membershipIds?: string[] }
        const members = await db.campaignMembership.findMany({
          where: { id: { in: payload.membershipIds ?? [] } },
          include: { person: true },
        })
        return {
          ...a,
          detail: members.map((m) => ({
            membershipId: m.id, name: m.person.name, email: m.person.email,
            company: m.person.currentCompany, role: m.person.currentRole,
            linkedinUrl: m.person.linkedinUrl, enrichment: m.person.enrichment, state: m.state,
          })),
        }
      }
      if (a.kind === 'message-strategy' && a.mission.campaignId) {
        const campaign = await db.campaign.findUnique({ where: { id: a.mission.campaignId } })
        return { ...a, detail: { messageStrategy: campaign?.messageStrategy, sequence: campaign?.sequence } }
      }
      if (a.kind === 'draft-batch') {
        const payload = (a.payload ?? {}) as { sampleMembershipIds?: string[]; total?: number; failingChecks?: number }
        const members = await db.campaignMembership.findMany({
          where: { id: { in: payload.sampleMembershipIds ?? [] } },
          include: { person: { select: { name: true, currentCompany: true } } },
        })
        return {
          ...a,
          detail: {
            total: payload.total,
            failingChecks: payload.failingChecks,
            sample: members.map((m) => ({
              membershipId: m.id, person: m.person.name, company: m.person.currentCompany,
              drafts: parseDrafts(m.drafts),
            })),
          },
        }
      }
      return { ...a, detail: null }
    })
  )
  return NextResponse.json({ approvals: detailed })
}
