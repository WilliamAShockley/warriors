import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { google } from 'googleapis'
import { refreshNextStep } from '@/lib/refreshNextStep'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { targetId, to, subject, bodyText } = body

    if (!targetId || !to || !subject || !bodyText) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get Gmail token
    const token = await db.gmailToken.findUnique({ where: { id: 'singleton' } })
    if (!token) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 })
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )

    oauth2Client.setCredentials({
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
      expiry_date: Number(token.expiryDate),
    })

    // Check if token needs refresh
    const tokenInfo = await oauth2Client.getAccessToken()
    if (tokenInfo.token !== token.accessToken) {
      const creds = oauth2Client.credentials
      await db.gmailToken.update({
        where: { id: 'singleton' },
        data: {
          accessToken: creds.access_token!,
          refreshToken: creds.refresh_token ?? token.refreshToken,
          expiryDate: creds.expiry_date ?? 0,
        },
      })
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Build the raw RFC 2822 email
    const fromEmail = token.email
    const messageParts = [
      `From: ${fromEmail}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      '',
      bodyText,
    ]
    const rawMessage = messageParts.join('\r\n')

    // Base64url encode
    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    // Send via Gmail API
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    })

    // Log as activity
    const activity = await db.activity.create({
      data: {
        targetId,
        type: 'email',
        description: `Sent email: "${subject}" — ${bodyText.length > 120 ? bodyText.slice(0, 120) + '...' : bodyText}`,
        date: new Date(),
      },
    })

    // Update lastContacted
    await db.target.update({
      where: { id: targetId },
      data: { lastContacted: new Date() },
    })

    // Refresh next step in background
    refreshNextStep(targetId).catch(() => {})

    return NextResponse.json({ ok: true, activityId: activity.id })
  } catch (error: any) {
    console.error('Gmail send error:', error)
    return NextResponse.json(
      { error: error.message ?? 'Failed to send email' },
      { status: 500 }
    )
  }
}