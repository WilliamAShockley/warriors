import { NextResponse } from 'next/server'
import { createTask, listRecent } from '@/lib/apollo/store'
import { runApollo, APOLLO_MODEL } from '@/lib/apollo/run'

export const maxDuration = 300

export async function GET() {
  return NextResponse.json(await listRecent(5))
}

// Files the task and runs the loop inline; progress lands in the DB as it
// goes, so the UI polls GET rather than waiting on this response.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const ask = String(body?.ask ?? '').trim()
  if (!ask) return NextResponse.json({ error: 'ask required' }, { status: 400 })

  const task = await createTask(ask, APOLLO_MODEL)
  if (!task) {
    return NextResponse.json({ live: false, id: null })
  }

  await runApollo(task.id, ask)
  return NextResponse.json({ live: true, id: task.id })
}
