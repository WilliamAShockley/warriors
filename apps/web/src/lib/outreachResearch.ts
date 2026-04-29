import { anthropic } from './claude'
import { db } from './db'

type Founder = {
  name: string
  role: string
  emailGuesses: string[]
}

type OutreachData = {
  summary: string
  founders: Founder[]
  fundingStage: string
}

function guessEmails(name: string, domain: string): string[] {
  const parts = name.toLowerCase().trim().split(/\s+/)
  if (parts.length < 2) {
    return [`${parts[0]}@${domain}`]
  }
  const [first, ...rest] = parts
  const last = rest[rest.length - 1]
  return [
    `${first}@${domain}`,
    `${first}.${last}@${domain}`,
    `${first[0]}${last}@${domain}`,
    `${first[0]}.${last}@${domain}`,
  ]
}

function companyToDomain(company: string): string {
  return company
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '') + '.com'
}

export async function generateAndSaveOutreachBrief(targetId: string, force = false): Promise<OutreachData | null> {
  const target = await db.target.findUnique({
    where: { id: targetId },
    include: { outreachBrief: true },
  })
  if (!target) return null
  if (target.outreachBrief && !force) {
    return {
      summary: target.outreachBrief.summary,
      founders: JSON.parse(target.outreachBrief.founders),
      fundingStage: target.outreachBrief.fundingStage,
    }
  }

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `You are a VC analyst preparing outreach intel on **${target.company}**${target.notes ? ` (context: ${target.notes})` : ''}.

Return a JSON object with exactly these fields:
{
  "summary": "2-3 sentence description of what the company does",
  "founders": [
    { "name": "Full Name", "role": "Co-founder & CEO" }
  ],
  "fundingStage": "e.g. Seed, Series A, Series B, Bootstrapped, Unknown"
}

Rules:
- Only include confirmed co-founders or key founding team members (1-4 people max)
- If you are unsure about founders, return an empty array
- Be specific and factual; if something is unknown, say "Unknown"
- Return ONLY valid JSON, no markdown, no explanation`,
    }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  if (!raw) return null

  let parsed: { summary: string; founders: { name: string; role: string }[]; fundingStage: string }
  try {
    parsed = JSON.parse(raw)
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      return null
    }
  }

  const domain = companyToDomain(target.company)
  const foundersWithEmails: Founder[] = (parsed.founders ?? []).map((f) => ({
    name: f.name,
    role: f.role,
    emailGuesses: guessEmails(f.name, domain),
  }))

  const data: OutreachData = {
    summary: parsed.summary ?? '',
    founders: foundersWithEmails,
    fundingStage: parsed.fundingStage ?? 'Unknown',
  }

  await db.outreachBrief.upsert({
    where: { targetId },
    create: {
      targetId,
      summary: data.summary,
      founders: JSON.stringify(data.founders),
      fundingStage: data.fundingStage,
    },
    update: {
      summary: data.summary,
      founders: JSON.stringify(data.founders),
      fundingStage: data.fundingStage,
    },
  })

  return data
}
