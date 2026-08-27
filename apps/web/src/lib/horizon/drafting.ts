import { anthropic } from '@/lib/claude'
import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import type { Draft, SequenceTouch } from './types'
import { assembleBody, parseDraftParts, DRAFT_PARTS_JSON_SCHEMA, type DraftParts } from './draft-schema'
import { runDraftChecks, failedChecks, type DraftCheck, type DraftCheckContext } from './draft-checks'

const DRAFT_MODEL = process.env.HORIZON_DRAFT_MODEL || 'claude-opus-5'

const VOICE_PROFILE_KEY = 'horizon.voiceProfile'

const DEFAULT_VOICE_PROFILE = `PLACEHOLDER VOICE PROFILE — replace me in Horizon settings.
Write like a busy investor emailing a founder peer: short sentences, no
corporate filler, one concrete observation about their company, one clear ask.
Never use "I hope this finds you well". Sign off as "D".`

export async function getVoiceProfile(): Promise<string> {
  const row = await db.setting.findUnique({ where: { key: VOICE_PROFILE_KEY } })
  return row?.value || DEFAULT_VOICE_PROFILE
}

export async function setVoiceProfile(value: string) {
  await db.setting.upsert({
    where: { key: VOICE_PROFILE_KEY },
    create: { key: VOICE_PROFILE_KEY, value },
    update: { value },
  })
}

/**
 * One structured drafting call. The response shape is enforced server-side via
 * output_config.format, so parsing can only fail if the API misbehaves — no
 * substring surgery on prose.
 */
async function generateParts(system: string, prompt: string): Promise<DraftParts> {
  const msg = await anthropic.messages.create({
    model: DRAFT_MODEL,
    max_tokens: 2048,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    output_config: { format: { type: 'json_schema', schema: DRAFT_PARTS_JSON_SCHEMA as unknown as Record<string, unknown> } },
    messages: [{ role: 'user', content: prompt }],
  })
  if (msg.stop_reason === 'refusal') throw new Error('draft generation refused by model')
  const text = msg.content.find((b) => b.type === 'text')?.text
  if (!text) throw new Error('draft generation returned no text block')
  const parts = parseDraftParts(JSON.parse(text))
  if (!parts) throw new Error('draft generation returned JSON that does not match the draft schema')
  return parts
}

export type DraftTouchInput = {
  voice: string
  messageStrategy?: string | null
  hypothesis?: string | null
  channel: 'email' | 'linkedin'
  touchIndex: number
  sequenceLength: number
  templateHint?: string
  /** Recipient identity — source of truth for the greeting checks. */
  personName: string
  company?: string | null
  /** Serialized enrichment/research shown to the model and used for grounding. */
  enrichmentText: string
  /** Formatted description of earlier touches, if any. */
  priorTouches?: string
}

export type StructuredDraftResult = {
  parts: DraftParts
  checks: DraftCheck[]
  checksPassed: boolean
  repaired: boolean
  subject?: string
  body: string
}

/**
 * Generate one touch: structured output → deterministic checks → one repair
 * pass with the failures fed back. Still-failing drafts come back flagged
 * (checksPassed: false), never dropped. Shared by the campaign drafting stage
 * and the OG diagnostic bench.
 */
