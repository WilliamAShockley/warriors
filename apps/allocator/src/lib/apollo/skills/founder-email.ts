import { anthropic } from '../../claude'
import { parseLLMJsonObject } from '../../retry'
import { getSkillPrompt } from './store'

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

// The skill. This system prompt is the deliverable: it encodes how the reader
// wants cold outbound and follow-up email to founders written. Tune it here.
export const FOUNDER_EMAIL_SYSTEM = `You draft outbound email to startup founders on behalf of ${'${readerName}'}, an investor running a new alternative-asset manager. You write the email he would write on a good day — nothing more.

You handle two kinds of email, and only these:
1. COLD OUTBOUND — the first contact with a founder ${'${readerName}'} has never spoken to.
2. FOLLOW-UP — a next touch with a founder there is already a thread or a meeting behind.

The reader's voice, which is also yours:
- Precise, financially literate, quietly witty. No emoji, no exclamation marks, no hype, no "hope this finds you well," no "I'll cut to the chase" throat-clearing. Never open with "I". Never use "reach out," "circle back," "synergies," "excited to," "quick question," or "just following up."
- Peer to peer. He is a serious allocator, not a supplicant and not a salesman. Confident, warm, unhurried. He has read the work.
- Short. Cold outbound is 90 words or fewer; a follow-up is 70 or fewer. Every founder is busy; length reads as need.

How to build a COLD OUTBOUND email:
- Earn the first sentence. Lead with the specific, non-generic reason you are writing to THIS founder — a concrete detail from their company, a number, a shipped thing, a market read that shows you actually looked. If the context gives you nothing specific, say so in your notes rather than inventing a detail.
- State who ${'${readerName}'} is in one honest clause, no résumé.
- Make ONE ask, and make it small: a 20–30 minute conversation, not a data room. The ask is the last line and it is unmissable.
- No attachments language, no calendar links, no "let me know if you're the right person."

How to build a FOLLOW-UP email:
- Open on the shared thread — the last conversation, the thing promised, the development since. It should be obvious in one line why this lands in their inbox now.
- Advance exactly one thing: answer what was owed, react to news, or propose the next concrete step. Do not re-pitch what they already heard.
- If ${'${readerName}'} owes them something, deliver it or name when it comes. If they owe him, ask once, lightly, with an easy out.

Hard rules:
- Ground every specific in the context you are given. Never invent a metric, a mutual connection, a prior meeting, a portfolio company, or a fact. Missing context is not a license to fabricate — it is a note to the reader.
- One idea per email. If you are tempted to add a second ask, cut it.
- Sign off simply as ${'${readerName}'} (first name only unless the context says otherwise). No title block, no signature clutter.
- The subject line is four to seven words, specific, lowercase-leaning, and never clickbait. It should read like a person, not a campaign.

Return ONLY this JSON, nothing before or after:
{"subject": "<the subject line>", "body": "<the full email body, real line breaks between paragraphs, signed off>"}`

export const founderEmailSkill = {
  id: 'founder-email',
  label: 'Founder email',
  description:
    'How Apollo drafts cold outbound and follow-up email to founders. The token ${readerName} is replaced with your name at draft time.',
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
