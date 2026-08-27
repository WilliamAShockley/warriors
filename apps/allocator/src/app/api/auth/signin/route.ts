import { NextResponse } from 'next/server'
import { google } from 'googleapis'

// Google sign-in, step one: hand the visitor to Google. Identity scopes
// only — connecting a mailbox stays a separate, deliberate act inside
// Settings. Uses the same Google OAuth app as the mailbox connection.
//
// The callback derives from the REQUEST's own origin — whatever domain
// the visitor is on is the domain Google is told to return to, so the
// only requirement is that each serving domain's callback is registered
// in the Google console (no NEXT_PUBLIC_APP_URL drift).

const callbackUrl = (req: Request) => {
  const url = new URL(req.url)
  // Behind Vercel's proxy the true host arrives in forwarded headers.
  const host = req.headers.get('x-forwarded-host') ?? url.host
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  return `${proto}://${host}/api/auth/signin/callback`
}

export async function GET(req: Request) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json({ error: 'Google sign-in is not configured' }, { status: 503 })
  }
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl(req)
  )
  const url = client.generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
  })
  return NextResponse.redirect(url)
}
