import { NextResponse } from 'next/server'
import { checkRunnerAuth } from '@/lib/horizon/runner-auth'
import { claimNextTouch } from '@/lib/horizon/pipeline'

/**
 * Runner contract: GET /api/linkedin-queue/next?missionId=...
 * Returns the next approved, due, queued LinkedIn touch and atomically claims
 * it (queued -> claimed). 204 when the queue is empty. See RUNNER.md.
 */
export async function GET(req: Request) {
  const denied = checkRunnerAuth(req)
  if (denied) return denied
  const url = new URL(req.url)
  const missionId = url.searchParams.get('missionId') ?? undefined
  const touch = await claimNextTouch(missionId)
  if (!touch) return new NextResponse(null, { status: 204 })
  return NextResponse.json(touch)
}
