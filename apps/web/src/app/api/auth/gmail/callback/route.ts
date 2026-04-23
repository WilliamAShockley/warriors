import { NextResponse } from 'next/server'
import { getOAuthClient } from '@/lib/gmail'
import { db } from '@/lib/db'
import { google } from 'googleapis'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect('http://localhost:5820/settings?gmail=error')
  }

  const client = getOAuthClient()
  const { tokens } = await client.getToken(code)
  client.setCredentials(tokens)

  // Get the user's email address
  const oauth2 = google.oauth2({ version: 'v2', auth: client })
  const userInfo = await oauth2.userinfo.get()

  await db.gmailToken.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      expiryDate: BigInt(tokens.expiry_date ?? 0),
      email: userInfo.data.email!,
    },
    update: {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token ?? '',
      expiryDate: BigInt(tokens.expiry_date ?? 0),
      email: userInfo.data.email!,
    },
  })

  return NextResponse.redirect('http://localhost:5820/settings?gmail=connected')
}
