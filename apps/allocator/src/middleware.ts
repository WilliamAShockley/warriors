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

let cachedSession: { secret: string; token: string } | null = null

async function sessionToken(secret: string): Promise<string> {
  if (cachedSession?.secret === secret) return cachedSession.token
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`allocator-session:${secret}`)
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

  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (CRON_PATHS.has(pathname) && cronSecret && auth === `Bearer ${cronSecret}`) {
    return NextResponse.next()
  }

  const password = process.env.APP_PASSWORD
  if (!password) {
    // Prod fails closed, like apps/web. Local dev without the var stays open
    // so the zero-env mock demo keeps working.
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse('APP_PASSWORD is not configured', { status: 503 })
    }
    return NextResponse.next()
  }

  // Bearer access for scripts / curl.
  if (auth === `Bearer ${password}`) return NextResponse.next()

  const expected = await sessionToken(password)
  if (req.cookies.get('allocator_session')?.value === expected) {
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
