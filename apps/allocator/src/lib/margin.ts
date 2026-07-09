import { anthropic } from './claude'

export type MarginRecord = {
  id: string
  text: string
  reply: string | null
  when: string
}

const TZ = process.env.APP_TIMEZONE ?? 'America/New_York'
const hasDb = () => Boolean(process.env.DATABASE_URL)

function whenLabel(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

async function getDb() {
  const { db } = await import('./db')
  return db
}

export async function listMargin(): Promise<{ live: boolean; entries: MarginRecord[] }> {
  if (!hasDb()) return { live: false, entries: [] }
  try {
    const db = await getDb()
    const rows = await db.marginEntry.findMany({ orderBy: { createdAt: 'desc' }, take: 30 })
    return {
      live: true,
      entries: rows.map((r) => ({ id: r.id, text: r.text, reply: r.reply, when: whenLabel(r.createdAt) })),
    }
  } catch {
    return { live: false, entries: [] }
  }
}

// The desk's inline reply — a considered aside, not a chat turn.
async function draftReply(text: string, priorTexts: string[]): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `You are the analyst's desk behind "The Allocator", a private editorial brief for an alternative-asset investor. The reader thinks aloud in the margin; you reply in the margin — one considered aside, not a conversation. Voice: precise, financially literate, quietly witty. No emoji, no exclamation marks, no bullet points, no "great question". Under 110 words. Sharpen their thought: name the mechanism, the risk they are skirting, or the question they should be asking. If they filed a fact worth retaining, restate its core crisply so it can be recited later.

Recent margin entries for context (oldest first):
${priorTexts.length ? priorTexts.map((t) => `- ${t}`).join('\n') : '- (none)'}

The reader just wrote:
"${text}"

Reply with the aside only.`,
        },
      ],
    })
    const content = message.content[0]
    return content.type === 'text' ? content.text.trim() : null
  } catch {
    return null
  }
}

export async function createMargin(text: string): Promise<MarginRecord | null> {
  if (!hasDb()) {
    // Mock mode: no persistence, but still show the shape of the experience.
    const reply = await draftReply(text, [])
    return { id: `local-${text.length}`, text, reply, when: 'Just now' }
  }
  try {
    const db = await getDb()
    const prior = await db.marginEntry.findMany({ orderBy: { createdAt: 'desc' }, take: 5 })
    const row = await db.marginEntry.create({ data: { text } })
    const reply = await draftReply(text, prior.map((p) => p.text).reverse())
    const updated = reply
      ? await db.marginEntry.update({ where: { id: row.id }, data: { reply } })
      : row
    return { id: updated.id, text: updated.text, reply: updated.reply, when: whenLabel(updated.createdAt) }
  } catch {
    return null
  }
}

// Yesterday's margin entries (local time) — the raw material for recall.
export async function yesterdaysMargin(): Promise<string[]> {
  if (!hasDb()) return []
  try {
    const [{ localDateString, zonedMidnight, addDays }, db] = await Promise.all([
      import('./calendar'),
      getDb(),
    ])
    const today = localDateString()
    const rows = await db.marginEntry.findMany({
      where: {
        createdAt: { gte: zonedMidnight(addDays(today, -1)), lt: zonedMidnight(today) },
      },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map((r) => r.text)
  } catch {
    return []
  }
}
