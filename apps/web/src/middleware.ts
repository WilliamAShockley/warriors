import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = new Set(['/login', '/api/auth/login'])

// Vercel invokes these with `Authorization: Bearer ${CRON_SECRET}`; the
// routes themselves verify the secret again.
const CRON_PATHS = new Set(['/api/agents/cron', '/api/hermes/cron', '/api/horizon/cron'])

// Credentialed external clients (LinkedIn placement runner, email sequencer
// webhooks) can't carry the session cookie; these routes enforce their own
// token auth (see src/lib/horizon/runner-auth.ts / email-webhook route).
const SELF_AUTH_PREFIXES = ['/api/horizon/linkedin-queue', '/api/horizon/email-webhook']

let cachedSession: { secret: string; token: string } | null = null

async function sessionToken(secret: string): Promise<string> {
  if (cachedSession?.secret === secret) return cachedSession.token
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`warriors-session:${secret}`)
  )
  const token = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  cachedSession = { secret, token }
  return token
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next()

  if (SELF_AUTH_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (CRON_PATHS.has(pathname) && cronSecret && auth === `Bearer ${cronSecret}`) {
    return NextResponse.next()
  }

  const password = process.env.APP_PASSWORD
  if (!password) {
    // Fail closed: never expose the app because the gate is unconfigured.
    return new NextResponse('APP_PASSWORD is not configured', { status: 503 })
  }

  // Bearer access for scripts / curl.
  if (auth === `Bearer ${password}`) return NextResponse.next()

  const expected = await sessionToken(password)
  if (req.cookies.get('warriors_session')?.value === expected) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.redirect(new URL('/login', req.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
