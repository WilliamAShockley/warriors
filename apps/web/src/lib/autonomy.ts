// Autonomy gate for Morning Report actions.
//
// Every AI-drafted action (email reply, calendar event, follow-up) is gated.
// An action only auto-executes if BOTH:
//   1. the master switch (`autonomy.enabled`) is armed, AND
//   2. that action type's mode is set to "auto".
//
// Defaults are deliberately conservative: master OFF, every type "manual".
// Out of the box, nothing runs without explicit approval. The full-autonomy
// path is fully built — you arm it per-type when you trust it.

import { db } from './db'

export type ActionType = 'email' | 'calendar' | 'follow_up'
export type AutonomyMode = 'manual' | 'auto'

const MASTER_KEY = 'autonomy.enabled'
const typeKey = (type: ActionType) => `autonomy.mode.${type}`

export interface AutonomySettings {
  enabled: boolean
  modes: Record<ActionType, AutonomyMode>
}

const ACTION_TYPES: ActionType[] = ['email', 'calendar', 'follow_up']

export async function getAutonomySettings(): Promise<AutonomySettings> {
  const keys = [MASTER_KEY, ...ACTION_TYPES.map(typeKey)]
  const rows = await db.setting.findMany({ where: { key: { in: keys } } })
  const map = new Map(rows.map((r) => [r.key, r.value]))

  const modes = Object.fromEntries(
    ACTION_TYPES.map((t) => [t, map.get(typeKey(t)) === 'auto' ? 'auto' : 'manual']),
  ) as Record<ActionType, AutonomyMode>

  return {
    enabled: map.get(MASTER_KEY) === 'true',
    modes,
  }
}

export interface AutonomyPatch {
  enabled?: boolean
  modes?: Partial<Record<ActionType, AutonomyMode>>
}

export async function updateAutonomySettings(
  patch: AutonomyPatch,
): Promise<AutonomySettings> {
  const writes: Promise<unknown>[] = []

  if (patch.enabled !== undefined) {
    const value = patch.enabled ? 'true' : 'false'
    writes.push(
      db.setting.upsert({
        where: { key: MASTER_KEY },
        update: { value },
        create: { key: MASTER_KEY, value },
      }),
    )
  }

  if (patch.modes) {
    for (const t of ACTION_TYPES) {
      const mode = patch.modes[t]
      if (mode === undefined) continue
      const value = mode === 'auto' ? 'auto' : 'manual'
      writes.push(
        db.setting.upsert({
          where: { key: typeKey(t) },
          update: { value },
          create: { key: typeKey(t), value },
        }),
      )
    }
  }

  await Promise.all(writes)
  return getAutonomySettings()
}

// The gate: should an action of this type run automatically?
export function shouldAutoExecute(
  settings: AutonomySettings,
  type: ActionType,
): boolean {
  return settings.enabled && settings.modes[type] === 'auto'
}
