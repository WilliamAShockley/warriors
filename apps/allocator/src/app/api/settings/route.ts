import { NextResponse } from 'next/server'
import { getConnectedAccount, getReaderName, setReaderName } from '@/lib/settings'

export async function GET() {
  const [name, account] = await Promise.all([getReaderName(), getConnectedAccount()])

  // The workspace's provisioned inbound address, when the deployment has
  // an inbound-mail domain wired up (INBOUND_EMAIL_DOMAIN).
  let inboundAddress: string | null = null
  const domain = (process.env.INBOUND_EMAIL_DOMAIN ?? '').trim()
  if (domain && process.env.DATABASE_URL) {
    try {
      const [{ rawDb }, { activeWorkspaceId, ensureAdopted }] = await Promise.all([
        import('@/lib/db'),
        import('@/lib/tenant'),
      ])
      await ensureAdopted()
      const ws = await rawDb.workspace.findUnique({ where: { id: await activeWorkspaceId() } })
      if (ws) inboundAddress = `task-${ws.inboundToken}@${domain}`
    } catch {}
  }

  return NextResponse.json({
    name,
    account,
    inboundAddress,
    live: Boolean(process.env.DATABASE_URL),
  })
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
