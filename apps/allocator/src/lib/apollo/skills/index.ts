// Apollo skills: specialized system prompts Apollo can reach for on top of its
// general briefing loop. Each skill is a self-contained drafting playbook run as
// a focused sub-call. Register new skills here; run.ts surfaces them to Apollo,
// and the Colophon (settings) reads/writes their prompts.
import { founderEmailSkill } from './founder-email'
import { schedulerSkill } from './scheduler'
import { addressGuessSkill } from './address-guess'
import { podcastLineSkill } from './podcast-line'
import { getSkillPrompt, isSkillCustom } from './store'

export const APOLLO_SKILLS = [founderEmailSkill, schedulerSkill, addressGuessSkill, podcastLineSkill] as const

export type SkillMeta = (typeof APOLLO_SKILLS)[number]

// One line per skill for Apollo's system prompt, so it knows what it can invoke.
export function skillsBriefing(): string {
  return APOLLO_SKILLS.map((s) => `- ${s.label}: ${s.whenToUse}`).join('\n')
}

// The reader-authored playbooks, briefed to Apollo alongside the built-ins.
// Empty string when he has authored none.
export async function customSkillsBriefing(): Promise<string> {
  const { listCustomSkills } = await import('./store')
  const custom = await listCustomSkills()
  if (custom.length === 0) return ''
  return `\n\nPlaybooks the reader has AUTHORED HIMSELF in Settings — invoke via the draft_with_skill tool with the exact skillId. When a task matches one of these, it takes PRECEDENCE over every other drafting route:\n${custom
    .map((s) => `- skillId "${s.id}" (${s.label}): ${s.whenToUse || 'no trigger note given'}`)
    .join('\n')}`
}

export type SkillView = {
  id: string
  label: string
  description: string
  whenToUse: string
  prompt: string // the prompt in force (override or default)
  defaultPrompt: string
  isCustom: boolean
  authored?: boolean // true for skills the reader wrote himself
}

// Every skill with its current and default prompt — for the settings editor.
// Built-ins first, then the reader's own, in the order he filed them.
export async function listSkillViews(): Promise<SkillView[]> {
  const builtIns = await Promise.all(
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
  const { listCustomSkills } = await import('./store')
  const authored = (await listCustomSkills()).map((s) => ({
    id: s.id,
    label: s.label,
    description: `Your own playbook. Apollo reaches for it ${s.whenToUse || 'when you tell it to'}.`,
    whenToUse: s.whenToUse,
    prompt: s.systemPrompt,
    defaultPrompt: s.systemPrompt,
    isCustom: true,
    authored: true,
  }))
  return [...builtIns, ...authored]
}

export function getSkillMeta(id: string): SkillMeta | undefined {
  return APOLLO_SKILLS.find((s) => s.id === id)
}

export { draftFounderEmail, founderEmailSkill } from './founder-email'
export { proposeTimes, schedulerSkill } from './scheduler'
export { draftWithSkill } from './custom'
export { generatePodcastLine, podcastLineSkill } from './podcast-line'
export {
  getSkillPrompt,
  setSkillPrompt,
  resetSkillPrompt,
  isSkillCustom,
  listCustomSkills,
  getCustomSkill,
  createCustomSkill,
  deleteCustomSkill,
} from './store'
export type { FounderEmailInput, FounderEmailMode, FounderEmailDraft } from './founder-email'
export type { CustomSkill } from './store'
