// The generic runner for reader-authored skills: a focused sub-call whose
// system prompt is whatever the reader wrote in Settings, wrapped with the
// same operating rules and output contract the built-in drafting skills
// obey. One runner serves every custom playbook.
import { getCustomSkill } from './store'

const SKILL_MODEL = process.env.APOLLO_SKILL_MODEL || process.env.APOLLO_MODEL || 'claude-opus-4-8'

export type CustomSkillInput = {
  skillId: string
  recipient?: string
  goal?: string
  // Everything Apollo gathered from the workspace — the skill invents nothing.
  context: string
}

export type CustomSkillDraft = {
  subject: string
  body: string
}

export async function draftWithSkill(
  input: CustomSkillInput,
  readerName: string
): Promise<CustomSkillDraft | { error: string }> {
  const skill = await getCustomSkill(input.skillId)
  if (!skill) return { error: `No custom skill "${input.skillId}" exists.` }

  const [{ anthropic }, { parseLLMJsonObject }, proofLessons] = await Promise.all([
    import('../../claude'),
    import('../../retry'),
    import('../store').then((m) => m.listProofLessons(8)).catch(() => [] as string[]),
  ])

  const system = `${skill.systemPrompt.replaceAll('${readerName}', readerName)}

Operating rules for this task (they bind regardless of what the playbook above says):
- Ground every recipient-specific claim in the context you are given. Never invent a fact about the recipient; if the context lacks a specific, leave it out rather than guessing.
- The draft is signed by ${readerName} and goes out under his name — write as him, not about him.

Return ONLY this JSON, nothing before or after:
{"subject": "<the subject line>", "body": "<the full email or message body, real line breaks between paragraphs>"}${
    proofLessons.length
      ? `\n\nStanding notes from the reader's reviews of past drafts — honor every one:\n${proofLessons.map((l) => `- ${l}`).join('\n')}`
      : ''
  }`

  const user = `${input.recipient ? `Recipient: ${input.recipient}\n` : ''}${
    input.goal ? `What this should accomplish: ${input.goal}\n` : ''
  }
Context gathered from the reader's workspace (ground every specific in this; invent nothing):
${input.context.trim() || '(no context supplied — keep the draft honest and minimal, and say plainly where specifics were unavailable)'}

Draft it now.`

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

  const parsed = parseLLMJsonObject<CustomSkillDraft>(text, { subject: '', body: text.trim() })
  return {
    subject: (parsed.subject || '').trim() || '(no subject)',
    body: (parsed.body || '').trim() || text.trim(),
  }
}
