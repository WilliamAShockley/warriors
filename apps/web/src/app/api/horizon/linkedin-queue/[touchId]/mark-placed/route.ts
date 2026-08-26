import { NextResponse } from 'next/server'
import { checkRunnerAuth } from '@/lib/horizon/runner-auth'
import { markPlaced } from '@/lib/horizon/pipeline'

export async function POST(req: Request, { params }: { params: Promise<{ touchId: string }> }) {
  const denied = checkRunnerAuth(req)
  if (denied) return denied
  const { touchId } = await params
  try {
    await markPlaced(touchId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 409 })
  }
}
