import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Access gate ported from apps/web/src/middleware.ts.

const PUBLIC_PATHS = new Set([
  '/login',
  '/api/auth/login',
  // OAuth roundtrip must be reachable before a session exists
  '/api/auth/google',
  '/api/auth/google/callback',
  // PWA assets — home-screen install and the splash need these anonymously
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-icon.png',
])

// Vercel invokes these with `Authorization: Bearer ${CRON_SECRET}`; the
// routes themselves verify the secret again. The Apollo export shares the
// same bearer so traces can be pulled by script.
const CRON_PATHS = new Set(['/api/cron/brief', '/api/apollo/export'])

// APP_PASSWORD holds one word or several, comma-separated — the reader's
// own plus any guest words. Each derives its own session token, so
// removing a word from the list revokes that guest's sessions alone.
// (A password containing a comma is therefore unsupported.)
const appPasswords = () =>
  (process.env.APP_PASSWORD ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const cachedTokens = new Map<string, string>()

async function sessionToken(secret: string): Promise<string> {
  const cached = cachedTokens.get(secret)
  if (cached) return cached
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`allocator-session:${secret}`)
  )
  const token = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  cachedTokens.set(secret, token)
  return token
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next()

  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (CRON_PATHS.has(pathname) && cronSecret && auth === `Bearer ${cronSecret}`) {
    return NextResponse.next()
  }

  const passwords = appPasswords()
  if (passwords.length === 0) {
    // Prod fails closed, like apps/web. Local dev without the var stays open
    // so the zero-env mock demo keeps working.
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse('APP_PASSWORD is not configured', { status: 503 })
    }
    return NextResponse.next()
  }

  // Bearer access for scripts / curl — any of the words opens the door.
  if (auth && passwords.some((p) => auth === `Bearer ${p}`)) return NextResponse.next()

  const cookie = req.cookies.get('allocator_session')?.value
  if (cookie) {
    for (const p of passwords) {
      if (cookie === (await sessionToken(p))) return NextResponse.next()
    }
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.redirect(new URL('/login', req.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
