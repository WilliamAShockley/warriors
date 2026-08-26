import { NextResponse } from 'next/server'
import { checkRunnerOrOperator } from '@/lib/horizon/runner-auth'
import { markTouchSent } from '@/lib/horizon/pipeline'

/**
 * Records a touch as sent: writes the Interaction row (the only runner-flow
 * path that does), advances the touch, schedules the next via nextActionAt.
 * Accepts the runner token or the operator session (manual fallback queue).
 */
export async function POST(req: Request, { params }: { params: Promise<{ touchId: string }> }) {
  const denied = await checkRunnerOrOperator(req)
  if (denied) return denied
  const { touchId } = await params
  const isRunner = (req.headers.get('authorization') ?? '').startsWith('Bearer ') &&
    req.headers.get('authorization') === `Bearer ${process.env.HORIZON_RUNNER_TOKEN}`
  try {
    await markTouchSent(touchId, isRunner ? 'runner' : 'manual', isRunner ? 'runner' : 'user')
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 409 })
  }
}
