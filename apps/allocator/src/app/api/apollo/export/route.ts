import { NextResponse, type NextRequest } from 'next/server'
import { exportTasks } from '@/lib/apollo/store'

// The dataset: every task's ask, full trace, result, and reader verdict as
// JSONL — the raw material for the eventual fine-tune.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const jsonl = await exportTasks()
  return new NextResponse(jsonl, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Content-Disposition': 'attachment; filename="apollo-traces.jsonl"',
    },
  })
}
