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
  linkedinUrl: string | null
  filedOn: string
  // The Docket item this proof serves — the tie between the tray and the to-dos.
  todo: { id: string; text: string } | null
  // Continual learning: the research context behind the draft, the
  // reader's commentary on the output, and — once amended — the draft as
  // originally staged, so the redline can be drawn against it.
  grounding: string | null
  commentary: string | null
  originalBody: string | null
  // The recipient dossier and their company's site, filed at staging —
  // rendered at the foot of the review page.
  dossier: string | null
  websiteUrl: string | null
  // Multi-draft proofs: every staged option, recommended first, and which
  // one is on deck (the one that signs and sends).
  variants: { label: string; subject?: string; body: string }[] | null
  selectedVariant: number
  // The permanent staging record: the draft and envelope exactly as first
  // filed — the Record's diff baseline — and the straight-through checks
  // run at staging.
  stagedBody: string | null
  staged: { to?: string; subject?: string } | null
  stp: import('./stp').StpResult[] | null
  // The recipient's company (as the Register names it), and the context
  // experiment riding this proof, when one does.
  company: string | null
  experiment: import('./apollo/experiment').ExperimentRecord | null
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
  linkedinUrl: r.linkedinUrl ?? null,
  filedOn: dateLabel(r.createdAt),
  todo,
  grounding: r.grounding ?? null,
  commentary: r.commentary ?? null,
  originalBody: r.originalBody ?? null,
  dossier: r.dossier ?? null,
  websiteUrl: r.websiteUrl ?? null,
  variants: r.variantsJson ? JSON.parse(r.variantsJson) : null,
  selectedVariant: r.selectedVariant ?? 0,
  stagedBody: r.stagedBody ?? null,
  staged: r.stagedJson ? JSON.parse(r.stagedJson) : null,
  stp: r.stpJson ? JSON.parse(r.stpJson) : null,
  company: r.company ?? null,
  experiment: r.experimentJson ? JSON.parse(r.experimentJson) : null,
})

// Seed proofs predate the staging record — the mocked edition backfills.
const withRecordDefaults = (p: any): ProofRecord => ({
  stagedBody: null,
  staged: null,
  stp: null,
  company: null,
  experiment: null,
  ...p,
})

// The straight-through checks for an email's current state — run at
// staging, and re-run whenever the draft on deck changes (a variant
// selection, an experiment pick). Returns the JSON to file, or null.
async function computeStpJson(input: {
  body: string
  subject: string | null
  to: string | null
  mode: string | null
  audience: string | null
  grounding: string | null
  company: string | null
}): Promise<string | null> {
  const { runStpChecks } = await import('./stp')
  let register: { founderFirstName: string | null; founderFullName: string | null } | null = null
  if (input.company) {
    const { findCompany } = await import('./context')
    const hit = await findCompany(input.company).catch(() => null)
    if (hit) {
      register = {
        founderFirstName: hit.founderFirstName ?? null,
        founderFullName: hit.founderFullName ?? null,
      }
    }
  }
  const results = await runStpChecks({ ...input, register })
  return results.length ? JSON.stringify(results) : null
}

