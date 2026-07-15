import { NextResponse, type NextRequest } from 'next/server'
import { google } from 'googleapis'
import { getOAuthClient } from '@/lib/google'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5821'

  const expectedState = req.cookies.get('google_oauth_state')?.value
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(`${appUrl}/settings?google=error`)
  }

  const client = getOAuthClient()
  const { tokens } = await client.getToken(code)
  client.setCredentials(tokens)

  const oauth2 = google.oauth2({ version: 'v2', auth: client })
  const userInfo = await oauth2.userinfo.get()

  await db.googleToken.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      expiryDate: tokens.expiry_date ?? 0,
      email: userInfo.data.email!,
    },
    update: {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token ?? '',
      expiryDate: tokens.expiry_date ?? 0,
      email: userInfo.data.email!,
    },
  })

  const res = NextResponse.redirect(`${appUrl}/settings?google=connected`)
  res.cookies.delete('google_oauth_state')
  return res
}
