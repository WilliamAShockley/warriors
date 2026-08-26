// Deterministic checks over a structured draft. Pure functions, no LLM calls:
// every rule here is mechanically verifiable, mirroring the voice profile's
// hard constraints. The registry is modular on purpose — passing all checks is
// the evidence trail that eventually backs auto-send.

import { assembleBody, type DraftParts } from './draft-schema'

export type DraftCheck = { id: string; pass: boolean; detail?: string }

export type DraftCheckContext = {
  channel: 'email' | 'linkedin'
  touchIndex: number
  /** Full name from the Person record — source of truth for the greeting. */
  personName: string
  company?: string | null
  /** Serialized enrichment data shown to the model, for grounding checks. */
  enrichmentText: string
}

const FIRM_NAME = 'FirstMark'

// Phrases the voice profile bans outright. Checked case-insensitively against
// subject + assembled body. Note: "circle back" and "hope this note finds you
// well" are deliberately NOT here — they are part of the voice.
const BANNED_PHRASES = [
  'dear ',
  'best regards',
  'sincerely',
  'email finds you well', // it's always "note", never "email"
  'per my last email',
  'gentle reminder',
  'bumping this',
  'at your earliest convenience',
  'synergies',
  "i'd welcome the opportunity",
  'are you the right person',
  'calendly',
  'no worries if not',
  'feel free to ignore',
]

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length

const countSentences = (s: string) => (s.match(/[.!?](\s|$)/g) ?? []).length || (s.trim() ? 1 : 0)

