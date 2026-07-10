import { NextResponse } from 'next/server'
import { getConnectedAccount, getReaderName, setReaderName } from '@/lib/settings'

export async function GET() {
  const [name, account] = await Promise.all([getReaderName(), getConnectedAccount()])
  return NextResponse.json({ name, account, live: Boolean(process.env.DATABASE_URL) })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const name = String(body?.name ?? '')
    .trim()
    .slice(0, 60)
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const ok = await setReaderName(name)
  return NextResponse.json({ ok, name })
}
