// The context experiment: every cold founder draft comes as an A/B pair —
// the same email drafted WITH Dez's Context and WITHOUT it — decided by
// the reader in The Experiment, one verdict per pair.
//
// The pairing rides under Apollo, not through it: draft_founder_email
// runs both arms and hands Apollo only the with-context draft (the pipe
// behaves exactly as it always has); when stage_proof files that body,
// the pair is picked up here and both arms land on the proof. Apollo
// never composes, copies, or even sees the control arm — nothing for it
// to polish or garble.

export const ARM_WITH = 'With your context'
export const ARM_WITHOUT = 'Without your context'

export type ExperimentArm = { label: string; subject?: string; body: string }

export type ExperimentRecord = {
  kind: 'context-ab'
  arms: ExperimentArm[] // as staged, immutable; index 0 = with context
  chosen: number | null
  chosenAt: string | null
}

type PendingPair = { arms: ExperimentArm[]; at: number }

// Keyed by the primary (with-context) body, exactly as returned — the
// doctrine stages skill drafts verbatim, so the staged body matches. If
// Apollo edited the draft against doctrine, no pair attaches and the
// proof files as an ordinary single draft. Entries expire with the run.
const pending = new Map<string, PendingPair>()
const PAIR_TTL_MS = 10 * 60 * 1000
const key = (body: string) => body.trim()

export function rememberExperimentPair(withContext: ExperimentArm, without: ExperimentArm): void {
  // Housekeeping: drop stale pairs so a warm instance never accumulates.
  const now = Date.now()
  for (const [k, v] of pending) if (now - v.at > PAIR_TTL_MS) pending.delete(k)
  pending.set(key(withContext.body), { arms: [withContext, without], at: now })
}

export function takeExperimentPair(stagedBody: string): ExperimentArm[] | null {
  const hit = pending.get(key(stagedBody))
  if (!hit) return null
  pending.delete(key(stagedBody))
  if (Date.now() - hit.at > PAIR_TTL_MS) return null
  return hit.arms
}

export const newExperimentRecord = (arms: ExperimentArm[]): ExperimentRecord => ({
  kind: 'context-ab',
  arms,
  chosen: null,
  chosenAt: null,
})
