import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

export type MissionEventKind =
  | 'status-change'
  | 'progress'
  | 'approval-requested'
  | 'approval-resolved'
  | 'error'
  | 'note'

export type MissionActor = 'system' | 'user' | 'runner' | 'agent'

export async function emitMissionEvent(
  missionId: string,
  kind: MissionEventKind,
  payload: Record<string, unknown> = {},
  actor: MissionActor = 'system'
) {
  return db.missionEvent.create({
    data: { missionId, kind, payload: payload as Prisma.InputJsonValue, actor },
  })
}

/** Transition a mission's status and log it as a single event. */
export async function setMissionStatus(
  missionId: string,
  status: string,
  actor: MissionActor = 'system',
  note?: string
) {
  const mission = await db.mission.findUnique({ where: { id: missionId } })
  if (!mission || mission.status === status) return mission
  await db.mission.update({ where: { id: missionId }, data: { status } })
  await emitMissionEvent(missionId, 'status-change', { from: mission.status, to: status, note }, actor)
  return { ...mission, status }
}
