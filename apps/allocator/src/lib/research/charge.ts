import type { ResearchInput } from './types'

// One dispatch for both sheets: the company charge (the reader's verbatim
// enrichment prompt) or the person charge. Every engine receives the
// identical text for its kind, so the comparison stays search quality,
// not prompt drift.
export function buildCharge(input: ResearchInput): string {
  return input.kind === 'person' ? buildPersonCharge(input) : buildCompanyCharge(input)
}

// The reader's own enrichment charge — filed 18 Aug 2026; change it only
// at his direction.
function buildCompanyCharge(input: ResearchInput): string {
  const date = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  return `Refresh a company-context entry with a quick web check (funding, product,
leadership changes — anything material and current). Ask yourself these questions. Did the company recently announce a fundraise? Did the company recently share some sort of blog or product announcement? Did the company recently come out of stealth? What is the main problem the company is trying to solve? What is the company's main product? Do they have any customers listed on their website? What broader investment theme does this company sit within? For Founder first name, we are specifically focused on the CEO

 We define recent as in the past 3 months from the date of this search. The date of this search: ${date}. Keep what still holds;
correct what changed; add what's new. Be terse and factual.

CURRENT ENTRY:
Company: ${input.name}
Founder first name: ${input.founderFirstName ?? '(unknown)'}
Founder full name: ${input.founderFullName ?? '(unknown)'}
Website: ${input.websiteUrl ?? '(unknown)'}
Context: ${input.context ?? '(none yet)'}

IDENTITY ANCHORS — read before searching. Company names collide; several unrelated companies may share this one. Whatever the entry already knows — the website, the founder, the existing context — pins WHICH company this is: every search result you use must be about THAT company, and anything about a same-name company at a different domain or with different founders must be DISCARDED, however prominent it is. If the entry has no anchors and your searches reveal multiple distinct companies under this name, do NOT guess: set context to a one-line note naming the candidates (e.g. "AMBIGUOUS — could be X at a.com or Y at b.com; add the website or founder to the entry to anchor the research") and leave founder fields null.

End your reply with ONLY this JSON (no prose after it):
{"founderFirstName": "<or null>", "founderFullName": "<or null>",
 "context": "<the refreshed running brief, 3-8 sentences>",
 "websiteUrl": "<https url or null>"}`
}

// The People sheet's charge. Deliberately reuses the company contract's
// JSON keys (founderFirstName/founderFullName/context/websiteUrl) plus
// guessedEmail, so all four engines, the parser, and the cells share one
// shape: the founder fields carry the person's own name, context the
// background brief, websiteUrl their LinkedIn.
function buildPersonCharge(input: ResearchInput): string {
  const date = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  return `Research one person's professional background with a quick web check.
The date of this search: ${date}.

THE PERSON:
Full name: ${input.name?.trim() || '(unknown)'}
Company: ${input.company ?? '(unknown)'}
LinkedIn: ${input.linkedinUrl ?? '(unknown)'}

Ask yourself these questions. What is their current role and company? What did
they do before — prior roles, companies, anything they founded? Where did they
study? Any notable work, writing, talks, or investments? Summarize the answers
as a terse, factual professional-background brief, 3-8 sentences.

Then make your best guess at their work email: prefer a published address;
otherwise find the company's email pattern from public sources (e.g.
jane@acme.com, j.smith@acme.com) and apply it to this person's name and the
company's domain. If there is no reasonable basis for a guess, use null.

IDENTITY ANCHORS — read before searching. Names collide; several unrelated
people may share this one. Whatever is known above — the company, the LinkedIn
URL — pins WHICH person this is: every search result you use must be about
THAT person, and anything about a same-name person at a different company must
be DISCARDED, however prominent it is. If the anchors are too thin and your
searches reveal multiple distinct candidates, do NOT guess: set context to a
one-line note naming the candidates (e.g. "AMBIGUOUS — could be X at A or Y at
B; add the company or LinkedIn to anchor the research") and leave every other
field null.

End your reply with ONLY this JSON (no prose after it):
{"founderFirstName": "<the person's first name, or null>",
 "founderFullName": "<the person's full name, or null>",
 "context": "<the professional-background brief, 3-8 sentences>",
 "websiteUrl": "<their LinkedIn profile https URL, or null>",
 "guessedEmail": "<the best-guess work email, or null>"}`
}

// The right schema for the input's kind, for engines that take one (Parallel).
export const outputSchemaFor = (input: ResearchInput) =>
  input.kind === 'person' ? PERSON_OUTPUT_SCHEMA : OUTPUT_SCHEMA

// The same contract as a JSON Schema, for engines that take one (Parallel).
export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    founderFirstName: {
      type: ['string', 'null'],
      description: "The CEO's first name, or null if unknown",
    },
    founderFullName: {
      type: ['string', 'null'],
      description: "The CEO's full name, or null if unknown",
    },
    context: {
      type: 'string',
      description: 'The refreshed running brief, 3-8 terse factual sentences',
    },
    websiteUrl: {
      type: ['string', 'null'],
      description: "The company's homepage as an https URL, or null",
    },
  },
  required: ['founderFirstName', 'founderFullName', 'context', 'websiteUrl'],
  additionalProperties: false,
} as const

// The person contract as a JSON Schema — same keys, person semantics.
export const PERSON_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    founderFirstName: {
      type: ['string', 'null'],
      description: "The person's first name, or null if unknown",
    },
    founderFullName: {
      type: ['string', 'null'],
      description: "The person's full name, or null if unknown",
    },
    context: {
      type: 'string',
      description: 'The professional-background brief, 3-8 terse factual sentences',
    },
    websiteUrl: {
      type: ['string', 'null'],
      description: "The person's LinkedIn profile as an https URL, or null",
    },
    guessedEmail: {
      type: ['string', 'null'],
      description:
        "Best-guess work email — a published address, or the company's email pattern applied to the person's name; null if there is no basis",
    },
  },
  required: ['founderFirstName', 'founderFullName', 'context', 'websiteUrl', 'guessedEmail'],
  additionalProperties: false,
} as const
