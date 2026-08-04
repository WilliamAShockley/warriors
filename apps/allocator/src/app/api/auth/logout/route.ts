import { NextResponse } from 'next/server'

// Sign out: clear every session cookie and return to the gate.
export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL('/login', new URL(req.url).origin))
  for (const name of ['allocator_id', 'allocator_session', 'allocator_role']) {
    res.cookies.set(name, '', { path: '/', maxAge: 0 })
  }
  return res
}
