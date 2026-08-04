import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Access gate ported from apps/web/src/middleware.ts.

const PUBLIC_PATHS = new Set([
  '/login',
  '/api/auth/login',
  // Google's redirect lands here without our fetch context — must be open.
  // The start route (/api/auth/google) is NOT public: linking the account
  // is the reader's act, behind his session.
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

// Two doors, comma-separated lists in each:
// APP_PASSWORD        — the reader's own words: full access.
// APP_GUEST_PASSWORD  — guest words: the reading copy. Every page and GET
//                       opens; anything that writes, signs, or sends is
//                       refused at this gate, whatever the UI shows.
// Each word derives its own session token, so removing a word revokes that
// holder's sessions alone. (A password containing a comma is unsupported.)
const parseWords = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const appPasswords = () => parseWords(process.env.APP_PASSWORD)
const guestPasswords = () => parseWords(process.env.APP_GUEST_PASSWORD)

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
  const guests = guestPasswords()
  if (passwords.length === 0) {
    // Prod fails closed, like apps/web. Local dev without the var stays open
    // so the zero-env mock demo keeps working. Guest words alone never open
    // the app — the reader's own word must be configured first.
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse('APP_PASSWORD is not configured', { status: 503 })
    }
    return NextResponse.next()
  }

  // The reading copy: a guest may look at anything but touch nothing.
  // Every mutating API call dies here, whatever the UI happens to render.
  const guestGate = () => {
    // Linking a Google account rewires the mailbox — never a guest's to do,
    // GET though it is.
    const mutating =
      (req.method !== 'GET' && req.method !== 'HEAD') || pathname.startsWith('/api/auth/google')
    if (mutating && pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'The reading copy: look all you like — nothing signs, sends, or files.' },
        { status: 403 }
      )
    }
    return NextResponse.next()
  }

  // Bearer access for scripts / curl — the reader's words in full, a
  // guest's read-only.
  if (auth) {
    if (passwords.some((p) => auth === `Bearer ${p}`)) return NextResponse.next()
    if (guests.some((p) => auth === `Bearer ${p}`)) return guestGate()
  }

  const cookie = req.cookies.get('allocator_session')?.value
  if (cookie) {
    for (const p of passwords) {
      if (cookie === (await sessionToken(p))) return NextResponse.next()
    }
    for (const p of guests) {
      if (cookie === (await sessionToken(p))) return guestGate()
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
