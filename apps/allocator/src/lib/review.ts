import { proofs as seedProofs } from './data'

// The Proofs: drafted work awaiting the reader's signature, reviewed one at
// a time. Approval executes the attached action (an email actually sends),
// Hold sends the proof to the back of the queue, Spike kills it.

export type ProofRecord = {
  id: string
  kind: string
  title: string
  summary: string | null
  body: string
  actionType: string | null
  action: { to?: string; subject?: string; threadId?: string } | null
  sourceUrl: string | null
  filedOn: string
  // The Docket item this proof serves — the tie between the tray and the to-dos.
  todo: { id: string; text: string } | null
}

export type ProofQueue = { live: boolean; total: number; proof: ProofRecord | null }

const TZ = process.env.APP_TIMEZONE ?? 'America/New_York'
const hasDb = () => Boolean(process.env.DATABASE_URL)

const dateLabel = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'long' }).format(d)

// Dynamic import keeps the zero-env mock path from ever touching Prisma.
async function getDb() {
  const { db } = await import('./db')
  return db
}

const toRecord = (r: any, todo: { id: string; text: string } | null = null): ProofRecord => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  summary: r.summary,
  body: r.body,
  actionType: r.actionType,
  action: r.actionJson ? JSON.parse(r.actionJson) : null,
  sourceUrl: r.sourceUrl,
  filedOn: dateLabel(r.createdAt),
  todo,
})

const seedQueue = (): ProofQueue => ({
  live: false,
  total: seedProofs.length,
  proof: seedProofs[0] ?? null,
})

// The head of the queue — the single proof on review. Never a list.
export async function nextProof(): Promise<ProofQueue> {
  if (!hasDb()) return seedQueue()
  try {
    const db = await getDb()
    const [total, row] = await Promise.all([
      db.reviewItem.count({ where: { status: 'pending' } }),
      db.reviewItem.findFirst({ where: { status: 'pending' }, orderBy: { queuedAt: 'asc' } }),
    ])
    let todo: { id: string; text: string } | null = null
    if (row?.todoId) {
      const t = await db.todo.findUnique({ where: { id: row.todoId } })
      if (t) todo = { id: t.id, text: t.text }
    }
    return { live: true, total, proof: row ? toRecord(row, todo) : null }
  } catch {
    return seedQueue()
  }
}

export async function countPendingProofs(): Promise<number> {
  if (!hasDb()) return seedProofs.length
  try {
    const db = await getDb()
    return await db.reviewItem.count({ where: { status: 'pending' } })
  } catch {
    return seedProofs.length
  }
}

export async function createProof(input: {
  kind: string
  title: string
  summary?: string
  body: string
  actionType?: string
  actionJson?: string
  sourceUrl?: string
  todoId?: string
}): Promise<ProofRecord | null> {
  if (!hasDb()) return null
  try {
    const db = await getDb()
    const row = await db.reviewItem.create({
      data: {
        kind: input.kind,
        title: input.title,
        summary: input.summary ?? null,
        body: input.body,
        actionType: input.actionType ?? 'none',
        actionJson: input.actionJson ?? null,
        sourceUrl: input.sourceUrl ?? null,
        todoId: input.todoId ?? null,
      },
    })
    return toRecord(row)
  } catch {
    return null
  }
}

// Approve: execute the attached action, then file the proof as approved.
// A failed execution leaves the proof pending with the error on record,
// so nothing is silently lost between signature and send.
export async function approveProof(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!hasDb()) return { ok: false, error: 'no database' }
  try {
    const db = await getDb()
    const row = await db.reviewItem.findUnique({ where: { id } })
    if (!row || row.status !== 'pending') return { ok: false, error: 'not on review' }

    let executionResult = 'approved without action'
    if (row.actionType === 'send_email' && row.actionJson) {
      const { to, subject, threadId } = JSON.parse(row.actionJson)
      const { sendEmail } = await import('./gmail')
      const sent = await sendEmail({
        to: String(to ?? ''),
        subject: String(subject ?? row.title),
        bodyText: row.body,
        threadId: threadId ? String(threadId) : null,
      })
      if (!sent) {
        const error = 'The send failed — Gmail may not be connected.'
        await db.reviewItem.update({ where: { id }, data: { executionResult: error } })
        return { ok: false, error }
      }
      executionResult = `sent to ${to} · message ${sent.id}`
    }

    await db.reviewItem.update({
      where: { id },
      data: { status: 'approved', reviewedAt: new Date(), executionResult },
    })

    // Signing the proof completes the work — the Docket item it served
    // clears itself, same as ticking it by hand.
    if (row.todoId) {
      await db.todo.updateMany({
        where: { id: row.todoId, status: 'open' },
        data: { status: 'cleared', clearedAt: new Date() },
      })
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'approval failed' }
  }
}

// Hold: not now — the proof keeps its place in the record but moves to the
// back of the queue.
export async function holdProof(id: string): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    await db.reviewItem.update({ where: { id }, data: { queuedAt: new Date() } })
    return true
  } catch {
    return false
  }
}

// Spike: killed, newspaper-style. Kept on record, never executed.
export async function spikeProof(id: string): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    await db.reviewItem.update({
      where: { id },
      data: { status: 'spiked', reviewedAt: new Date() },
    })
    return true
  } catch {
    return false
  }
}
