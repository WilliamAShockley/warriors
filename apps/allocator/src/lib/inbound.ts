// The mail doors: a task can be filed by email and land on the Docket like
// any other, where the worker picks it up unbidden.
//
// Door one — the reader's own mailbox: email yourself (or forward a
// thread to yourself) with "Allocator:" or "Task:" leading the subject.
// The sweep watches the connected Gmail for such messages — self-sent
// only, so a stranger cannot mail tasks onto the desk — and files each
// exactly once. It runs opportunistically on Docket/Proofs reads
// (throttled) and daily from the cron.
//
// Door two — the provisioned address: /api/inbound/email accepts vendor
// webhooks (Postmark/SendGrid-shaped), authenticated by the workspace's
// inboundToken capability, for deployments that wire up an inbound
// domain. Same filing path, same dedupe.

import { activeWorkspaceId } from './tenant'

const hasDb = () => Boolean(process.env.DATABASE_URL)
// (activeWorkspaceId is used by the sweep's throttle key.)

async function getDb() {
  const { db } = await import('./db')
  return db
}

// Strip "Re:"/"Fwd:" noise and the trigger word from a subject line.
const TRIGGER = /^\s*(?:(?:re|fwd?)\s*:\s*)*(allocator|task)\s*:\s*/i

export const subjectIsTask = (subject: string) => TRIGGER.test(subject)

const taskTextFromSubject = (subject: string) =>
  subject.replace(TRIGGER, '').replace(/^\s*(?:(?:re|fwd?)\s*:\s*)+/i, '').trim()

// File one email as a Docket item: the subject is the to-do, the body
// rides along as the item's first status update (context for the worker),
// and the classifier decides whether the drafting worker picks it up.
export async function fileEmailTask(input: {
  messageId: string
  subject: string
  body?: string
  source: 'mailbox' | 'post'
  from?: string
}): Promise<{ filed: boolean; todoId?: string }> {
  if (!hasDb()) return { filed: false }
  try {
    const db = await getDb()

    const seen = await db.inboundEmail.findFirst({ where: { id: input.messageId } })
    if (seen) return { filed: false }

    const text =
      taskTextFromSubject(input.subject).slice(0, 500) ||
      (input.body ?? '').trim().split('\n')[0].slice(0, 140)
    if (!text) return { filed: false }

    const { createTodo, addTodoUpdate, autoTagTodo } = await import('./todos')
    const { bareUrlInput, seatColdDraftForTodo, runOgRow } = await import('./og')
    const coldUrl = bareUrlInput(text)
    const todo = await createTodo({
      text,
      meta: input.source === 'mailbox' ? 'Filed by mail' : `Filed by post${input.from ? ` · ${input.from.slice(0, 60)}` : ''}`,
      ...(coldUrl ? { href: '/og?tab=url' } : {}),
    })
    if (!todo) return { filed: false }

    const body = (input.body ?? '').trim()
    if (body) await addTodoUpdate(todo.id, `From the email:\n${body.slice(0, 1000)}`)

    await db.inboundEmail.create({ data: { id: input.messageId, todoId: todo.id } })

    // Same pipeline as filing by hand: a bare URL commissions a cold draft
    // through the OG URL sheet; anything else is classified, and
    // email-shaped items go to the drafting worker.
    if (coldUrl) {
      const runId = await seatColdDraftForTodo(todo.id, coldUrl)
      if (runId) await runOgRow(runId, { todoId: todo.id })
    } else {
      const cls = await autoTagTodo(todo.id, todo.text)
      if (cls?.action === 'email') {
        const { workDocketItem } = await import('./apollo/worker')
        await workDocketItem(todo.id, todo.text)
      }
    }
    return { filed: true, todoId: todo.id }
  } catch {
    return { filed: false }
  }
}

// Door one's sweep. Throttled per workspace so it can piggyback on page
// reads without hammering Gmail.
const lastSweep = new Map<string, number>()
const SWEEP_EVERY_MS = 2 * 60 * 1000

export async function sweepMailboxTasks(force = false): Promise<{ filed: number }> {
  if (!hasDb()) return { filed: 0 }
  try {
    const ws = await activeWorkspaceId()
    const last = lastSweep.get(ws) ?? 0
    if (!force && Date.now() - last < SWEEP_EVERY_MS) return { filed: 0 }
    lastSweep.set(ws, Date.now())

    const { searchEmails, readEmail } = await import('./gmail')
    // Self-sent only: the reader mails (or forwards to) himself. Bounded
    // to the recent window; the ledger carries the real dedupe.
    const hits = await searchEmails(
      'from:me newer_than:3d {subject:"allocator:" subject:"task:"}',
      15
    )
    let filed = 0
    for (const hit of hits) {
      if (!subjectIsTask(hit.subject)) continue
      const full = await readEmail(hit.id)
      const result = await fileEmailTask({
        messageId: hit.id,
        subject: hit.subject,
        body: full?.body,
        source: 'mailbox',
      })
      if (result.filed) filed++
    }
    return { filed }
  } catch {
    return { filed: 0 }
  }
}
