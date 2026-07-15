import { anthropic } from '../../claude'
import { parseLLMJsonObject } from '../../retry'
import { getSkillPrompt } from './store'
import { DEZ_EMAIL_VOICE } from './founder-email-voice'

// Skills run as focused sub-calls with their own system prompt, so the email is
// governed by this drafting philosophy rather than Apollo's briefing voice.
// Kept off run.ts's APOLLO_MODEL to avoid an import cycle (run → tools → skills).
const SKILL_MODEL = process.env.APOLLO_SKILL_MODEL || process.env.APOLLO_MODEL || 'claude-opus-4-8'

export type FounderEmailMode = 'cold' | 'follow_up'

export type FounderEmailInput = {
  mode: FounderEmailMode
  founder: string
  firm?: string
  // Everything Apollo has already gathered from the workspace: the relationship
  // history, the last meeting, the relevant thesis, the reason for reaching out,
  // and the single concrete ask this email should land.
  context: string
  goal?: string
}

export type FounderEmailDraft = {
  subject: string
  body: string
}

// The skill. Its system prompt is Dez's real email voice profile (reverse-
// engineered from his sent "Reaching Out" mail), wrapped with the operating
// rules and the strict JSON output contract. Tune the voice from settings, or
// regenerate founder-email-voice.ts from the source .md.
export const FOUNDER_EMAIL_SYSTEM = `You are drafting an outbound email to a startup founder in Dez's exact voice. Dez is a Principal at FirstMark, an early-stage NYC venture firm. Below is his email voice profile, reverse-engineered from his real sent mail. Write the email he would actually send — match the structure, the sentence-level voice, the ask pattern, and above all the negative constraints. Where the profile tells you to keep "clichés" ("circle back", "hope this note finds you well"), comma splices, spaced hyphens, "+" as a connector, and the occasional typo — KEEP them. A tidy, grammatically immaculate, cliché-scrubbed draft is WRONG and reads nothing like Dez.

=== DEZ — EMAIL VOICE PROFILE ===
${DEZ_EMAIL_VOICE}
=== END PROFILE ===

Operating rules for this task:
- You handle two types: COLD outbound (touch-1) and FOLLOW-UP (touch 2+). The user message says which — match that type's structure from the profile exactly. Cold = one 100–180-word block (greeting fused with pleasantry + hook, self/firm intro, portfolio list, dated thesis) then a short ask paragraph, then a one-line forward-motion closer, then "Dez". Follow-up = 1–2 sentences, a rotated opener, no re-pitch, often no sign-off.
- Ground every recipient-specific claim — their company, what they are building, the news/event trigger, prior-thread context — in the context you are given. Never invent a fact about the recipient. Dez's own boilerplate (the FirstMark intro, the Pinterest/Shopify/DraftKings/etc. portfolio list, the thesis language) is his to reuse as written in the profile.
- Subject line follows the profile: "Reaching Out - [Company] <> FirstMark" (order flips freely; a follow-up uses "Re: Reaching Out - ...").

Return ONLY this JSON, nothing before or after:
{"subject": "<the subject line>", "body": "<the full email body, real line breaks between paragraphs, signed off Dez unless it is a short follow-up>"}`

export const founderEmailSkill = {
  id: 'founder-email',
  label: 'Founder email',
  description:
    "Dez's cold-outbound and follow-up email voice for founders, reverse-engineered from his real sent mail. This is the system prompt Apollo drafts founder emails with — edit it here and the next draft follows it.",
  // Surfaced to Apollo so it knows when to reach for the tool.
  whenToUse:
    'when a Docket task asks to write, draft, or send a cold outbound or follow-up email to a founder',
  defaultPrompt: FOUNDER_EMAIL_SYSTEM,
} as const

// Run the skill: a focused LLM call governed by the skill's own system prompt.
export async function draftFounderEmail(
  input: FounderEmailInput,
  readerName: string
): Promise<FounderEmailDraft> {
  // The reader's saved prompt if any, else the code default.
  const template = await getSkillPrompt('founder-email', FOUNDER_EMAIL_SYSTEM)
  const system = template.replaceAll('${readerName}', readerName)
  const modeLine =
    input.mode === 'cold'
      ? 'This is a COLD OUTBOUND email — the first contact with this founder.'
      : 'This is a FOLLOW-UP email — there is already a thread or a meeting behind it.'

  const user = `${modeLine}

Founder: ${input.founder}${input.firm ? ` — ${input.firm}` : ''}
${input.goal ? `What this email should accomplish: ${input.goal}\n` : ''}
Context gathered from the reader's workspace (ground every specific in this; invent nothing):
${input.context.trim() || '(no context supplied — say plainly in the body that you lacked specifics, and keep the email honest and minimal)'}

Draft the email now.`

  const response = await anthropic.messages.create({
    model: SKILL_MODEL,
    max_tokens: 1200,
    system,
    messages: [{ role: 'user', content: user }],
  } as any)

  const text = (response.content as any[])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')

  const parsed = parseLLMJsonObject<FounderEmailDraft>(text, { subject: '', body: text.trim() })
  return {
    subject: (parsed.subject || '').trim() || '(no subject)',
    body: (parsed.body || '').trim() || text.trim(),
  }
}
