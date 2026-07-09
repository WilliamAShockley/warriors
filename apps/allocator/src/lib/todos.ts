import { todos as seedTodos } from './data'

export type TodoRecord = {
  id: string
  text: string
  meta: string
  href: string | null
  group: string
  status: 'open' | 'cleared'
}

const hasDb = () => Boolean(process.env.DATABASE_URL)

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
        group: r.group,
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

export async function countOpenTodos(): Promise<number> {
  if (!hasDb()) return seedTodos.length
  try {
    const db = await getDb()
    return await db.todo.count({ where: { status: 'open' } })
  } catch {
    return seedTodos.length
  }
}
