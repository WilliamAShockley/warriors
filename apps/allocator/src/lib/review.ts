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
  // Continual learning: the research context behind the draft, and the
  // reader's commentary on the output.
  grounding: string | null
  commentary: string | null
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
  grounding: r.grounding ?? null,
  commentary: r.commentary ?? null,
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
  grounding?: string
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
        grounding: input.grounding ?? null,
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

// ————————————————————————————————— Continual learning

// Amend a pending proof inline: the body, the email envelope, or the
// reader's commentary. The signed version is whatever was amended to.
export async function amendProof(
  id: string,
  input: { body?: string; subject?: string; to?: string; commentary?: string }
): Promise<ProofRecord | null> {
  if (!hasDb()) return null
  try {
    const db = await getDb()
    const row = await db.reviewItem.findUnique({ where: { id } })
    if (!row || row.status !== 'pending') return null

    const data: any = {}
    if (input.body !== undefined) data.body = input.body
    if (input.commentary !== undefined) data.commentary = input.commentary.trim() || null
    if ((input.subject !== undefined || input.to !== undefined) && row.actionType === 'send_email') {
      const action = row.actionJson ? JSON.parse(row.actionJson) : {}
      if (input.to !== undefined) action.to = input.to
      if (input.subject !== undefined) action.subject = input.subject
      data.actionJson = JSON.stringify(action)
    }
    if (Object.keys(data).length === 0) return toRecord(row)

    const updated = await db.reviewItem.update({ where: { id }, data })
    return toRecord(updated)
  } catch {
    return null
  }
}

// After a verdict, the reader's commentary becomes a standing lesson —
// scoped to proofs — that future drafting runs are handed. Best-effort.
export async function distillProofLesson(id: string): Promise<void> {
  if (!hasDb() || !process.env.ANTHROPIC_API_KEY) return
  try {
    const db = await getDb()
    const row = await db.reviewItem.findUnique({ where: { id } })
    if (!row?.commentary?.trim()) return

    const { anthropic } = await import('./claude')
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: `The reader reviewed a drafted ${row.kind} titled "${row.title}" and left this commentary:\n"${row.commentary.trim()}"\n\nDistill it into ONE imperative lesson for whoever drafts the next one (max 25 words, no preamble). If the commentary contains no usable instruction, answer exactly: NONE`,
        },
      ],
    })
    const lesson = message.content[0]?.type === 'text' ? message.content[0].text.trim() : ''
    if (lesson && lesson !== 'NONE') {
      const { addLesson } = await import('./apollo/store')
      await addLesson(`proof:${id}`, lesson)
    }
  } catch {
    // A lost lesson is a shame, not a failure.
  }
}

// Highlight-to-provenance: where did this language come from? Answered
// against the stored grounding, honestly — including "nowhere, check it".
export async function explainSelection(
  id: string,
  selection: string
): Promise<{ source: string; explanation: string } | null> {
  if (!hasDb() || !process.env.ANTHROPIC_API_KEY) return null
  try {
    const db = await getDb()
    const row = await db.reviewItem.findUnique({ where: { id } })
    if (!row) return null

    const { anthropic } = await import('./claude')
    const { parseLLMJsonObject } = await import('./retry')
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `A draft ${row.kind} was prepared for an investor from research context. He highlighted a passage and asks: where did this come from?

THE DRAFT:
${row.body.slice(0, 6000)}

THE RESEARCH CONTEXT THE DRAFT WAS GROUNDED IN:
${row.grounding?.slice(0, 8000) || '(none was recorded for this draft)'}

THE HIGHLIGHTED PASSAGE:
"${selection.slice(0, 600)}"

Answer with JSON only:
{"source": "research" | "thread" | "voice" | "unsupported", "explanation": "<1-3 sentences>"}

Rules: "research"/"thread" only when the context above actually supports the passage — quote the exact supporting line in the explanation. "voice" when it is the sender's own standard self-introduction, boilerplate, or ask language rather than a claim about the recipient. "unsupported" when it is a recipient-specific claim with no support in the context — say plainly it should be checked before sending. Never invent a source.`,
        },
      ],
    })
    const raw = message.content[0]?.type === 'text' ? message.content[0].text : ''
    const parsed = parseLLMJsonObject<{ source?: string; explanation?: string }>(raw, {})
    if (!parsed.explanation) return null
    return {
      source: ['research', 'thread', 'voice', 'unsupported'].includes(parsed.source ?? '')
        ? parsed.source!
        : 'unsupported',
      explanation: parsed.explanation,
    }
  } catch {
    return null
  }
}
