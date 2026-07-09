import { NextResponse } from 'next/server'
import { createTodo, listTodos, toggleTodo } from '@/lib/todos'
import { todoGroups } from '@/lib/data'

export async function GET() {
  return NextResponse.json(await listTodos())
}

// { id } toggles an existing item; { text, group } files a new one.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  if (body?.id) {
    const ok = await toggleTodo(String(body.id))
    return NextResponse.json({ ok })
  }

  const text = String(body?.text ?? '').trim()
  const group = String(body?.group ?? '')
  if (!text || !(todoGroups as readonly string[]).includes(group)) {
    return NextResponse.json({ error: 'text and a valid group required' }, { status: 400 })
  }
  const todo = await createTodo({ text, group, meta: String(body?.meta ?? '').trim() })
  return NextResponse.json({ ok: Boolean(todo), todo })
}