export function runDraftChecks(parts: DraftParts, ctx: DraftCheckContext): DraftCheck[] {
  const results: DraftCheck[] = []
  const add = (id: string, pass: boolean, detail?: string) =>
    results.push(pass ? { id, pass } : { id, pass, detail })

  const body = assembleBody(parts)
  const firstTouch = ctx.touchIndex === 0
  const firstName = ctx.personName.trim().split(/\s+/)[0] ?? ''

  // ── greeting ────────────────────────────────────────────────────
  const greetingMatch = parts.greeting.match(/^(?:(?:Hey|Hi) )?(\S+) -$/)
  add(
    'greeting-format',
    !!greetingMatch,
    `greeting "${parts.greeting}" must be "Hey [First] -", "Hi [First] -", or "[First] -" (spaced hyphen, no comma)`
  )
  if (greetingMatch && firstName) {
    add(
      'greeting-name',
      greetingMatch[1].toLowerCase() === firstName.toLowerCase(),
      `greeting says "${greetingMatch[1]}" but the person record says "${firstName}"`
    )
  }

  // ── subject ─────────────────────────────────────────────────────
  if (ctx.channel === 'email' && firstTouch) {
    const s = parts.subject ?? ''
    add(
      'subject-format',
      s.startsWith('Reaching Out - ') && s.includes(' <> ') && s.includes(FIRM_NAME),
      `subject "${s}" must be "Reaching Out - [Company] <> ${FIRM_NAME}" (order may flip)`
    )
    if (ctx.company) {
      add(
        'subject-company',
        s.toLowerCase().includes(ctx.company.toLowerCase()),
        `subject "${s}" does not mention the company "${ctx.company}"`
      )
    }
  } else {
    add(
      'no-subject',
      parts.subject === null,
      ctx.channel === 'linkedin'
        ? 'LinkedIn messages must not have a subject'
        : 'follow-up emails thread on the first touch — subject must be null'
    )
  }

  // ── sign-off ────────────────────────────────────────────────────
  add(
    'signoff',
    parts.signoff === null ? !firstTouch || ctx.channel === 'linkedin' : parts.signoff === 'Dez',
    `sign-off must be exactly "Dez" (or omitted on follow-ups); got "${parts.signoff}"`
  )

  // ── structure ───────────────────────────────────────────────────
  if (ctx.channel === 'email' && firstTouch) {
    add(
      'cold-structure',
      parts.paragraphs.length === 2,
      `cold touch-1 is exactly two paragraphs (intro/thesis block + ask block); got ${parts.paragraphs.length}`
    )
    const introWords = countWords(parts.paragraphs[0] ?? '')
    add(
      'cold-intro-length',
      introWords >= 100 && introWords <= 180,
      `paragraph one is a single 100–180 word block; got ${introWords} words`
    )
    // The closer is optional (canonical sent mail sometimes goes straight from
    // the ask to "Dez"), but when present it must stay a one-liner.
    add(
      'closer-brevity',
      parts.closer === null || (parts.closer.length <= 120 && !parts.closer.includes('\n')),
      `the closer is a single short line ("Lmk what you think. Hope to hear from you soon!"); got ${parts.closer?.length} chars`
    )
  }
  if (ctx.channel === 'email' && !firstTouch) {
    const sentences = parts.paragraphs.reduce((n, p) => n + countSentences(p), 0)
    add(
      'followup-brevity',
      parts.paragraphs.length === 1 && sentences <= 2,
      `follow-ups are one paragraph of 1–2 sentences, never a re-pitch; got ${parts.paragraphs.length} paragraph(s), ${sentences} sentence(s)`
    )
  }
  if (ctx.channel === 'linkedin') {
    add('linkedin-length', body.length <= 500, `LinkedIn message must be under 500 characters; got ${body.length}`)
  }

  // ── the ask ─────────────────────────────────────────────────────
  if (firstTouch) {
    const askBlock = parts.paragraphs[parts.paragraphs.length - 1] ?? ''
    add('ask-question', askBlock.includes('?'), 'the ask paragraph must contain a direct question')
  }

  // ── banned strings & formatting tells ───────────────────────────
  const haystack = `${parts.subject ?? ''}\n${body}`.toLowerCase()
  const hits = BANNED_PHRASES.filter((p) => haystack.includes(p))
  add('banned-phrases', hits.length === 0, `banned phrase(s): ${hits.map((h) => `"${h.trim()}"`).join(', ')}`)

  add(
    'no-formal-signoff',
    !/\b(best|thanks|cheers|regards|warmly)[,!]?\s*$/im.test(body.replace(/\n\nDez$/, '')),
    'the only sign-off is a bare "Dez" — no "Best,"/"Thanks,"/"Cheers,"'
  )
  add('no-em-dash', !body.includes('—') && !(parts.subject ?? '').includes('—'), 'use spaced hyphens " - ", never em dashes')
  add('no-semicolon', !body.includes(';'), 'the voice never uses semicolons')
  add(
    'no-minute-quantifier',
    !/\b\d+[- ]?minutes?\b/i.test(body),
    'never quantify meeting length — it\'s "quick call" or "coffee", not "30 minutes"'
  )
  add(
    'no-placeholders',
    !/\{\{|\[(?:first|name|company)\b/i.test(haystack),
    'draft contains unfilled template placeholders'
  )
  add(
    'no-bullets',
    parts.paragraphs.every((p) => !p.includes('\n') && !p.includes('•')),
    'paragraphs must be prose blocks — no bullets or internal line breaks'
  )

  // ── grounding ───────────────────────────────────────────────────
  if (firstTouch) {
    add(
      'personalization-present',
      parts.personalization.length >= 1,
      'touch 1 must include at least one recipient-specific fact, cited from enrichment'
    )
  }
  const enrichment = normalize(ctx.enrichmentText)
  const ungrounded = parts.personalization.filter((c) => !enrichment.includes(normalize(c.sourceQuote)))
  add(
    'personalization-grounded',
    ungrounded.length === 0,
    `claims not found in enrichment data: ${ungrounded.map((c) => `"${c.claim}"`).join('; ')}`
  )

  return results
}

export function failedChecks(checks: DraftCheck[]): DraftCheck[] {
  return checks.filter((c) => !c.pass)
}

/**
 * Every check id the registry can emit, in registry order — derived by running
 * the checks against dummy drafts in each context, so it can never drift from
 * runDraftChecks. Used by the OG bench's column picker.
 */
export function allCheckIds(): string[] {
  const dummy = {
    subject: 'x',
    greeting: 'Hey X -', // must parse so greeting-name is emitted

    paragraphs: ['x'],
    closer: null,
    signoff: null,
    personalization: [],
  }
  const contexts: DraftCheckContext[] = [
    { channel: 'email', touchIndex: 0, personName: 'X Y', company: 'X', enrichmentText: '' },
    { channel: 'email', touchIndex: 1, personName: 'X Y', company: 'X', enrichmentText: '' },
    { channel: 'linkedin', touchIndex: 0, personName: 'X Y', company: 'X', enrichmentText: '' },
  ]
  const ids: string[] = []
  for (const ctx of contexts) {
    for (const c of runDraftChecks(dummy, ctx)) {
      if (!ids.includes(c.id)) ids.push(c.id)
    }
  }
  return ids
}
