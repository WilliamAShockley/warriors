import { NextResponse } from 'next/server'
import { rawDb } from '@/lib/db'
import { isOperatorRequest, ownerEmails } from '@/lib/operator'

// The Circulation List. Signup is self-serve by default — anyone who
// signs in gets a desk — so this list only BINDS when the instance runs
// closed (INVITE_ONLY=true). Operator-only, managed from Settings; the
// ALLOWED_EMAILS variable still works as a bootstrap union.

const hasDb = () => Boolean(process.env.DATABASE_URL)
const normalize = (v: unknown) => String(v ?? '').trim().toLowerCase()
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

export async function GET() {
  if (!(await isOperatorRequest())) {
    return NextResponse.json({ error: 'the circulation list is the operator’s' }, { status: 403 })
  }
  if (!hasDb()) return NextResponse.json({ live: false, invites: [] })
  try {
    const [invites, users] = await Promise.all([
      rawDb.invite.findMany({ orderBy: { createdAt: 'asc' } }),
      rawDb.user.findMany({ select: { email: true } }),
    ])
    const signedIn = new Set(users.map((u) => u.email.toLowerCase()))
    return NextResponse.json({
      live: true,
      inviteOnly: process.env.INVITE_ONLY === 'true',
      owners: ownerEmails(),
      invites: invites.map((i) => ({
        id: i.id,
        email: i.email,
        signedIn: signedIn.has(i.email.toLowerCase()),
      })),
    })
  } catch {
    return NextResponse.json({ live: false, invites: [] })
  }
}

// { email } invites; { email, remove: true } strikes the invitation.
// Striking an email bars future sign-ins; a workspace already opened
// stays (its data is theirs) but its owner can no longer authenticate
// unless re-invited.
export async function POST(req: Request) {
  if (!(await isOperatorRequest())) {
    return NextResponse.json({ error: 'the circulation list is the operator’s' }, { status: 403 })
  }
  if (!hasDb()) return NextResponse.json({ error: 'no database' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const email = normalize(body?.email)
  if (!looksLikeEmail(email)) {
    return NextResponse.json({ error: 'a real email address is required' }, { status: 400 })
  }

  try {
    if (body?.remove === true) {
      await rawDb.invite.deleteMany({ where: { email } })
      return NextResponse.json({ ok: true })
    }
    const invite = await rawDb.invite.upsert({
      where: { email },
      create: { email },
      update: {},
    })
    return NextResponse.json({ ok: true, invite: { id: invite.id, email: invite.email } })
  } catch {
    return NextResponse.json({ error: 'could not amend the list' }, { status: 500 })
  }
}