export async function generateStructuredDraft(input: DraftTouchInput): Promise<StructuredDraftResult> {
  // Stable context lives in system (cached across a batch); per-touch
  // specifics go in the user message.
  const system = `You draft cold outreach for an investor. You return the draft decomposed into structured parts (greeting, paragraphs, closer, signoff, subject) — the final message is assembled from them in code, so never repeat the greeting or sign-off inside a paragraph.

VOICE PROFILE (follow it exactly — structure, phrasing, and its negative constraints):
${input.voice}

MESSAGE STRATEGY for this campaign:
${input.messageStrategy || '(none provided)'}

CAMPAIGN HYPOTHESIS: ${input.hypothesis || '(none)'}

Hard rules:
- Personalize only from the RECIPIENT data given. Every recipient-specific fact must appear in "personalization" with a verbatim sourceQuote copied from that data. Never invent facts.
- First email touch: subject line "Reaching Out - [Company] <> FirstMark"; exactly two paragraphs (one long intro/thesis block, one short ask block ending in a question); a one-line closer; signoff "Dez".
- Follow-up email touches: subject null (they thread on the first email); one paragraph of 1–2 sentences; never re-pitch.
- LinkedIn touches: subject null, under 500 characters total, conversational.
- Later touches reference earlier ones naturally (a nudge, then a breakup note).`

  const prompt = `Write touch ${input.touchIndex + 1} of ${input.sequenceLength} in the sequence.

CHANNEL: ${input.channel}${input.templateHint ? ` (template hint: ${input.templateHint})` : ''}

RECIPIENT (from enrichment data):
${input.enrichmentText}
${input.priorTouches ? `\nEARLIER TOUCHES ALREADY DRAFTED:\n${input.priorTouches}\n` : ''}`

  const ctx: DraftCheckContext = {
    channel: input.channel,
    touchIndex: input.touchIndex,
    personName: input.personName,
    company: input.company,
    enrichmentText: input.enrichmentText,
  }

  let parts = await generateParts(system, prompt)
  let checks = runDraftChecks(parts, ctx)
  let repaired = false

  const failures = failedChecks(checks)
  if (failures.length > 0) {
    // One repair pass: same request plus the specific failures. Still-failing
    // drafts are stored flagged for the operator, never silently passed.
    const repairPrompt = `${prompt}

Your previous draft failed these mechanical checks:
${failures.map((f) => `- [${f.id}] ${f.detail ?? 'failed'}`).join('\n')}

Previous draft (as structured parts):
${JSON.stringify(parts, null, 2)}

Fix every listed failure while keeping everything that already works. Return the full corrected structure.`
    try {
      const repairedParts = await generateParts(system, repairPrompt)
      const repairedChecks = runDraftChecks(repairedParts, ctx)
      // Keep the repair only if it's an improvement.
      if (failedChecks(repairedChecks).length <= failures.length) {
        parts = repairedParts
        checks = repairedChecks
        repaired = true
      }
    } catch {
      // Repair call failed — keep the original draft with its failures flagged.
    }
  }

  return {
    parts,
    checks,
    checksPassed: failedChecks(checks).length === 0,
    repaired,
    subject: input.channel === 'email' && parts.subject ? parts.subject : undefined,
    body: assembleBody(parts),
  }
}

/**
 * Generate every touch draft for one campaign member, persisting the check
 * evidence on each draft. Called from the advance job in batches; a member is
 * only marked `drafted` after all touches exist, so a crash mid-member just
 * re-drafts that member on the next run.
 */
export async function draftForMembership(membershipId: string): Promise<Draft[]> {
  const membership = await db.campaignMembership.findUnique({
    where: { id: membershipId },
    include: { person: true, campaign: true },
  })
  if (!membership) throw new Error(`membership ${membershipId} not found`)
  const { person, campaign } = membership
  const sequence = (campaign.sequence ?? []) as SequenceTouch[]
  const voice = await getVoiceProfile()

  const enrichment = person.enrichment ?? {
    name: person.name,
    company: person.currentCompany,
    role: person.currentRole,
  }
  const enrichmentText = JSON.stringify(enrichment, null, 2)

  const drafts: Draft[] = []
  for (let i = 0; i < sequence.length; i++) {
    const touch = sequence[i]
    const prior = drafts
      .map((d, j) => `Touch ${j + 1} (${d.channel}): ${d.subject ? d.subject + ' — ' : ''}${d.body}`)
      .join('\n\n')

    const result = await generateStructuredDraft({
      voice,
      messageStrategy: campaign.messageStrategy,
      hypothesis: campaign.hypothesis,
      channel: touch.channel,
      touchIndex: i,
      sequenceLength: sequence.length,
      templateHint: touch.template,
      personName: person.name,
      company: person.currentCompany,
      enrichmentText,
      priorTouches: prior || undefined,
    })

    drafts.push({
      touchIndex: i,
      channel: touch.channel,
      subject: result.subject,
      body: result.body,
      parts: result.parts,
      checks: result.checks,
      checksPassed: result.checksPassed,
      ...(result.repaired ? { repaired: true } : {}),
    })
  }

  await db.campaignMembership.update({
    where: { id: membershipId },
    data: { drafts: drafts as unknown as Prisma.InputJsonValue, state: 'drafted' },
  })
  return drafts
}
