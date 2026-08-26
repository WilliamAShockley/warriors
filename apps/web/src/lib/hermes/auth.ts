/**
 * Hermes — Simple API auth guard.
 * Allows same-origin browser requests and Bearer CRON_SECRET for external callers.
 * In dev mode (no secret set), all requests pass through.
 */

import { NextResponse } from 'next/server'

export function checkHermesAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) return null // dev mode

  // Allow same-origin requests from the frontend
  const origin = req.headers.get('origin')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (origin && appUrl && origin === appUrl) return null

  // External callers must provide Bearer token
  const auth = req.headers.get('authorization')
  if (auth === `Bearer ${secret}`) return null

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
