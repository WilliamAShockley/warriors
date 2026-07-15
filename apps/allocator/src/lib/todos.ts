import { todos as seedTodos, type TodoBucket } from './data'

export type TodoRecord = {
  id: string
  text: string
  meta: string
  href: string | null
  group: TodoBucket
  status: 'open' | 'cleared'
}

const TZ = process.env.APP_TIMEZONE ?? 'America/New_York'
const hasDb = () => Boolean(process.env.DATABASE_URL)

// YYYY-MM-DD of a moment in the reader's timezone (en-CA formats as ISO).
const localDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)

// The docket files itself: an item's bucket is how long it has sat there.
// Filed today → Today; yesterday → Yesterday; two to seven days ago →
// Last Week; anything older has earned the Parking Lot.
export function bucketFor(createdAt: Date, now: Date = new Date()): TodoBucket {
  const days = Math.round(
    (Date.parse(localDay(now)) - Date.parse(localDay(createdAt))) / 86_400_000
  )
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days <= 7) return 'Last Week'
  return 'Parking Lot'
}

const seedRecords = (): TodoRecord[] =>
  seedTodos.map((t) => ({
    id: t.id,
    text: t.text,
    meta: t.meta,
    href: t.href ?? null,
    group: t.group,
    status: 'open' as const,
  }))

// Dynamic imports keep the zero-env mock path from ever touching Prisma.
async function getDb() {
  const { db } = await import('./db')
  return db
}

async function startOfTodayLocal(): Promise<Date> {
  const { localDateString, zonedMidnight } = await import('./calendar')
  return zonedMidnight(localDateString())
}

// The docket: open items plus today's cleared items (still restorable).
// Items cleared before today are filed for good — status flips to 'done'
// lazily on read, so no extra job is needed for the end-of-day archive.
export async function listTodos(): Promise<{ live: boolean; todos: TodoRecord[] }> {
  if (!hasDb()) return { live: false, todos: seedRecords() }

  try {
    const db = await getDb()

    if ((await db.todo.count()) === 0) {
      await db.todo.createMany({
        data: seedTodos.map((t) => ({
          id: t.id,
          text: t.text,
          meta: t.meta,
          href: t.href ?? null,
          group: t.group,
        })),
      })
    }

    await db.todo.updateMany({
      where: { status: 'cleared', clearedAt: { lt: await startOfTodayLocal() } },
      data: { status: 'done' },
    })

    const now = new Date()
    const rows = await db.todo.findMany({
      where: { status: { in: ['open', 'cleared'] } },
      orderBy: { createdAt: 'asc' },
    })
    return {
      live: true,
      todos: rows.map((r) => ({
        id: r.id,
        text: r.text,
        meta: r.meta,
        href: r.href,
        group: bucketFor(r.createdAt, now),
        status: r.status as 'open' | 'cleared',
      })),
    }
  } catch {
    return { live: false, todos: seedRecords() }
  }
}

export async function toggleTodo(id: string): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    const row = await db.todo.findUnique({ where: { id } })
    if (!row || row.status === 'done') return false
    await db.todo.update({
      where: { id },
      data:
        row.status === 'open'
          ? { status: 'cleared', clearedAt: new Date() }
          : { status: 'open', clearedAt: null },
    })
    return true
  } catch {
    return false
  }
}

export async function createTodo(input: {
  text: string
  meta?: string
}): Promise<TodoRecord | null> {
  if (!hasDb()) return null
  try {
    const db = await getDb()
    const row = await db.todo.create({
      // The stored group is vestigial — buckets are derived from createdAt.
      data: { text: input.text, meta: input.meta ?? '', group: 'Today' },
    })
    return {
      id: row.id,
      text: row.text,
      meta: row.meta,
      href: row.href,
      group: 'Today',
      status: 'open',
    }
  } catch {
    return null
  }
}

// ————————————————————————————————— Agent tagging (infrastructure only)
// Each item can be tagged/categorized by an agent. Deliberately absent
// from the UI: the tags are for the desk's machinery, not the reader.
// The tag is two-level where an action is called for — "email/outreach",
// "email/follow_up", "draft/post" — and a plain topic otherwise.

