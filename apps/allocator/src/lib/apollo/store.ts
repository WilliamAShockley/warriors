import { apolloExample } from '../data'

export type ApolloStep = {
  t: string // display time, e.g. "07:41"
  kind: 'tool' | 'search' | 'write' | 'note'
  name: string
  detail: string
}

export type ApolloBriefing = {
  title: string
  dateline: string
  sections: { label: string; body: string }[]
}

export type ApolloTaskRecord = {
  id: string
  ask: string
  status: 'received' | 'working' | 'done' | 'failed'
  planNote: string | null
  steps: ApolloStep[]
  result: ApolloBriefing | null
  verdict: string | null
  feedbackNote: string | null
  createdAt: string
  finishedAt: string | null
}

const TZ = process.env.APP_TIMEZONE ?? 'America/New_York'
const hasDb = () => Boolean(process.env.DATABASE_URL)

async function getDb() {
  const { db } = await import('../db')
  return db
}

export function stepTime(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

const toRecord = (r: any): ApolloTaskRecord => ({
  id: r.id,
  ask: r.ask,
  status: r.status,
  planNote: r.planNote,
  steps: safeParse(r.stepsJson, []),
  result: r.resultJson ? safeParse(r.resultJson, null) : null,
  verdict: r.verdict,
  feedbackNote: r.feedbackNote,
  createdAt: r.createdAt.toISOString(),
  finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
})

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json)
  } catch {
    return fallback
  }
}

export async function createTask(ask: string, model: string): Promise<ApolloTaskRecord | null> {
  if (!hasDb()) return null
  try {
    const db = await getDb()
    const row = await db.apolloTask.create({
      data: { ask, model, status: 'working', startedAt: new Date() },
    })
    return toRecord(row)
  } catch {
    return null
  }
}

export async function getTask(id: string): Promise<ApolloTaskRecord | null> {
  if (!hasDb()) return id === apolloExample.id ? apolloExample : null
  try {
    const db = await getDb()
    const row = await db.apolloTask.findUnique({ where: { id } })
    return row ? toRecord(row) : id === apolloExample.id ? apolloExample : null
  } catch {
    return null
  }
}

export async function listRecent(n = 5): Promise<{ live: boolean; tasks: ApolloTaskRecord[] }> {
  if (!hasDb()) return { live: false, tasks: [apolloExample] }
  try {
    const db = await getDb()
    const rows = await db.apolloTask.findMany({ orderBy: { createdAt: 'desc' }, take: n })
    return { live: true, tasks: rows.map(toRecord) }
  } catch {
    return { live: false, tasks: [apolloExample] }
  }
}

export async function appendStep(id: string, step: Omit<ApolloStep, 't'>): Promise<void> {
  if (!hasDb()) return
  try {
    const db = await getDb()
    const row = await db.apolloTask.findUnique({ where: { id } })
    if (!row) return
    const steps: ApolloStep[] = safeParse(row.stepsJson, [])
    steps.push({ t: stepTime(), ...step })
    await db.apolloTask.update({ where: { id }, data: { stepsJson: JSON.stringify(steps) } })
  } catch {}
}

export async function setPlanNote(id: string, planNote: string): Promise<void> {
  if (!hasDb()) return
  try {
    const db = await getDb()
    await db.apolloTask.update({ where: { id }, data: { planNote } })
  } catch {}
}

export async function completeTask(
  id: string,
  args: { status: 'done' | 'failed'; result: ApolloBriefing | null; trace: unknown }
): Promise<void> {
  if (!hasDb()) return
  try {
    const db = await getDb()
    await db.apolloTask.update({
      where: { id },
      data: {
        status: args.status,
        resultJson: args.result ? JSON.stringify(args.result) : null,
        traceJson: JSON.stringify(args.trace),
        finishedAt: new Date(),
      },
    })
  } catch {}
}

export async function saveFeedback(
  id: string,
  verdict: 'good' | 'needs-work',
  note: string | null
): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    await db.apolloTask.update({ where: { id }, data: { verdict, feedbackNote: note } })
    return true
  } catch {
    return false
  }
}

export async function addLesson(taskId: string, lesson: string): Promise<void> {
  if (!hasDb()) return
  try {
    const db = await getDb()
    await db.apolloLesson.create({ data: { taskId, lesson } })
  } catch {}
}

export async function listLessons(n = 10): Promise<string[]> {
  if (!hasDb()) return []
  try {
    const db = await getDb()
    const rows = await db.apolloLesson.findMany({ orderBy: { createdAt: 'desc' }, take: n })
    return rows.map((r) => r.lesson)
  } catch {
    return []
  }
}

// Lessons distilled from the reader's proof commentary (taskId "proof:…") —
// handed to the drafting skills, so review feedback shapes the next draft.
export async function listProofLessons(n = 8): Promise<string[]> {
  if (!hasDb()) return []
  try {
    const db = await getDb()
    const rows = await db.apolloLesson.findMany({
      where: { taskId: { startsWith: 'proof:' } },
      orderBy: { createdAt: 'desc' },
      take: n,
    })
    return rows.map((r) => r.lesson)
  } catch {
    return []
  }
}

export async function exportTasks(): Promise<string> {
  if (!hasDb()) return ''
  try {
    const db = await getDb()
    const rows = await db.apolloTask.findMany({ orderBy: { createdAt: 'asc' } })
    return rows
      .map((r) =>
        JSON.stringify({
          id: r.id,
          ask: r.ask,
          model: r.model,
          status: r.status,
          trace: r.traceJson ? safeParse(r.traceJson, null) : null,
          result: r.resultJson ? safeParse(r.resultJson, null) : null,
          verdict: r.verdict,
          feedbackNote: r.feedbackNote,
          createdAt: r.createdAt.toISOString(),
        })
      )
      .join('\n')
  } catch {
    return ''
  }
}
