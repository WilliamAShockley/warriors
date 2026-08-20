import type { ResearchInput } from './types'

// The charges — what each engine is asked, as TEMPLATES the reader can
// amend in the Bench. Tokens fill in from the row at run time. A
// BenchCharge row overrides the house default per engine, per workspace.

// The reader's own enrichment charge — filed 18 Aug 2026; the house
// default for OpenAI, Exa, and Parallel.
export const FULL_CHARGE_TEMPLATE = `Refresh a company-context entry with a quick web check (funding, product,
leadership changes — anything material and current). Ask yourself these questions. Did the company recently announce a fundraise? Did the company recently share some sort of blog or product announcement? Did the company recently come out of stealth? What is the main problem the company is trying to solve? What is the company's main product? Do they have any customers listed on their website? What broader investment theme does this company sit within? For Founder first name, we are specifically focused on the CEO

 We define recent as in the past 3 months from the date of this search. The date of this search: {date}. Keep what still holds;
correct what changed; add what's new. Be terse and factual.

CURRENT ENTRY:
Company: {company}
Founder first name: {founderFirst}
Founder full name: {founderFull}
Website: {website}
Context: {context}

IDENTITY ANCHORS — read before searching. Company names collide; several unrelated companies may share this one. Whatever the entry already knows — the website, the founder, the existing context — pins WHICH company this is: every search result you use must be about THAT company, and anything about a same-name company at a different domain or with different founders must be DISCARDED, however prominent it is. If the entry has no anchors and your searches reveal multiple distinct companies under this name, do NOT guess: set context to a one-line note naming the candidates (e.g. "AMBIGUOUS — could be X at a.com or Y at b.com; add the website or founder to the entry to anchor the research") and leave founder fields null.

End your reply with ONLY this JSON (no prose after it):
{"founderFirstName": "<or null>", "founderFullName": "<or null>",
 "context": "<the refreshed running brief, 3-8 sentences>",
 "websiteUrl": "<https url or null>"}`

// The dead-simple charge — the reader's call, 19 Aug 2026, after the full
// charge sent Anthropic's engine on an exhaustive search spree. The house
// default for the Anthropic engine (Bench and Register alike).
export const SIMPLE_CHARGE_TEMPLATE = `Quick web check on one company. Today is {date}.

Company: {company}
CEO / founder: {founderFull}
Website: {website}
What we already know: {context}

Search the web — one or two searches, no more — then answer plainly:
1. What does the company do?
2. Who is the CEO (first and full name)?
3. Any news from the past 3 months — funding, launches, big announcements?

If other companies share this name, only trust results matching the website or founder above. If you cannot tell which company this is, write "AMBIGUOUS —" plus the candidates as the context and leave the founder fields null.

Keep it short. End your reply with ONLY this JSON (no prose after it):
{"founderFirstName": "<or null>", "founderFullName": "<or null>",
 "context": "<3-6 factual sentences>",
 "websiteUrl": "<https url or null>"}`

export const defaultTemplateFor = (providerId: string): string =>
  providerId === 'anthropic' ? SIMPLE_CHARGE_TEMPLATE : FULL_CHARGE_TEMPLATE

export function renderChargeTemplate(template: string, input: ResearchInput): string {
  const date = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
  return template
    .replaceAll('{date}', date)
    .replaceAll('{company}', input.name)
    .replaceAll('{founderFirst}', input.founderFirstName ?? '(unknown)')
    .replaceAll('{founderFull}', input.founderFullName ?? input.founderFirstName ?? '(unknown)')
    .replaceAll('{website}', input.websiteUrl ?? '(unknown)')
    .replaceAll('{context}', input.context ?? '(none yet)')
}

// The template an engine runs today: the reader's amendment if one is
// filed, else the house default. Workspace scoping rides on the db layer.
export async function chargeTemplateFor(providerId: string): Promise<string> {
  try {
    if (process.env.DATABASE_URL) {
      const { db } = await import('../db')
      const row = await db.benchCharge.findFirst({ where: { id: providerId } })
      if (row?.charge?.trim()) return row.charge
    }
  } catch {}
  return defaultTemplateFor(providerId)
}

export async function chargeFor(providerId: string, input: ResearchInput): Promise<string> {
  return renderChargeTemplate(await chargeTemplateFor(providerId), input)
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
