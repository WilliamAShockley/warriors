import type Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { getScope } from './scope'
import { emitMissionEvent, setMissionStatus } from './events'
import { buildCampaignReport } from './pipeline'

/**
 * Server-executed tools for the Horizon chat agent. All reads are scoped
 * through getScope(). Write access is deliberately limited to create_mission,
 * pause_mission, resume_mission — there is NO tool that touches the Approval
 * table; the agent can only link the operator to /horizon/approvals.
 */

export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'create_mission',
    description:
      'Create a new outreach mission (Mission + Campaign rows). ONLY call this after you have restated the mission details in chat and the operator replied with an explicit confirmation word (e.g. "confirm" / "yes"). Sourcing happens afterwards via CSV upload in the approval queue.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        instruction: { type: 'string', description: "The operator's original ask, verbatim" },
        campaignName: { type: 'string' },
        hypothesis: { type: 'string', description: 'What this campaign tests' },
        messageStrategy: { type: 'string' },
        sequence: {
          type: 'array',
          description: 'Ordered touches. Default: email day 0, linkedin day 3, email day 7.',
          items: {
            type: 'object',
            properties: {
              channel: { type: 'string', enum: ['email', 'linkedin'] },
              delayDays: { type: 'number' },
              template: { type: 'string' },
            },
            required: ['channel', 'delayDays'],
          },
        },
        exclusions: {
          type: 'object',
          properties: {
            recontactDays: { type: 'number' },
            excludeTags: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      required: ['title', 'instruction', 'campaignName'],
    },
  },
  {
    name: 'list_missions',
    description: 'List missions in this workspace with status and campaign linkage.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_mission_status',
    description: 'Progress summary for one mission: pipeline state counts, recent events, pending approvals.',
    input_schema: {
      type: 'object',
      properties: { missionId: { type: 'string' }, titleQuery: { type: 'string', description: 'Fuzzy title match if id unknown' } },
    },
  },
  {
    name: 'get_pending_approvals',
    description: 'Pending approvals across all missions, with links into the approval queue. You cannot resolve approvals — direct the operator to the link.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_linkedin_queue_summary',
    description: 'Current LinkedIn queue state: due touches by placement state (queued/claimed/placed/failed).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'search_people',
    description: 'Search the firm-level people graph by name, tag, or company.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' }, tag: { type: 'string' }, company: { type: 'string' } },
    },
  },
  {
    name: 'get_campaign_report',
    description: 'Sends / replies / outcome breakdown for a running or completed mission.',
    input_schema: { type: 'object', properties: { missionId: { type: 'string' } }, required: ['missionId'] },
  },
  {
    name: 'pause_mission',
    description: 'Pause a mission. ONLY call after restating and receiving an explicit confirmation word in chat.',
    input_schema: { type: 'object', properties: { missionId: { type: 'string' } }, required: ['missionId'] },
  },
  {
    name: 'resume_mission',
    description: 'Resume a paused mission. ONLY call after restating and receiving an explicit confirmation word in chat.',
    input_schema: { type: 'object', properties: { missionId: { type: 'string' } }, required: ['missionId'] },
  },
]

