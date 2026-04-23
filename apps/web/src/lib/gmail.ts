import { google } from 'googleapis'
import { db } from './db'

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'http://localhost:5820/api/auth/gmail/callback'
  )
}

export function getAuthUrl() {
  const client = getOAuthClient()
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  })
}

export async function getAuthedClient() {
  const token = await db.gmailToken.findUnique({ where: { id: 'singleton' } })
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
      await db.gmailToken.update({
        where: { id: 'singleton' },
        data: {
          accessToken: tokens.access_token,
          expiryDate: BigInt(tokens.expiry_date ?? 0),
        },
      })
    }
  })

  return client
}

export type GmailMessage = {
  id: string
  threadId: string
  subject: string
  from: string
  date: string
  snippet: string
}

export async function searchEmailsForContact(
  nameOrEmail: string,
  email?: string | null,
  maxResults = 15
): Promise<GmailMessage[]> {
  const client = await getAuthedClient()
  if (!client) return []

  const gmail = google.gmail({ version: 'v1', auth: client })
  const query = email ? `from:${email} OR to:${email}` : `"${nameOrEmail}"`

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults,
  })

  const messages = listRes.data.messages ?? []
  if (messages.length === 0) return []

  const details = await Promise.all(
    messages.map(async (m) => {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id: m.id!,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date'],
      })
      const headers = msg.data.payload?.headers ?? []
      const get = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

      return {
        id: m.id!,
        threadId: m.threadId!,
        subject: get('Subject') || '(no subject)',
        from: get('From'),
        date: get('Date'),
        snippet: msg.data.snippet ?? '',
      }
    })
  )

  return details
}

export async function fetchAllEmailsForContact(
  nameOrEmail: string,
  email?: string | null
): Promise<GmailMessage[]> {
  const client = await getAuthedClient()
  if (!client) return []

  const gmail = google.gmail({ version: 'v1', auth: client })
  const query = email ? `from:${email} OR to:${email}` : `"${nameOrEmail}"`

  // Paginate through all results
  const allMessages: { id: string; threadId: string }[] = []
  let pageToken: string | undefined = undefined

  do {
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 500,
      pageToken,
    }) as { data: { messages?: { id?: string | null; threadId?: string | null }[]; nextPageToken?: string | null } }
    const msgs = listRes.data.messages ?? []
    allMessages.push(...msgs.map((m) => ({ id: m.id!, threadId: m.threadId! })))
    pageToken = listRes.data.nextPageToken ?? undefined
  } while (pageToken)

  if (allMessages.length === 0) return []

  // Fetch metadata in parallel batches of 20
  const BATCH = 20
  const results: GmailMessage[] = []
  for (let i = 0; i < allMessages.length; i += BATCH) {
    const batch = allMessages.slice(i, i + BATCH)
    const details = await Promise.all(
      batch.map(async (m) => {
        const msg = await gmail.users.messages.get({
          userId: 'me',
          id: m.id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date'],
        })
        const headers = msg.data.payload?.headers ?? []
        const get = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

        return {
          id: m.id,
          threadId: m.threadId,
          subject: get('Subject') || '(no subject)',
          from: get('From'),
          date: get('Date'),
          snippet: msg.data.snippet ?? '',
        }
      })
    )
    results.push(...details)
  }

  return results
}
