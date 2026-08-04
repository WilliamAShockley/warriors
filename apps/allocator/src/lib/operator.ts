import crypto from 'node:crypto'

// Who counts as the operator — the person entitled to manage the
// circulation list (and, later, anything else instance-wide):
//  - a signed identity whose email is on OWNER_EMAILS, or
//  - a legacy password session minted from one of the reader's own
//    APP_PASSWORD words (never a guest word).

export const ownerEmails = () =>
  (process.env.OWNER_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

const readerWords = () =>
  (process.env.APP_PASSWORD ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const legacyToken = (word: string) =>
  crypto.createHash('sha256').update(`allocator-session:${word}`).digest('hex')

export async function isOperatorRequest(): Promise<boolean> {
  try {
    const { cookies } = await import('next/headers')
    const jar = await cookies()

    const identity = jar.get('allocator_id')?.value
    if (identity) {
      const { verifySession } = await import('./auth')
      const session = await verifySession(identity)
      if (session && session.role === 'reader' && ownerEmails().includes(session.email.toLowerCase()))
        return true
    }

    const legacy = jar.get('allocator_session')?.value
    if (legacy && readerWords().some((w) => legacyToken(w) === legacy)) return true

    // Bearer access with a reader word (scripts / curl).
    const { headers } = await import('next/headers')
    const auth = (await headers()).get('authorization')
    if (auth && readerWords().some((w) => auth === `Bearer ${w}`)) return true
  } catch {}
  return false
}
