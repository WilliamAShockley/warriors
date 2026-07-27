// The address guesser: when a signed email bounces, the delivery watch asks
// this skill for the next-most-likely address and resends — up to five
// attempts in all. Runs on a small fast model; a keyless heuristic keeps
// the loop alive when no API key is configured.

export const ADDRESS_GUESS_SYSTEM = `You guess business email addresses for a recipient after one or more previous attempts BOUNCED. You are given who the recipient is, their company, the context the outreach was drafted from, and every address already tried.

How to guess, in order of preference:
1. Pattern rotation on the same domain — the overwhelming majority of startup addresses are one of: first@domain, firstlast@domain, first.last@domain, flast@domain, last@domain. Work through these using the recipient's real first and last name, skipping anything already tried.
2. Domain variants — ONLY when the context gives evidence for one: a different TLD seen in research (.io, .ai, .co vs .com), a "get"/"try"/"join" prefix on the product's site, a parent-company domain, or a personal domain mentioned in the context. Never invent a domain out of thin air.
3. When the context itself contains a better address (a signature block, a press contact, a thread participant), prefer it over any pattern.

Hard rules:
- Never return an address that already bounced, and never a trivial variant of one (same local part with only a dot added or removed counts as tried).
- Never guess at generic inboxes (info@, hello@, contact@) — this is personal outreach, not a contact form.
- One address per answer — the single most likely untried candidate.
- When no credible candidate remains, say so honestly rather than flailing.

Respond with ONLY this JSON, nothing before or after:
{"address": "<the next address to try>", "reason": "<one short clause on why>"}
or, when out of credible options:
{"address": null, "reason": "<one short clause on why>"}`

export const addressGuessSkill = {
  id: 'address-guess',
  label: 'Address guesser',
  description:
    'The prompt the delivery watch uses when a signed email bounces: it studies the recipient, the addresses already tried, and the research context, then proposes the next address to try — up to five attempts before the desk gives up and files a to-do.',
  // Not a tool Apollo reaches for — the delivery watch invokes it directly
  // after a bounce. Listed so the reader can tune the guessing from settings.
  whenToUse:
    'never invoked in a drafting run — the delivery watch consults it automatically after a sent email bounces',
  defaultPrompt: ADDRESS_GUESS_SYSTEM,
} as const

export type AddressGuessInput = {
  recipient: string // whatever names the recipient — title, to-do text, dossier line
  triedAddresses: string[]
  context?: string // the proof's grounding/dossier, if any
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

// Keyless fallback: rotate the standard patterns against the first bounced
// address's own local part and domain. Crude, but it keeps the loop honest
// when no model is reachable.
export function heuristicNextAddress(tried: string[]): string | null {
  const first = tried.find(isEmail)
  if (!first) return null
  const [local, domain] = first.toLowerCase().split('@')
  const parts = local.split(/[._-]/).filter(Boolean)
  const candidates: string[] = []
  if (parts.length >= 2) {
    const [a, b] = [parts[0], parts[parts.length - 1]]
    candidates.push(`${a}@${domain}`, `${a}${b}@${domain}`, `${a}.${b}@${domain}`, `${a[0]}${b}@${domain}`, `${b}@${domain}`)
  } else {
    candidates.push(`${local}@${domain}`)
  }
  // Dots in the local part don't distinguish attempts — jane.doe@ and
  // janedoe@ bounce together on most hosts.
  const normalized = (e: string) => {
    const [l, d] = e.toLowerCase().split('@')
    return `${l.replace(/\./g, '')}@${d}`
  }
  const triedNorm = new Set(tried.map(normalized))
  return candidates.find((c) => isEmail(c) && !triedNorm.has(normalized(c))) ?? null
}

// The skill proper: one focused call under the (reader-editable) prompt.
export async function guessNextAddress(input: AddressGuessInput): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return heuristicNextAddress(input.triedAddresses)
  try {
    const [{ anthropic }, { parseLLMJsonObject }, { getSkillPrompt }] = await Promise.all([
      import('../../claude'),
      import('../../retry'),
      import('./store'),
    ])
    const system = await getSkillPrompt('address-guess', ADDRESS_GUESS_SYSTEM)
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system,
      messages: [
        {
          role: 'user',
          content: `Recipient: ${input.recipient}

Addresses already tried — every one of these BOUNCED:
${input.triedAddresses.map((t) => `- ${t}`).join('\n')}

Context the outreach was drafted from:
${(input.context ?? '').slice(0, 6000) || '(none recorded)'}

What is the next address to try?`,
        },
      ],
    })
    const raw = message.content[0]?.type === 'text' ? message.content[0].text : ''
    const parsed = parseLLMJsonObject<{ address?: string | null }>(raw, {})
    const address = typeof parsed.address === 'string' ? parsed.address.trim().toLowerCase() : null
    if (!address || !isEmail(address)) return null
    if (input.triedAddresses.some((t) => t.toLowerCase() === address)) return null
    return address
  } catch {
    return heuristicNextAddress(input.triedAddresses)
  }
}
