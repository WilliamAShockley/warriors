import { NextResponse } from 'next/server'
import { listTodos, toggleTodo } from '@/lib/todos'

export async function GET() {
  return NextResponse.json(await listTodos())
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const id = String(body?.id ?? '')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const ok = await toggleTodo(id)
  return NextResponse.json({ ok })
}
