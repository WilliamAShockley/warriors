import { anthropic } from './claude'
import { parseLLMJsonObject } from './retry'

export type ThesisRecord = {
  slug: string
  name: string
  chip: string
  stance: string
  summary: string
  charter: string
  createdAt: string
}

const hasDb = () => Boolean(process.env.DATABASE_URL)

async function getDb() {
  const { db } = await import('./db')
  return db
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'thesis'

const toRecord = (r: any): ThesisRecord => ({
  slug: r.slug,
  name: r.name,
  chip: r.chip,
  stance: r.stance,
  summary: r.summary,
  charter: r.charter,
  createdAt: r.createdAt.toISOString().slice(0, 10),
})

export async function listDbTheses(): Promise<{ live: boolean; theses: ThesisRecord[] }> {
  if (!hasDb()) return { live: false, theses: [] }
  try {
    const db = await getDb()
    const rows = await db.researchThesis.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'asc' },
    })
    return { live: true, theses: rows.map(toRecord) }
  } catch {
    return { live: false, theses: [] }
  }
}

export async function getDbThesis(slug: string): Promise<ThesisRecord | null> {
  if (!hasDb()) return null
  try {
    const db = await getDb()
    const row = await db.researchThesis.findUnique({ where: { slug } })
    return row && row.status === 'active' ? toRecord(row) : null
  } catch {
    return null
  }
}

export async function createThesis(input: {
  name: string
  chip: string
  stance: string
  summary: string
  charter: string
}): Promise<ThesisRecord | null> {
  if (!hasDb()) return null
  try {
    const db = await getDb()
    let slug = slugify(input.name)
    if (await db.researchThesis.findUnique({ where: { slug } })) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`
    }
    const row = await db.researchThesis.create({ data: { ...input, slug } })
    return toRecord(row)
  } catch {
    return null
  }
}

export async function retireThesis(slug: string): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    await db.researchThesis.update({ where: { slug }, data: { status: 'retired' } })
    return true
  } catch {
    return false
  }
}

// ————————————————————————————————— The intake interview

export type InterviewTurn = { role: 'desk' | 'reader'; text: string }
export type InterviewResult =
  | { done: false; question: string }
  | { done: true; thesis: { name: string; chip: string; stance: string; summary: string; charter: string } }

// Canned path for the zero-key demo — same shape, fixed questions.
const MOCK_QUESTIONS = [
  'What draws you to this now — what changed in the world that makes it timely?',
  'Where do you believe the market consensus is wrong, and who loses if you are right?',
  'What would you need to believe — or see — to write a first check against this?',
]

export async function interviewTurn(turns: InterviewTurn[]): Promise<InterviewResult> {
  const readerTurns = turns.filter((t) => t.role === 'reader')

  if (!process.env.ANTHROPIC_API_KEY) {
    if (readerTurns.length <= MOCK_QUESTIONS.length) {
      return { done: false, question: MOCK_QUESTIONS[readerTurns.length - 1] }
    }
    const name = readerTurns[0]?.text.slice(0, 60) || 'Untitled thesis'
    return {
      done: true,
      thesis: {
        name,
        chip: name.split(/\s+/).slice(0, 3).join(' '),
        stance: readerTurns[1]?.text.slice(0, 200) || 'A stance to be sharpened.',
        summary: readerTurns.map((t) => t.text).join('\n\n'),
        charter: `Track developments in ${name}. Surface what changes the reader's stated view.`,
      },
    }
  }

  const transcript = turns
    .map((t) => `${t.role === 'desk' ? 'DESK' : 'READER'}: ${t.text}`)
    .join('\n')

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1200,
    messages: [
      {
        role: 'user',
        content: `You are the research desk of "The Allocator", a private editorial brief for an alternative-asset investor. The reader wants to establish a new research thesis. Your job is an intake interview: understand their objective well enough to write the thesis charter.

Rules:
- Ask ONE question at a time. Sharp, specific, editorial in tone — the kind a good analyst asks a partner. No preamble, no restating their answer back.
- Build on what they have said; never ask something they already answered.
- After the reader has answered 3 questions (4 if their answers are thin), stop asking and produce the charter.
- The charter is the standing research prompt: what to track, which sources matter, what would confirm or kill the thesis, and what the desk should surface in the daily brief.

The transcript so far (the reader's first message names the theme):
${transcript}

Respond with JSON only, one of:
{"done": false, "question": "<your next single question>"}
{"done": true, "thesis": {"name": "<thesis name, title case, max 6 words>", "chip": "<2-3 word small-caps label>", "stance": "<one-sentence stance in the reader's voice, sharpened>", "summary": "<two short paragraphs synthesizing their view — precise, financially literate>", "charter": "<the standing research prompt, 3-6 sentences, second person to the desk>"}}`,
      },
    ],
  })
  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const parsed = parseLLMJsonObject<InterviewResult>(text, {
    done: false,
    question: 'Say a little more about what you are actually trying to decide.',
  })
  return parsed
}
