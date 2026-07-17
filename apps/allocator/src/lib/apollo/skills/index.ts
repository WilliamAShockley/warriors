// Apollo skills: specialized system prompts Apollo can reach for on top of its
// general briefing loop. Each skill is a self-contained drafting playbook run as
// a focused sub-call. Register new skills here; run.ts surfaces them to Apollo,
// and the Colophon (settings) reads/writes their prompts.
import { founderEmailSkill } from './founder-email'
import { schedulerSkill } from './scheduler'
import { getSkillPrompt, isSkillCustom } from './store'

export const APOLLO_SKILLS = [founderEmailSkill, schedulerSkill] as const

export type SkillMeta = (typeof APOLLO_SKILLS)[number]

// One line per skill for Apollo's system prompt, so it knows what it can invoke.
export function skillsBriefing(): string {
  return APOLLO_SKILLS.map((s) => `- ${s.label}: ${s.whenToUse}`).join('\n')
}

export type SkillView = {
  id: string
  label: string
  description: string
  whenToUse: string
  prompt: string // the prompt in force (override or default)
  defaultPrompt: string
  isCustom: boolean
}

// Every skill with its current and default prompt — for the settings editor.
export async function listSkillViews(): Promise<SkillView[]> {
  return Promise.all(
    APOLLO_SKILLS.map(async (s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
      whenToUse: s.whenToUse,
      prompt: await getSkillPrompt(s.id, s.defaultPrompt),
      defaultPrompt: s.defaultPrompt,
      isCustom: await isSkillCustom(s.id),
    }))
  )
}

export function getSkillMeta(id: string): SkillMeta | undefined {
  return APOLLO_SKILLS.find((s) => s.id === id)
}

export { draftFounderEmail, founderEmailSkill } from './founder-email'
export { proposeTimes, schedulerSkill } from './scheduler'
export { getSkillPrompt, setSkillPrompt, resetSkillPrompt, isSkillCustom } from './store'
export type { FounderEmailInput, FounderEmailMode, FounderEmailDraft } from './founder-email'
