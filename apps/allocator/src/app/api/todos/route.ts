import { NextResponse, after } from 'next/server'
import {
  addTodoUpdate,
  autoTagTodo,
  createTodo,
  listTodos,
  moveTodoToNote,
  tagTodo,
  toggleTodo,
  updateTodoText,
} from '@/lib/todos'
import { workDocketItem } from '@/lib/apollo/worker'

// The docket worker may run a full Apollo drafting pass after the response.
export const maxDuration = 300

export async function GET() {
  const todos = await listTodos()
  // The mail door sweeps opportunistically on Docket reads (throttled):
  // email yourself "Allocator: …" and it files here on your next visit.
  // The workspace is pinned before the response goes out — the request
  // context is not guaranteed inside after().
  const { activeWorkspaceId, runAsWorkspace } = await import('@/lib/tenant')
  const ws = await activeWorkspaceId()
  after(async () => {
    const { sweepMailboxTasks } = await import('@/lib/inbound')
    await runAsWorkspace(ws, () => sweepMailboxTasks())
  })
  return NextResponse.json(todos)
}

// { id } toggles an existing item; { id, text } amends its wording (a
// correction — it re-tags quietly but never re-runs the worker); { id, tag }
// lets an agent categorize it (infrastructure only — the tag never renders);
// { id, moveToNotes } closes the item out and files it to The File as a note;
// { text } files a new one, which the desk classifier tags in the background —
// unless the text is a bare URL, which commissions a cold draft through the
// OG URL sheet's workflows instead.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  if (body?.id && typeof body?.tag === 'string' && body.tag.trim()) {
    const ok = await tagTodo(
      String(body.id),
      body.tag.trim().slice(0, 40),
      String(body?.taggedBy ?? 'agent').slice(0, 60)
    )
    return NextResponse.json({ ok })
  }

  if (body?.id && body?.moveToNotes) {
    const note = await moveTodoToNote(String(body.id))
    return NextResponse.json({ ok: Boolean(note), note })
  }

  if (body?.id && typeof body?.update === 'string') {
    const text = body.update.trim().slice(0, 1000)
    if (!text) return NextResponse.json({ error: 'update required' }, { status: 400 })
    const update = await addTodoUpdate(String(body.id), text)
    return NextResponse.json({ ok: Boolean(update), update })
  }

  if (body?.id && typeof body?.text === 'string') {
    const text = body.text.trim().slice(0, 500)
    if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })
    const ok = await updateTodoText(String(body.id), text)
    // The classification keeps up with the new wording, quietly — but an
    // edit never commissions a fresh draft.
    if (ok) after(() => autoTagTodo(String(body.id), text))
    return NextResponse.json({ ok })
  }

  if (body?.id) {
    const ok = await toggleTodo(String(body.id))
    return NextResponse.json({ ok })
  }

  const text = String(body?.text ?? '').trim()
  if (!text) {
    return NextResponse.json({ error: 'text required' }, { status: 400 })
  }
  // A bare URL is a cold-draft commission: it routes through the OG URL
  // sheet's workflows rather than the docket worker, and the item links
  // to the sheet where the draft builds.
  const { bareUrlInput, seatColdDraftForTodo } = await import('@/lib/og')
  const coldUrl = bareUrlInput(text)
  const todo = await createTodo({
    text,
    meta: String(body?.meta ?? '').trim() || (coldUrl ? 'Cold draft · The OG sheet' : ''),
    ...(coldUrl ? { href: '/og?tab=url' } : {}),
  })
  if (todo && coldUrl) {
    const runId = await seatColdDraftForTodo(todo.id, coldUrl)
    if (runId) {
      // The trial runs post-response, workspace pinned first — the
      // request context is not guaranteed inside after().
      const { activeWorkspaceId, runAsWorkspace } = await import('@/lib/tenant')
      const ws = await activeWorkspaceId()
      after(async () => {
        const { runOgRow } = await import('@/lib/og')
        await runAsWorkspace(ws, () => runOgRow(runId, { todoId: todo.id }))
      })
    }
  } else if (todo) {
    // After the response: classify, and if the item calls for an email,
    // the docket worker drafts it into The Proofs unbidden.
    after(async () => {
      const cls = await autoTagTodo(todo.id, todo.text)
      if (cls?.action === 'email') await workDocketItem(todo.id, todo.text)
    })
  }
  return NextResponse.json({ ok: Boolean(todo), todo })
}
