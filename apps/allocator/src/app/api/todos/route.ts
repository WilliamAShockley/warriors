import { NextResponse, after } from 'next/server'
import {
  addTodoUpdate,
  autoTagTodo,
  createTodo,
  listTodos,
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
// { text } files a new one, which the desk classifier tags in the background.
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
  const todo = await createTodo({ text, meta: String(body?.meta ?? '').trim() })
  if (todo) {
    // After the response: classify, and if the item calls for an email,
    // the docket worker drafts it into The Proofs unbidden.
    after(async () => {
      const cls = await autoTagTodo(todo.id, todo.text)
      if (cls?.action === 'email') await workDocketItem(todo.id, todo.text)
    })
  }
  return NextResponse.json({ ok: Boolean(todo), todo })
}
