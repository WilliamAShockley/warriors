import type { ResearchInput } from './types'

// The reader's own enrichment charge — filed 18 Aug 2026; change it only
// at his direction. Every engine on the Bench receives this identical
// text, so the comparison is search quality, not prompt drift.
export function buildCharge(input: ResearchInput): string {
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
