import { NextResponse } from 'next/server'
import { google } from 'googleapis'

// Google sign-in, step one: hand the visitor to Google. Identity scopes
// only — connecting a mailbox stays a separate, deliberate act inside
// Settings. Uses the same Google OAuth app as the mailbox connection;
// this route's callback URL must be registered alongside the other one.

const callbackUrl = () =>
  `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5821'}/api/auth/signin/callback`

export async function GET() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json({ error: 'Google sign-in is not configured' }, { status: 503 })
  }
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl()
  )
  const url = client.generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
  })
  return NextResponse.redirect(url)
}
