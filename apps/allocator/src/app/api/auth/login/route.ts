import { NextResponse } from 'next/server'
import crypto from 'crypto'

const parseWords = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

export async function POST(req: Request) {
  // APP_PASSWORD holds the reader's words (full access); APP_GUEST_PASSWORD
  // holds guest words (the reading copy — every write refused at the gate).
  // The session token derives from the matched word, so dropping a word
  // from either list revokes those sessions alone.
  const passwords = parseWords(process.env.APP_PASSWORD)
  const guests = parseWords(process.env.APP_GUEST_PASSWORD)
  if (passwords.length === 0) {
    return NextResponse.json({ error: 'APP_PASSWORD is not configured' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({}))
  const supplied = String(body?.password ?? '')

  const suppliedHash = crypto.createHash('sha256').update(supplied).digest()
  const matches = (p: string) =>
    crypto.timingSafeEqual(suppliedHash, crypto.createHash('sha256').update(p).digest())
  const matched = passwords.find(matches) ?? guests.find(matches)
  if (!matched) {
    return NextResponse.json({ error: 'That is not the word.' }, { status: 401 })
  }
  const isGuest = !passwords.some(matches)

  // Must match the token derivation in src/middleware.ts.
  const token = crypto
    .createHash('sha256')
    .update(`allocator-session:${matched}`)
    .digest('hex')

  const res = NextResponse.json({ ok: true, role: isGuest ? 'guest' : 'reader' })
  res.cookies.set('allocator_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  // Cosmetic only — lets the UI show the reading-copy notice. The real
  // enforcement is the middleware matching the session token to its list.
  res.cookies.set('allocator_role', isGuest ? 'guest' : 'reader', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
