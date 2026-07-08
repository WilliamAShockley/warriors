import { NextResponse } from 'next/server'
import crypto from 'crypto'

export async function POST(req: Request) {
  const expected = process.env.APP_PASSWORD
  if (!expected) {
    return NextResponse.json({ error: 'APP_PASSWORD is not configured' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({}))
  const supplied = String(body?.password ?? '')

  const suppliedHash = crypto.createHash('sha256').update(supplied).digest()
  const expectedHash = crypto.createHash('sha256').update(expected).digest()
  if (!crypto.timingSafeEqual(suppliedHash, expectedHash)) {
    return NextResponse.json({ error: 'That is not the word.' }, { status: 401 })
  }

  // Must match the token derivation in src/middleware.ts.
  const token = crypto
    .createHash('sha256')
    .update(`allocator-session:${expected}`)
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
