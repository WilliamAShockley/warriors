import { NextResponse, after } from 'next/server'
import { autoTagTodo, createTodo, listTodos, tagTodo, toggleTodo } from '@/lib/todos'
import { workDocketItem } from '@/lib/apollo/worker'

// The docket worker may run a full Apollo drafting pass after the response.
export const maxDuration = 300

export async function GET() {
  return NextResponse.json(await listTodos())
}

// { id } toggles an existing item; { id, tag } lets an agent categorize it
// (infrastructure only — the tag never renders); { text } files a new one,
// which the desk classifier tags in the background.
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
