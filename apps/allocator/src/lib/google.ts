import { google } from 'googleapis'
import { db } from './db'

// OAuth plumbing copied from apps/web/src/lib/gmail.ts. One Google account
// powers the whole desk: calendar reads for the Brief, Gmail read/send for
// the mail desk. Adding a scope means reconnecting at /api/auth/google.

function getCallbackUrl() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5821'
  return `${base}/api/auth/google/callback`
}

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getCallbackUrl()
  )
}

export function getAuthUrl(state: string) {
  const client = getOAuthClient()
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    state,
    scope: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  })
}

export async function getAuthedClient() {
  const token = await db.googleToken.findUnique({ where: { id: 'singleton' } })
  if (!token) return null

  const client = getOAuthClient()
  client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: Number(token.expiryDate),
  })

  // Auto-refresh if expired
  client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await db.googleToken.update({
        where: { id: 'singleton' },
        data: {
          accessToken: tokens.access_token,
          expiryDate: tokens.expiry_date ?? 0,
        },
      })
    }
  })

  return client
}
