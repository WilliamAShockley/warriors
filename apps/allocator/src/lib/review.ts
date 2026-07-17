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
  // Continual learning: the research context behind the draft, the
  // reader's commentary on the output, and — once amended — the draft as
  // originally staged, so the redline can be drawn against it.
  grounding: string | null
  commentary: string | null
  originalBody: string | null
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
  originalBody: r.originalBody ?? null,
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
  audience?: string
  mode?: string
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
        audience: input.audience ?? null,
        mode: input.mode ?? null,
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
    let sentMessageId: string | null = null
    let sentThreadId: string | null = null
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
      sentMessageId = sent.id || null
      sentThreadId = sent.threadId || null
    }

    await db.reviewItem.update({
      where: { id },
      data: {
        status: 'approved',
        reviewedAt: new Date(),
        executionResult,
        // Straight through: signed exactly as staged, not a byte amended.
        straightThrough: !row.amended,
        sentMessageId,
        sentThreadId,
        replyStatus: sentThreadId ? 'awaiting' : null,
      },
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
    if (input.body !== undefined && input.body !== row.body) {
      data.body = input.body
      // First edit snapshots the original — the diff is the feedback.
      if (!row.amended) {
        data.originalBody = row.body
        data.amended = true
      }
    }
    if (input.commentary !== undefined) data.commentary = input.commentary.trim() || null
    if ((input.subject !== undefined || input.to !== undefined) && row.actionType === 'send_email') {
      const action = row.actionJson ? JSON.parse(row.actionJson) : {}
      const changed =
        (input.to !== undefined && input.to !== action.to) ||
        (input.subject !== undefined && input.subject !== action.subject)
      if (input.to !== undefined) action.to = input.to
      if (input.subject !== undefined) action.subject = input.subject
      if (changed) {
        data.actionJson = JSON.stringify(action)
        if (!row.amended) data.amended = true
      }
    }
    if (Object.keys(data).length === 0) return toRecord(row)

    const updated = await db.reviewItem.update({ where: { id }, data })
    return toRecord(updated)
  } catch {
    return null
  }
}

// After a verdict, the reader's feedback becomes a standing lesson —
// scoped to proofs — that future drafting runs are handed. Two signals
// feed it: what he SAID (commentary) and what he CHANGED (the diff
// between the staged draft and the version he signed). Best-effort.
export async function distillProofLesson(id: string): Promise<void> {
  if (!hasDb() || !process.env.ANTHROPIC_API_KEY) return
  try {
    const db = await getDb()
    const row = await db.reviewItem.findUnique({ where: { id } })
    if (!row) return

    const commentary = row.commentary?.trim() || null
    const edited = row.amended && row.originalBody && row.originalBody !== row.body
    if (!commentary && !edited) return

    const parts: string[] = [
      `The reader reviewed a drafted ${row.kind} titled "${row.title}"${row.audience ? ` (audience: ${row.audience})` : ''} and gave his verdict (${row.status}).`,
    ]
    if (commentary) parts.push(`His commentary:\n"${commentary}"`)
    if (edited) {
      parts.push(
        `He edited the draft before signing. THE DRAFT AS STAGED:\n${row.originalBody!.slice(0, 4000)}\n\nTHE VERSION HE SIGNED:\n${row.body.slice(0, 4000)}\n\nThe changes he made ARE his feedback — read the diff.`
      )
    }

    const { anthropic } = await import('./claude')
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `${parts.join('\n\n')}\n\nDistill ONE imperative lesson for whoever drafts the next one (max 25 words, no preamble) — the single most important thing to do differently. If there is no usable instruction, answer exactly: NONE`,
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

// ————————————————————————————————— The Ledger & exemplars

export type Ledger = {
  signed: number // emails signed, all time
  straight: number // signed with zero amendments
  streak: number // consecutive straight-through, most recent first
  trailing30: number | null // straight-through rate over the last 30 signed (null until 5 signed)
}

// The straight-through record, computed over signed emails only.
export async function ledger(): Promise<Ledger | null> {
  if (!hasDb()) return null
  try {
    const db = await getDb()
    const rows = await db.reviewItem.findMany({
      where: { kind: 'email', status: 'approved' },
      orderBy: { reviewedAt: 'desc' },
      select: { straightThrough: true },
      take: 500,
    })
    const signed = rows.length
    const straight = rows.filter((r) => r.straightThrough).length
    let streak = 0
    for (const r of rows) {
      if (r.straightThrough) streak++
      else break
    }
    const last30 = rows.slice(0, 30)
    const trailing30 =
      signed >= 5 ? Math.round((last30.filter((r) => r.straightThrough).length / last30.length) * 100) : null
    return { signed, straight, streak, trailing30 }
  } catch {
    return null
  }
}

export type Exemplar = {
  subject: string | null
  body: string
  replied: boolean
  straightThrough: boolean
}

// Reply tracking, narrowly: only threads the app itself sent are ever
// checked — never the mailbox at large. Bounded and rate-limited by
// replyCheckedAt so it piggybacks cheaply on drafting runs.
export async function checkRecentReplies(limit = 5): Promise<void> {
  if (!hasDb()) return
  try {
    const db = await getDb()
    const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000)
    const rows = await db.reviewItem.findMany({
      where: {
        status: 'approved',
        replyStatus: 'awaiting',
        sentThreadId: { not: null },
        OR: [{ replyCheckedAt: null }, { replyCheckedAt: { lt: cutoff } }],
      },
      orderBy: { reviewedAt: 'desc' },
      take: limit,
    })
    if (rows.length === 0) return
    const { threadHasReply } = await import('./gmail')
    for (const row of rows) {
      const replied = await threadHasReply(row.sentThreadId!, row.sentMessageId)
      await db.reviewItem.update({
        where: { id: row.id },
        data: {
          replyCheckedAt: new Date(),
          ...(replied ? { replyStatus: 'replied' } : {}),
        },
      })
    }
  } catch {
    // Reply status is enrichment; drafting never depends on it.
  }
}

// Live few-shot anchors for the drafting skill: the reader's most recent
// successful sent emails in the SAME audience and mode — replied first,
// then straight-through, then merely signed. Playbooks never cross.
export async function listExemplars(audience: string, mode: string, n = 3): Promise<Exemplar[]> {
  if (!hasDb()) return []
  try {
    await checkRecentReplies()
    const db = await getDb()
    const rows = await db.reviewItem.findMany({
      where: { kind: 'email', status: 'approved', audience, mode },
      orderBy: { reviewedAt: 'desc' },
      take: 25,
    })
    const scored = rows
      .map((r) => ({
        subject: r.actionJson ? (JSON.parse(r.actionJson).subject ?? null) : null,
        body: r.body,
        replied: r.replyStatus === 'replied',
        straightThrough: Boolean(r.straightThrough),
      }))
      .sort(
        (a, b) =>
          Number(b.replied) - Number(a.replied) ||
          Number(b.straightThrough) - Number(a.straightThrough)
      )
    return scored.slice(0, n)
  } catch {
    return []
  }
}
