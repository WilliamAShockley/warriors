import { NextResponse } from 'next/server'
import crypto from 'crypto'

export async function POST(req: Request) {
  // APP_PASSWORD holds one word or several, comma-separated — the reader's
  // own plus any guest words. The session token derives from the matched
  // word, so dropping a word from the list revokes those sessions alone.
  const passwords = (process.env.APP_PASSWORD ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (passwords.length === 0) {
    return NextResponse.json({ error: 'APP_PASSWORD is not configured' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({}))
  const supplied = String(body?.password ?? '')

  const suppliedHash = crypto.createHash('sha256').update(supplied).digest()
  const matched = passwords.find((p) =>
    crypto.timingSafeEqual(suppliedHash, crypto.createHash('sha256').update(p).digest())
  )
  if (!matched) {
    return NextResponse.json({ error: 'That is not the word.' }, { status: 401 })
  }

  // Must match the token derivation in src/middleware.ts.
  const token = crypto
    .createHash('sha256')
    .update(`allocator-session:${matched}`)
    .digest('hex')

  const res = NextResponse.json({ ok: true })
  res.cookies.set('allocator_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