async function resolveMission(workspaceId: string, input: { missionId?: string; titleQuery?: string }) {
  if (input.missionId) {
    return db.mission.findFirst({ where: { id: input.missionId, workspaceId } })
  }
  if (input.titleQuery) {
    return db.mission.findFirst({
      where: { workspaceId, title: { contains: input.titleQuery, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
    })
  }
  return null
}

export async function executeChatTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const { workspaceId } = await getScope()

  switch (name) {
    case 'create_mission': {
      const campaign = await db.campaign.create({
        data: {
          workspaceId,
          name: String(input.campaignName),
          hypothesis: (input.hypothesis as string) ?? null,
          messageStrategy: (input.messageStrategy as string) ?? null,
          sequence: (input.sequence as Prisma.InputJsonValue) ?? ([
            { channel: 'email', delayDays: 0, template: 'intro' },
            { channel: 'linkedin', delayDays: 3, template: 'nudge' },
            { channel: 'email', delayDays: 7, template: 'breakup' },
          ] as unknown as Prisma.InputJsonValue),
          icpDefinition: { exclusions: (input.exclusions as object) ?? { recontactDays: 30 } } as Prisma.InputJsonValue,
          status: 'draft',
        },
      })
      const mission = await db.mission.create({
        data: {
          workspaceId,
          type: 'outreach_campaign',
          title: String(input.title),
          instruction: String(input.instruction),
          campaignId: campaign.id,
          status: 'created',
          createdBy: 'chat',
        },
      })
      await emitMissionEvent(mission.id, 'status-change', { to: 'created', via: 'chat' }, 'agent')
      return {
        missionId: mission.id, campaignId: campaign.id,
        next: `Mission created. Next step: upload the target list (CSV) at /horizon/approvals?mission=${mission.id} — sourcing, then the strategy and list gates.`,
      }
    }

    case 'list_missions': {
      const missions = await db.mission.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { campaign: { select: { name: true, status: true } } },
      })
      return missions.map((m) => ({
        id: m.id, title: m.title, status: m.status, type: m.type,
        campaign: m.campaign?.name, campaignStatus: m.campaign?.status, createdAt: m.createdAt,
      }))
    }

    case 'get_mission_status': {
      const mission = await resolveMission(workspaceId, input as { missionId?: string; titleQuery?: string })
      if (!mission) return { error: 'mission not found' }
      const [events, approvals, report] = await Promise.all([
        db.missionEvent.findMany({ where: { missionId: mission.id }, orderBy: { createdAt: 'desc' }, take: 10 }),
        db.approval.findMany({ where: { missionId: mission.id, status: 'pending' } }),
        buildCampaignReport(mission.id),
      ])
      return {
        id: mission.id, title: mission.title, status: mission.status,
        stateCounts: report?.states ?? {}, sends: report?.sends ?? 0, replies: report?.replies ?? 0,
        pendingApprovals: approvals.map((a) => ({ id: a.id, kind: a.kind, link: `/horizon/approvals?approval=${a.id}` })),
        recentEvents: events.map((e) => ({ kind: e.kind, payload: e.payload, actor: e.actor, at: e.createdAt })),
      }
    }

    case 'get_pending_approvals': {
      const approvals = await db.approval.findMany({
        where: { status: 'pending', mission: { workspaceId } },
        include: { mission: { select: { title: true } } },
        orderBy: { createdAt: 'asc' },
      })
      return approvals.map((a) => ({
        id: a.id, kind: a.kind, mission: a.mission.title, createdAt: a.createdAt,
        link: `/horizon/approvals?approval=${a.id}`,
        note: 'Resolve in the approval queue — approvals cannot be resolved from chat.',
      }))
    }

    case 'get_linkedin_queue_summary': {
      const memberships = await db.campaignMembership.findMany({
        where: { placementState: { not: null }, campaign: { workspaceId } },
        include: { person: { select: { name: true } }, campaign: { select: { name: true } } },
      })
      const byState: Record<string, number> = {}
      for (const m of memberships) byState[m.placementState!] = (byState[m.placementState!] ?? 0) + 1
      return {
        byState,
        due: memberships.slice(0, 20).map((m) => ({
          touchId: m.id, person: m.person.name, campaign: m.campaign.name,
          placementState: m.placementState, error: m.placementError,
        })),
        link: '/horizon/approvals#linkedin',
      }
    }

    case 'search_people': {
      const { firmId } = await getScope()
      const q = (input.query as string) ?? ''
      const people = await db.person.findMany({
        where: {
          deletedAt: null,
          OR: [{ firmId }, { firmId: null }],
          ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}),
          ...(input.tag ? { tags: { has: String(input.tag) } } : {}),
          ...(input.company ? { currentCompany: { contains: String(input.company), mode: 'insensitive' } } : {}),
        },
        take: 25,
        orderBy: { updatedAt: 'desc' },
      })
      return people.map((p) => ({
        id: p.id, name: p.name, email: p.email, company: p.currentCompany,
        role: p.currentRole, tags: p.tags, status: p.status, linkedinUrl: p.linkedinUrl,
      }))
    }

    case 'get_campaign_report': {
      const mission = await resolveMission(workspaceId, input as { missionId?: string })
      if (!mission) return { error: 'mission not found' }
      return (await buildCampaignReport(mission.id)) ?? { error: 'mission has no campaign' }
    }

    case 'pause_mission':
    case 'resume_mission': {
      const mission = await resolveMission(workspaceId, input as { missionId?: string })
      if (!mission) return { error: 'mission not found' }
      const to = name === 'pause_mission' ? 'paused' : 'running'
      await setMissionStatus(mission.id, to, 'agent', 'via chat')
      return { id: mission.id, status: to }
    }

    default:
      return { error: `unknown tool ${name}` }
  }
}
