import { anthropic } from '../claude'
import { parseLLMJsonObject } from '../retry'
import { listDbTheses, type ThesisRecord } from '../theses'
import { theses as seedTheses } from '../data'

// Dez's Context: what the reader actually thinks, handed to the drafting
// skill as its own labeled block so a cold email's thesis line and hook
// come from his current view — not the voice profile's dated boilerplate.
// Two shelves feed it: the standing notes he files by hand in Settings
// (all of them, every cold email), and whichever of his active theses
// bear on the company at hand.

const MATCH_MODEL = 'claude-haiku-4-5-20251001'

const seedRecords = (): ThesisRecord[] =>
  seedTheses.map((t: any) => ({
    slug: t.slug,
    name: t.name,
    chip: t.chip ?? '',
    stance: t.stance,
    summary: Array.isArray(t.summary) ? t.summary.join('\n\n') : String(t.summary ?? ''),
    charter: t.charter ?? '',
    createdAt: '',
  }))

const renderThesis = (t: ThesisRecord) =>
  `THESIS — ${t.name}\nStance: ${t.stance}\n${t.summary}`

// The whole block: the Settings shelf first (his words, verbatim, always),
// then the matched theses. Best-effort throughout — an empty shelf and no
// matching thesis return '' and drafting proceeds without the block.
export async function readerViewFor(company: string, brief: string): Promise<string> {
  const [notes, theses] = await Promise.all([
    import('../reader-context')
      .then((m) => m.contextNotesBlock())
      .catch(() => ''),
    matchedTheses(company, brief),
  ])
  return [
    notes ? `STANDING NOTES (filed by the reader himself, in Settings → Context):\n${notes}` : '',
    theses,
  ]
    .filter(Boolean)
    .join('\n\n')
}

// Which theses bear on this company? Answered by a small model against the
// research brief; zero, one, or two of them, never a stretch. Best-effort:
// no theses, no key, or a failed call all return ''.
async function matchedTheses(company: string, brief: string): Promise<string> {
  try {
    const db = await listDbTheses()
    const theses = db.live ? db.theses : seedRecords()
    if (theses.length === 0 || !process.env.ANTHROPIC_API_KEY) return ''
    if (theses.length === 1) return renderThesis(theses[0])

    const roster = theses
      .map((t) => `- ${t.slug}: ${t.name} — ${t.stance.slice(0, 200)}`)
      .join('\n')
    const message = await anthropic.messages.create({
      model: MATCH_MODEL,
      max_tokens: 120,
      messages: [
        {
          role: 'user',
          content: `An investor's research desk just briefed on a company. Which of his active theses genuinely bear on it?

COMPANY: ${company}

THE BRIEF:
${brief.slice(0, 4000)}

HIS ACTIVE THESES:
${roster}

Answer with JSON only: {"slugs": ["<0-2 slugs whose thesis genuinely covers this company's space>"]}
Only real fits — an empty list is the right answer for a company outside every thesis.`,
        },
      ],
    })
    const raw = message.content[0]?.type === 'text' ? message.content[0].text : ''
    const parsed = parseLLMJsonObject<{ slugs?: string[] }>(raw, {})
    const picked = (parsed.slugs ?? [])
      .map((s) => theses.find((t) => t.slug === s))
      .filter(Boolean)
      .slice(0, 2) as ThesisRecord[]
    return picked.map(renderThesis).join('\n\n')
  } catch {
    return ''
  }
}