const seedQueue = (): ProofQueue => ({
  live: false,
  total: seedProofs.length,
  proof: seedProofs[0] ? withRecordDefaults(seedProofs[0]) : null,
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

// The proof serving a specific Docket item, pulled to the front of the
// desk — the click-through from the to-dos. When that item has nothing
// pending (already signed, spiked, or never staged), the head of the
// queue stands in.
export async function proofForTodo(todoId: string): Promise<ProofQueue> {
  if (!hasDb()) {
    const hit = seedProofs.find((p) => p.todo?.id === todoId)
    return hit ? { live: false, total: seedProofs.length, proof: withRecordDefaults(hit) } : seedQueue()
  }
  try {
    const db = await getDb()
    const [total, row] = await Promise.all([
      db.reviewItem.count({ where: { status: 'pending' } }),
      db.reviewItem.findFirst({
        where: { status: 'pending', todoId },
        orderBy: { queuedAt: 'asc' },
      }),
    ])
    if (!row) return nextProof()
    let todo: { id: string; text: string } | null = null
    const t = await db.todo.findUnique({ where: { id: todoId } })
    if (t) todo = { id: t.id, text: t.text }
    return { live: true, total, proof: toRecord(row, todo) }
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
  linkedinUrl?: string
  todoId?: string
  grounding?: string
  audience?: string
  mode?: string
  dossier?: string
  websiteUrl?: string
  variants?: { label: string; subject?: string; body: string }[]
  // The company in play, when the caller knows it — the straight-through
  // checks verify the draft against its Register entry.
  company?: string
  // The context experiment record, when this proof carries an A/B pair.
  experimentJson?: string
}): Promise<ProofRecord | null> {
  if (!hasDb()) return null
  try {
    const db = await getDb()

    // The staging record: envelope as first filed, and — for emails — the
    // straight-through checks, run against the Register before the row
    // ever exists. Check failures never block staging; they file with it.
    const action = input.actionJson ? JSON.parse(input.actionJson) : null
    const stagedJson =
      input.kind === 'email'
        ? JSON.stringify({
            ...(action?.to ? { to: action.to } : {}),
            ...(action?.subject ? { subject: action.subject } : {}),
          })
        : null
    const stpJson =
      input.kind === 'email'
        ? await computeStpJson({
            body: input.body,
            subject: action?.subject ?? null,
            to: action?.to ?? null,
            mode: input.mode ?? null,
            audience: input.audience ?? null,
            grounding: input.grounding ?? null,
            company: input.company ?? null,
          })
        : null

    const row = await db.reviewItem.create({
      data: {
        kind: input.kind,
        title: input.title,
        summary: input.summary ?? null,
        body: input.body,
        actionType: input.actionType ?? 'none',
        actionJson: input.actionJson ?? null,
        sourceUrl: input.sourceUrl ?? null,
        linkedinUrl: input.linkedinUrl ?? null,
        todoId: input.todoId ?? null,
        grounding: input.grounding ?? null,
        audience: input.audience ?? null,
        mode: input.mode ?? null,
        dossier: input.dossier ?? null,
        websiteUrl: input.websiteUrl ?? null,
        variantsJson:
          input.variants && input.variants.length >= 2 ? JSON.stringify(input.variants) : null,
        stagedBody: input.body,
        stagedJson,
        stpJson,
        company: input.company?.trim().slice(0, 120) || null,
        experimentJson: input.experimentJson ?? null,
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
        // The delivery watch takes over after the response: it watches the
        // sent thread for a bounce and re-guesses the address if one lands.
        ...(sentThreadId
          ? {
              deliveryStatus: 'watching',
              deliveryJson: JSON.stringify([
                {
                  to: JSON.parse(row.actionJson!).to ?? '',
                  messageId: sentMessageId,
                  threadId: sentThreadId,
                  at: new Date().toISOString(),
                },
              ]),
            }
          : {}),
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

// Put one of a multi-draft proof's options on deck: body and envelope
// follow the chosen draft. Choosing among the desk's own offerings is NOT
// an amendment — straight-through survives a selection.
export async function selectProofVariant(id: string, index: number): Promise<ProofRecord | null> {
  if (!hasDb()) return null
  try {
    const db = await getDb()
    const row = await db.reviewItem.findUnique({ where: { id } })
    if (!row || row.status !== 'pending' || !row.variantsJson) return null
    const variants = JSON.parse(row.variantsJson) as { label: string; subject?: string; body: string }[]
    if (!Number.isInteger(index) || index < 0 || index >= variants.length) return null

    const chosen = variants[index]
    const data: any = { body: chosen.body, selectedVariant: index }
    let action: any = null
    if (row.actionType === 'send_email' && row.actionJson) {
      action = JSON.parse(row.actionJson)
      if (chosen.subject) action.subject = chosen.subject
      data.actionJson = JSON.stringify(action)
    }
    // A fresh baseline: the redline draws against the chosen draft.
    if (!row.amended) data.originalBody = null
    // The checks follow the draft on deck.
    data.stpJson = await computeStpJson({
      body: chosen.body,
      subject: action?.subject ?? chosen.subject ?? null,
      to: action?.to ?? null,
      mode: row.mode ?? null,
      audience: row.audience ?? null,
      grounding: row.grounding ?? null,
      company: row.company ?? null,
    })

    const updated = await db.reviewItem.update({ where: { id }, data })
    let todo: { id: string; text: string } | null = null
    if (updated.todoId) {
      const t = await db.todo.findUnique({ where: { id: updated.todoId } })
      if (t) todo = { id: t.id, text: t.text }
    }
    return toRecord(updated, todo)
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
    const { runAsWorkspace } = await import('./tenant')
    return await runAsWorkspace((row as any).workspaceId ?? 'primary', async () => {

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
    })
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

// ————————————————————————————————— The Experiment

// One A/B pair on the reader's desk: the staged arms (immutable), the
// live drafts (arms plus any inline edits), and where the verdict stands.
export type ExperimentEntry = {
  id: string
  title: string
  summary: string | null
  filedOn: string
  todo: { id: string; text: string } | null
  to: string | null
  company: string | null
  arms: import('./apollo/experiment').ExperimentArm[]
  live: { label: string; subject?: string; body: string }[]
  selected: number
  chosen: number | null
  stp: import('./stp').StpResult[] | null
  grounding: string | null
  dossier: string | null
  websiteUrl: string | null
  linkedinUrl: string | null
}

const toExperimentEntry = (
  r: any,
  todo: { id: string; text: string } | null
): ExperimentEntry | null => {
  const exp = r.experimentJson ? JSON.parse(r.experimentJson) : null
  if (!exp?.arms?.length) return null
  const action = r.actionJson ? JSON.parse(r.actionJson) : null
  return {
    id: r.id,
    title: r.title,
    summary: r.summary ?? null,
    filedOn: dateLabel(r.createdAt),
    todo,
    to: action?.to ?? null,
    company: r.company ?? null,
    arms: exp.arms,
    live: r.variantsJson ? JSON.parse(r.variantsJson) : exp.arms,
    selected: r.selectedVariant ?? 0,
    chosen: exp.chosen ?? null,
    stp: r.stpJson ? JSON.parse(r.stpJson) : null,
    grounding: r.grounding ?? null,
    dossier: r.dossier ?? null,
    websiteUrl: r.websiteUrl ?? null,
    linkedinUrl: r.linkedinUrl ?? null,
  }
}

// The pairs awaiting a verdict, oldest first.
export async function listExperiments(): Promise<{ live: boolean; entries: ExperimentEntry[] }> {
  if (!hasDb()) return { live: false, entries: [] }
  try {
    const db = await getDb()
    const rows = await db.reviewItem.findMany({
      where: { status: 'pending', experimentJson: { not: null } },
      orderBy: { queuedAt: 'asc' },
    })
    const todoIds = rows.map((r: any) => r.todoId).filter(Boolean)
    const todos = todoIds.length
      ? await db.todo.findMany({ where: { id: { in: todoIds } } })
      : []
    const todoById = new Map(todos.map((t: any) => [t.id, { id: t.id, text: t.text }]))
    return {
      live: true,
      entries: rows
        .map((r: any) => toExperimentEntry(r, r.todoId ? (todoById.get(r.todoId) ?? null) : null))
        .filter(Boolean) as ExperimentEntry[],
    }
  } catch {
    return { live: false, entries: [] }
  }
}

// The running score, over every decided pair.
export type ExperimentScore = {
  decided: number
  withWins: number
  withoutWins: number
  editedBeforeChoosing: number
}

export async function experimentScoreboard(): Promise<ExperimentScore | null> {
  if (!hasDb()) return null
  try {
    const db = await getDb()
    const rows = await db.reviewItem.findMany({
      where: { experimentJson: { not: null } },
      select: { experimentJson: true, amended: true },
      take: 500,
    })
    const score: ExperimentScore = { decided: 0, withWins: 0, withoutWins: 0, editedBeforeChoosing: 0 }
    for (const r of rows) {
      const exp = r.experimentJson ? JSON.parse(r.experimentJson) : null
      if (exp?.chosen === null || exp?.chosen === undefined) continue
      score.decided++
      if (exp.chosen === 0) score.withWins++
      else score.withoutWins++
      if (r.amended) score.editedBeforeChoosing++
    }
    return score
  } catch {
    return null
  }
}

// Amend one arm inline. Edits land on the live drafts (variantsJson); the
// staged arms in experimentJson never move — they are the diff baseline.
// When the edited arm is on deck, the proof's own body and envelope follow.
export async function editExperimentArm(
  id: string,
  index: number,
  input: { body?: string; subject?: string }
): Promise<ExperimentEntry | null> {
  if (!hasDb()) return null
  try {
    const db = await getDb()
    const row = await db.reviewItem.findUnique({ where: { id } })
    if (!row || row.status !== 'pending' || !row.experimentJson || !row.variantsJson) return null
    const variants = JSON.parse(row.variantsJson) as { label: string; subject?: string; body: string }[]
    if (!Number.isInteger(index) || index < 0 || index >= variants.length) return null

    if (input.body !== undefined) {
      const text = input.body.trim()
      if (!text) return null
      variants[index] = { ...variants[index], body: text.slice(0, 20_000) }
    }
    if (input.subject !== undefined && input.subject.trim()) {
      variants[index] = { ...variants[index], subject: input.subject.trim().slice(0, 200) }
    }

    const data: any = { variantsJson: JSON.stringify(variants) }
    if (index === (row.selectedVariant ?? 0)) {
      data.body = variants[index].body
      if (row.actionType === 'send_email' && row.actionJson) {
        const action = JSON.parse(row.actionJson)
        if (variants[index].subject) action.subject = variants[index].subject
        data.actionJson = JSON.stringify(action)
      }
      data.stpJson = await computeStpJson({
        body: variants[index].body,
        subject: variants[index].subject ?? null,
        to: row.actionJson ? (JSON.parse(row.actionJson).to ?? null) : null,
        mode: row.mode ?? null,
        audience: row.audience ?? null,
        grounding: row.grounding ?? null,
        company: row.company ?? null,
      })
    }

    const updated = await db.reviewItem.update({ where: { id }, data })
    let todo: { id: string; text: string } | null = null
    if (updated.todoId) {
      const t = await db.todo.findUnique({ where: { id: updated.todoId } })
      if (t) todo = { id: t.id, text: t.text }
    }
    return toExperimentEntry(updated, todo)
  } catch {
    return null
  }
}

// The verdict: the reader picks an arm. The pick is filed on the
// experiment (that tally never changes afterward), the chosen draft goes
// on deck exactly as it stands — edits included — and amended/originalBody
// are set against the CHOSEN arm's staged original, so the ledger, the
// redline, and the distilled lesson all judge the arm he actually sent.
export async function pickExperimentArm(id: string, index: number): Promise<ExperimentEntry | null> {
  if (!hasDb()) return null
  try {
    const db = await getDb()
    const row = await db.reviewItem.findUnique({ where: { id } })
    if (!row || row.status !== 'pending' || !row.experimentJson || !row.variantsJson) return null
    const exp = JSON.parse(row.experimentJson)
    const variants = JSON.parse(row.variantsJson) as { label: string; subject?: string; body: string }[]
    if (!Number.isInteger(index) || index < 0 || index >= variants.length || !exp.arms?.[index])
      return null

    const live = variants[index]
    const original = exp.arms[index]
    const editedBody = live.body !== original.body
    const editedSubject = (live.subject ?? '') !== (original.subject ?? '')

    let action: any = null
    if (row.actionType === 'send_email' && row.actionJson) {
      action = JSON.parse(row.actionJson)
      if (live.subject) action.subject = live.subject
    }

    const updated = await db.reviewItem.update({
      where: { id },
      data: {
        selectedVariant: index,
        body: live.body,
        ...(action ? { actionJson: JSON.stringify(action) } : {}),
        experimentJson: JSON.stringify({ ...exp, chosen: index, chosenAt: new Date().toISOString() }),
        amended: editedBody || editedSubject,
        originalBody: editedBody ? original.body : null,
        stpJson: await computeStpJson({
          body: live.body,
          subject: action?.subject ?? live.subject ?? null,
          to: action?.to ?? null,
          mode: row.mode ?? null,
          audience: row.audience ?? null,
          grounding: row.grounding ?? null,
          company: row.company ?? null,
        }),
      },
    })
    let todo: { id: string; text: string } | null = null
    if (updated.todoId) {
      const t = await db.todo.findUnique({ where: { id: updated.todoId } })
      if (t) todo = { id: t.id, text: t.text }
    }
    return toExperimentEntry(updated, todo)
  } catch {
    return null
  }
}

// ————————————————————————————————— The Record

// One signed (or spiked) email, staged-vs-sent: everything the reader
// needs to see what the desk drafted, what he changed, and how it fared.
export type RecordEntry = {
  id: string
  title: string
  status: string // approved | spiked
  reviewedOn: string
  filedOn: string
  audience: string | null
  mode: string | null
  straightThrough: boolean | null
  amended: boolean
  // Staged vs signed, body and envelope.
  stagedBody: string | null
  finalBody: string
  stagedTo: string | null
  finalTo: string | null
  stagedSubject: string | null
  finalSubject: string | null
  // The verdict trail.
  stp: import('./stp').StpResult[] | null
  commentary: string | null
  grounding: string | null
  replyStatus: string | null
  deliveryStatus: string | null
  executionResult: string | null
  // The context experiment, when this email was one: which arm the reader
  // chose ("With your context" / "Without your context").
  experimentArm: string | null
}

// The reviewed email proofs, newest verdict first — the Record's ledger
// and the export's source. Pending proofs stay in the tray, not here.
export async function listRecord(limit = 200): Promise<{ live: boolean; entries: RecordEntry[] }> {
  if (!hasDb()) return { live: false, entries: [] }
  try {
    const db = await getDb()
    const rows = await db.reviewItem.findMany({
      where: { kind: 'email', status: { in: ['approved', 'spiked'] } },
      orderBy: { reviewedAt: 'desc' },
      take: limit,
    })
    return {
      live: true,
      entries: rows.map((r: any) => {
        const action = r.actionJson ? JSON.parse(r.actionJson) : null
        const staged = r.stagedJson ? JSON.parse(r.stagedJson) : null
        // An experiment's diff baseline is the CHOSEN arm as staged — the
        // signed version is judged against the draft it actually came from.
        const exp = r.experimentJson ? JSON.parse(r.experimentJson) : null
        const chosenArm =
          exp && exp.chosen !== null && exp.chosen !== undefined ? exp.arms?.[exp.chosen] : null
        return {
          id: r.id,
          title: r.title,
          status: r.status,
          reviewedOn: r.reviewedAt ? dateLabel(r.reviewedAt) : '',
          filedOn: dateLabel(r.createdAt),
          audience: r.audience ?? null,
          mode: r.mode ?? null,
          straightThrough: r.straightThrough ?? null,
          amended: Boolean(r.amended),
          // Proofs staged before the Record existed fall back to the
          // amendment snapshot; an untouched pre-Record proof diffs empty.
          stagedBody: chosenArm?.body ?? r.stagedBody ?? r.originalBody ?? r.body,
          finalBody: r.body,
          stagedTo: staged?.to ?? action?.to ?? null,
          finalTo: action?.to ?? null,
          stagedSubject: chosenArm?.subject ?? staged?.subject ?? action?.subject ?? null,
          finalSubject: action?.subject ?? null,
          stp: r.stpJson ? JSON.parse(r.stpJson) : null,
          commentary: r.commentary ?? null,
          grounding: r.grounding ?? null,
          replyStatus: r.replyStatus ?? null,
          deliveryStatus: r.deliveryStatus ?? null,
          executionResult: r.executionResult ?? null,
          experimentArm: chosenArm?.label ?? null,
        }
      }),
    }
  } catch {
    return { live: false, entries: [] }
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

// ————————————————————————————————— The delivery watch

// Gmail accepts every send — a dead address answers seconds later with a
// mailer-daemon bounce in the same thread. After a signature, this watch
// stays on the sent thread: on a bounce it asks the address-guess skill
// for the next-most-likely address and resends, up to five attempts in
// all. Out of guesses (or out of attempts), it files a to-do instead of
// pretending. Runs post-response via after(); wholly best-effort.
const DELIVERY_MAX_ATTEMPTS = 5
const BOUNCE_WAIT_MS = 40_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type DeliveryAttempt = {
  to: string
  messageId: string | null
  threadId: string
  at: string
  bounced?: boolean
}

export async function superviseDelivery(id: string): Promise<void> {
  if (!hasDb()) return
  try {
    const db = await getDb()
    const row = await db.reviewItem.findUnique({ where: { id } })
    if (!row || row.status !== 'approved' || row.deliveryStatus !== 'watching' || !row.sentThreadId)
      return
    const { runAsWorkspace } = await import('./tenant')
    return await runAsWorkspace((row as any).workspaceId ?? 'primary', () => watchDelivery(db, row))
  } catch {
    // The watch is enrichment on top of a sent email; it never throws back.
  }
}

async function watchDelivery(db: any, row: any): Promise<void> {
  const id = row.id
  try {

    const { threadHasBounce, sendEmail } = await import('./gmail')
    const action = row.actionJson ? JSON.parse(row.actionJson) : {}
    const subject = String(action.subject ?? row.title)

    let attempts: DeliveryAttempt[] = []
    try {
      attempts = JSON.parse(row.deliveryJson ?? '[]')
    } catch {}
    if (attempts.length === 0) {
      attempts = [
        {
          to: String(action.to ?? ''),
          messageId: row.sentMessageId,
          threadId: row.sentThreadId,
          at: new Date().toISOString(),
        },
      ]
    }

    const save = (data: Record<string, unknown>) =>
      db.reviewItem.update({
        where: { id },
        data: { ...data, deliveryJson: JSON.stringify(attempts) },
      })

    for (;;) {
      await sleep(BOUNCE_WAIT_MS)
      const current = attempts[attempts.length - 1]
      if (!current.threadId) break
      if (!(await threadHasBounce(current.threadId))) {
        // No bounce inside the watch window — the address held.
        await save({ deliveryStatus: 'delivered' })
        return
      }
      current.bounced = true
      if (attempts.length >= DELIVERY_MAX_ATTEMPTS) break

      // The next guess comes from the (reader-editable) address-guess skill.
      const { guessNextAddress } = await import('./apollo/skills/address-guess')
      let recipient = row.title
      if (row.todoId) {
        const t = await db.todo.findUnique({ where: { id: row.todoId } })
        if (t) recipient = `${t.text} — proof titled "${row.title}"`
      }
      const next = await guessNextAddress({
        recipient,
        triedAddresses: attempts.map((a) => a.to).filter(Boolean),
        context: [row.dossier, row.grounding].filter(Boolean).join('\n\n'),
      })
      if (!next) break

      // A fresh send to the new address — its own thread, its own watch.
      const sent = await sendEmail({ to: next, subject, bodyText: row.body })
      if (!sent) break
      attempts.push({
        to: next,
        messageId: sent.id || null,
        threadId: sent.threadId || '',
        at: new Date().toISOString(),
      })
      action.to = next
      await save({
        actionJson: JSON.stringify(action),
        sentMessageId: sent.id || null,
        sentThreadId: sent.threadId || null,
        replyStatus: 'awaiting',
        replyCheckedAt: null,
        executionResult: `sent to ${next} · message ${sent.id} · attempt ${attempts.length} after ${
          attempts.length - 1
        } bounce${attempts.length - 1 === 1 ? '' : 's'}`,
      })
    }

    // Out of attempts or out of credible guesses: say so, and put it back
    // on the reader's desk as a to-do rather than letting it die quietly.
    const tried = attempts.map((a) => a.to).filter(Boolean)
    await save({
      deliveryStatus: 'undeliverable',
      replyStatus: null,
      executionResult: `undeliverable — ${tried.length} address${tried.length === 1 ? '' : 'es'} bounced: ${tried.join(', ')}`,
    })
    const { createTodo } = await import('./todos')
    await createTodo({
      text: `Find a working address for "${row.title.slice(0, 90)}" — every guess bounced (${tried.join(', ')})`,
      meta: 'Filed by the delivery watch',
    })
  } catch {
    // The watch is enrichment on top of a sent email; it never throws back.
  }
}

// Redirect: the reader says the targeting was wrong. The proof on deck is
// spiked as superseded, and the caller re-runs the worker with the
// correction as binding instruction.
export async function redoProof(
  id: string,
  correction: string
): Promise<{ todoId: string; taskText: string; previousTo?: string; previousTitle?: string } | null> {
  if (!hasDb()) return null
  try {
    const db = await getDb()
    const row = await db.reviewItem.findUnique({ where: { id } })
    if (!row || row.status !== 'pending') return null

    let taskText = row.title
    if (row.todoId) {
      const t = await db.todo.findUnique({ where: { id: row.todoId } })
      if (t) taskText = t.text
    }

    await db.reviewItem.update({
      where: { id },
      data: {
        status: 'spiked',
        reviewedAt: new Date(),
        executionResult: `superseded — redirected by the reader: ${correction.slice(0, 300)}`,
      },
    })

    const action = row.actionJson ? JSON.parse(row.actionJson) : {}
    return {
      todoId: row.todoId ?? '',
      taskText,
      previousTo: action.to ? String(action.to) : undefined,
      previousTitle: row.title,
    }
  } catch {
    return null
  }
}


// Spike & close out: the draft dies AND the errand dies with it — the
// Docket item it served clears, and nothing re-runs. For when the redirect
// form reveals the whole task was misconceived, not just mistargeted.
export async function spikeAndCloseProof(id: string): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    const row = await db.reviewItem.findUnique({ where: { id } })
    if (!row || row.status !== 'pending') return false

    await db.reviewItem.update({
      where: { id },
      data: {
        status: 'spiked',
        reviewedAt: new Date(),
        executionResult: 'spiked and closed out — its to-do went with it',
      },
    })
    if (row.todoId) {
      await db.todo.updateMany({
        where: { id: row.todoId, status: 'open' },
        data: { status: 'cleared', clearedAt: new Date() },
      })
    }
    return true
  } catch {
    return false
  }
}


// The LinkedIn handoff: the reader sent the draft himself over LinkedIn
// (no email existed). Files the proof as approved — same ledger, same
// to-do clearing — with the channel on record. No thread to watch.
export async function approveViaLinkedIn(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!hasDb()) return { ok: false, error: 'no database' }
  try {
    const db = await getDb()
    const row = await db.reviewItem.findUnique({ where: { id } })
    if (!row || row.status !== 'pending') return { ok: false, error: 'not on review' }

    await db.reviewItem.update({
      where: { id },
      data: {
        status: 'approved',
        reviewedAt: new Date(),
        executionResult: 'sent via LinkedIn — manual handoff',
        straightThrough: !row.amended,
      },
    })
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