export const todoTopics = ['relationship', 'deal', 'research', 'operations', 'personal'] as const
export type TodoAction = 'email' | 'post' | 'analysis' | 'none'
export type TodoClassification = { action: TodoAction; tag: string }

export async function tagTodo(id: string, tag: string, taggedBy = 'agent'): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    await db.todo.update({
      where: { id },
      data: { tag, taggedBy, taggedAt: new Date() },
    })
    return true
  } catch {
    return false
  }
}

// Keyword fallback for keyless environments — enough to route the obvious.
function classifyByKeywords(text: string): TodoClassification {
  const t = text.toLowerCase()
  if (/\b(e-?mail|reply to|respond to|write (to|back)|reach out|follow up with|ping|intro to)\b/.test(t)) {
    const flavor = /\b(reply|respond|follow up|write back|circle back)\b/.test(t) ? 'follow_up' : 'outreach'
    return { action: 'email', tag: `email/${flavor}` }
  }
  if (/\b(post|blog|essay|newsletter)\b/.test(t)) return { action: 'post', tag: 'draft/post' }
  if (/\b(analy[sz]e|analysis|model|deck|memo)\b/.test(t)) return { action: 'analysis', tag: 'analysis' }
  return { action: 'none', tag: 'operations' }
}

// Read the item and decide two things: what kind of work it calls for
// (an email — outreach or follow-up? a post? an analysis?) and its topic.
export async function classifyTodo(text: string): Promise<TodoClassification> {
  if (!process.env.ANTHROPIC_API_KEY) return classifyByKeywords(text)
  try {
    const { anthropic } = await import('./claude')
    const { parseLLMJsonObject } = await import('./retry')
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: `Classify this to-do from an alternative-asset investor's docket.

To-do: "${text}"

Respond with JSON only:
{"action": "email" | "post" | "analysis" | "none", "flavor": "<for email only: outreach if it starts a conversation, follow_up if it continues one>", "topic": "${todoTopics.join('" | "')}"}

"action" is the work product the item calls for: email (writing to someone), post (a blog post or public writing), analysis (a memo, model, or deck), none (anything else — calls, reading, errands).`,
        },
      ],
    })
    const raw = message.content[0]?.type === 'text' ? message.content[0].text : ''
    const parsed = parseLLMJsonObject<{ action?: string; flavor?: string; topic?: string }>(raw, {})
    const action: TodoAction = ['email', 'post', 'analysis'].includes(parsed.action ?? '')
      ? (parsed.action as TodoAction)
      : 'none'
    const topic = (todoTopics as readonly string[]).includes(parsed.topic ?? '') ? parsed.topic! : 'operations'
    const tag =
      action === 'email'
        ? `email/${parsed.flavor === 'follow_up' ? 'follow_up' : 'outreach'}`
        : action === 'post'
          ? 'draft/post'
          : action === 'analysis'
            ? 'analysis'
            : topic
    return { action, tag }
  } catch {
    return classifyByKeywords(text)
  }
}

// Background categorization on filing. Failures are swallowed: tagging is
// best-effort plumbing, and an untagged item is just an item.
export async function autoTagTodo(id: string, text: string): Promise<TodoClassification | null> {
  if (!hasDb()) return null
  try {
    const cls = await classifyTodo(text)
    await tagTodo(id, cls.tag, 'desk-classifier')
    return cls
  } catch {
    return null
  }
}

// A short slice of the open docket, for the morning Brief.
export async function openTodosPreview(limit = 6): Promise<{ text: string; group: string }[]> {
  if (!hasDb()) return seedTodos.slice(0, limit).map((t) => ({ text: t.text, group: t.group }))
  try {
    const db = await getDb()
    const now = new Date()
    const rows = await db.todo.findMany({
      where: { status: 'open' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    })
    return rows.map((r) => ({ text: r.text, group: bucketFor(r.createdAt, now) }))
  } catch {
    return []
  }
}

export async function countOpenTodos(): Promise<number> {
  if (!hasDb()) return seedTodos.length
  try {
    const db = await getDb()
    return await db.todo.count({ where: { status: 'open' } })
  } catch {
    return seedTodos.length
  }
}
