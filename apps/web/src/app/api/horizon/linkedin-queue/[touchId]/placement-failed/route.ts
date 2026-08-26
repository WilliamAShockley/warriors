import { NextResponse } from 'next/server'
import { checkRunnerAuth } from '@/lib/horizon/runner-auth'
import { markPlacementFailed } from '@/lib/horizon/pipeline'

/**
 * Body: { reason: string, screenshotRef?: string }
 * Returns the touch to the manual fallback queue. reason "checkpoint"
 * additionally pauses the mission's LinkedIn channel.
 */
export async function POST(req: Request, { params }: { params: Promise<{ touchId: string }> }) {
  const denied = checkRunnerAuth(req)
  if (denied) return denied
  const { touchId } = await params
  const body = await req.json().catch(() => ({}))
  const reason = String(body?.reason ?? 'unknown')
  try {
    await markPlacementFailed(touchId, reason, body?.screenshotRef)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 409 })
  }
}
