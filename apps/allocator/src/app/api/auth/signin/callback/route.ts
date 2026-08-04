import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { rawDb } from '@/lib/db'
import { signSession } from '@/lib/auth'
import { ensureAdopted, PRIMARY_WORKSPACE } from '@/lib/tenant'

// Google sign-in, step two: Google lands back here. The allowlist decides
// what the email gets:
//   OWNER_EMAILS   — the reader himself: full access to the primary
//                    workspace (the original desk, with all its history).
//   ALLOWED_EMAILS — an invited guest of the software: their OWN fresh
//                    workspace, entirely separate from everyone else's.
// Anyone else authenticates fine with Google and is politely refused.
// Both variables are comma-separated; matching is case-insensitive.

const parseEmails = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

const callbackUrl = () =>
  `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5821'}/api/auth/signin/callback`

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/login?error=signin', origin))

  try {
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      callbackUrl()
    )
    const { tokens } = await client.getToken(code)
    client.setCredentials(tokens)
    const info = await google.oauth2({ version: 'v2', auth: client }).userinfo.get()
    const email = (info.data.email ?? '').toLowerCase()
    const name = info.data.name ?? null
    if (!email) return NextResponse.redirect(new URL('/login?error=signin', origin))

    const owners = parseEmails(process.env.OWNER_EMAILS)
    const invited = parseEmails(process.env.ALLOWED_EMAILS)
    const isOwner = owners.includes(email)
    if (!isOwner && !invited.includes(email)) {
      return NextResponse.redirect(new URL('/login?error=uninvited', origin))
    }

    await ensureAdopted()
    let user = await rawDb.user.findUnique({ where: { email } })
    if (!user) {
      // The owner's identity attaches to the original desk; an invited
      // email gets a fresh workspace of its own.
      const workspaceId = isOwner
        ? PRIMARY_WORKSPACE
        : (await rawDb.workspace.create({ data: { name: name ? `${name}'s Desk` : 'The Desk' } })).id
      user = await rawDb.user.create({ data: { email, name, workspaceId } })
    }

    const token = await signSession({
      userId: user.id,
      workspaceId: user.workspaceId,
      email,
      role: 'reader',
    })
    const res = NextResponse.redirect(new URL('/', origin))
    const secure = process.env.NODE_ENV === 'production'
    res.cookies.set('allocator_id', token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
    res.cookies.set('allocator_role', 'reader', {
      httpOnly: false,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
    return res
  } catch {
    return NextResponse.redirect(new URL('/login?error=signin', origin))
  }
}
