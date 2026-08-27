// Structured draft output. The model returns the email decomposed into parts
// (enforced server-side via output_config.format), draft-checks validates each
// part, and assembleBody() builds the final body deterministically — the model
// never controls the assembled layout.

export type PersonalizationClaim = {
  /** A recipient-specific fact used in the draft, in the draft's own words. */
  claim: string
  /** Verbatim excerpt from the enrichment data that supports the claim. */
  sourceQuote: string
}

export type DraftParts = {
  /** Email touch 1 only; null for LinkedIn and threaded follow-ups. */
  subject: string | null
  /** e.g. "Hey Jens -" — fused into the first paragraph at assembly time. */
  greeting: string
  /** Body paragraphs, excluding greeting, closer, and sign-off. */
  paragraphs: string[]
  /** One-line forward-motion closer ("Lmk what you think. ..."), or null. */
  closer: string | null
  /** "Dez", or null when the touch ships without a sign-off. */
  signoff: string | null
  personalization: PersonalizationClaim[]
}

/** JSON schema handed to the API as output_config.format — keep in sync with DraftParts. */
export const DRAFT_PARTS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['subject', 'greeting', 'paragraphs', 'closer', 'signoff', 'personalization'],
  properties: {
    subject: {
      type: ['string', 'null'],
      description: 'Subject line. Only for the first email touch; null for LinkedIn messages and threaded follow-up emails.',
    },
    greeting: {
      type: 'string',
      description: 'The greeting exactly as it should appear, e.g. "Hey Jens -". It will be fused onto the start of the first paragraph.',
    },
    paragraphs: {
      type: 'array',
      items: { type: 'string' },
      // NB: the API's structured-output schemas reject minItems/maxItems —
      // paragraph counts are enforced by draft-checks instead.
      description: 'Body paragraphs in order (at least one), WITHOUT the greeting, closer, or sign-off. No newlines inside a paragraph.',
    },
    closer: {
      type: ['string', 'null'],
      description: 'One-line forward-motion closer before the sign-off, e.g. "Lmk what you think. Hope to hear from you soon!". Null if none.',
    },
    signoff: {
      type: ['string', 'null'],
      description: 'The sign-off name alone, or null when the message ships without one.',
    },
    personalization: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim', 'sourceQuote'],
        properties: {
          claim: { type: 'string', description: 'A recipient-specific fact stated or implied in the draft.' },
          sourceQuote: { type: 'string', description: 'Verbatim excerpt from the RECIPIENT enrichment data that supports the claim. Copy it exactly.' },
        },
      },
      description: 'Every recipient-specific fact used in the draft, each backed by a verbatim quote from the enrichment data. Facts without a source must not appear in the draft.',
    },
  },
} as const

export function parseDraftParts(value: unknown): DraftParts | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (typeof v.greeting !== 'string') return null
  if (!Array.isArray(v.paragraphs) || v.paragraphs.some((p) => typeof p !== 'string')) return null
  return {
    subject: typeof v.subject === 'string' ? v.subject : null,
    greeting: v.greeting,
    paragraphs: v.paragraphs as string[],
    closer: typeof v.closer === 'string' ? v.closer : null,
    signoff: typeof v.signoff === 'string' ? v.signoff : null,
    personalization: Array.isArray(v.personalization)
      ? (v.personalization as unknown[]).flatMap((c) => {
          const o = c as Record<string, unknown>
          return typeof o?.claim === 'string' && typeof o?.sourceQuote === 'string'
            ? [{ claim: o.claim, sourceQuote: o.sourceQuote }]
            : []
        })
      : [],
  }
}

/**
 * Deterministic assembly. The greeting fuses into the first paragraph (the
 * voice never puts it on its own line); closer and sign-off get their own.
 */
export function assembleBody(parts: DraftParts): string {
  const [first, ...rest] = parts.paragraphs
  const blocks = [
    [parts.greeting, first].filter(Boolean).join(' ').trim(),
    ...rest,
  ]
  if (parts.closer) blocks.push(parts.closer)
  if (parts.signoff) blocks.push(parts.signoff)
  return blocks.filter((b) => b.trim().length > 0).join('\n\n')
}
