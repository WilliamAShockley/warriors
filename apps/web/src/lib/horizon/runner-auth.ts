import { NextResponse } from 'next/server'

/**
 * Auth for the local LinkedIn placement runner. The runner is a credentialed
 * external client: it sends `Authorization: Bearer ${HORIZON_RUNNER_TOKEN}`.
 * These routes are exempted from the session-cookie middleware and enforce
 * this check themselves. Fails closed when no token is configured.
 */
export function checkRunnerAuth(req: Request): NextResponse | null {
  const token = process.env.HORIZON_RUNNER_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'HORIZON_RUNNER_TOKEN is not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') === `Bearer ${token}`) return null
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

/**
 * Auth accepting either the runner token OR the operator (session cookie /
 * app-password bearer). Used on endpoints shared by the runner and the manual
 * fallback queue UI (mark-sent, placement-failed). These paths bypass the
 * session middleware, so the cookie is re-verified here with the same
 * derivation as src/middleware.ts.
 */
export async function checkRunnerOrOperator(req: Request): Promise<NextResponse | null> {
  const auth = req.headers.get('authorization')
  const runnerToken = process.env.HORIZON_RUNNER_TOKEN
  if (runnerToken && auth === `Bearer ${runnerToken}`) return null

  const password = process.env.APP_PASSWORD
  if (!password) return NextResponse.json({ error: 'APP_PASSWORD is not configured' }, { status: 503 })
  if (auth === `Bearer ${password}`) return null

  const cookieHeader = req.headers.get('cookie') ?? ''
  const match = cookieHeader.match(/(?:^|;\s*)warriors_session=([^;]+)/)
  if (match) {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`warriors-session:${password}`)
    )
    const expected = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    if (match[1] === expected) return null
  }
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
