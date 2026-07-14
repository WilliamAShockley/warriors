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

export const todoTags = ['relationship', 'deal', 'research', 'operations', 'personal'] as const

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

// Background categorization on filing — a small model reads the item and
// files a tag. Failures are swallowed: tagging is best-effort plumbing.
export async function autoTagTodo(id: string, text: string): Promise<void> {
  if (!hasDb() || !process.env.ANTHROPIC_API_KEY) return
  try {
    const { anthropic } = await import('./claude')
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [
        {
          role: 'user',
          content: `Categorize this to-do from an alternative-asset investor's docket. Answer with exactly one word from: ${todoTags.join(', ')}.\n\nTo-do: "${text}"`,
        },
      ],
    })
    const raw = message.content[0]?.type === 'text' ? message.content[0].text.trim().toLowerCase() : ''
    const tag = (todoTags as readonly string[]).includes(raw) ? raw : null
    if (tag) await tagTodo(id, tag, 'desk-classifier')
  } catch {
    // Best-effort: an untagged item is just an item.
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
