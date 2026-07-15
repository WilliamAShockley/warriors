import { google } from 'googleapis'

// The mail desk: search, read, and send from the reader's connected Gmail
// account — the same GoogleToken singleton that powers the calendar.
// Every function degrades to empty/null when the backend isn't configured
// or no account is connected.

const hasDb = () => Boolean(process.env.DATABASE_URL)

async function getGmail() {
  if (!hasDb()) return null
  try {
    const { getAuthedClient } = await import('./google')
    const client = await getAuthedClient()
    if (!client) return null
    return google.gmail({ version: 'v1', auth: client })
  } catch {
    return null
  }
}

export type GmailMessage = {
  id: string
  threadId: string
  subject: string
  from: string
  date: string
  snippet: string
}

export type GmailMessageFull = GmailMessage & { to: string; body: string }

export async function searchEmails(query: string, maxResults = 15): Promise<GmailMessage[]> {
  const gmail = await getGmail()
  if (!gmail) return []
  try {
    const listRes = await gmail.users.messages.list({ userId: 'me', q: query, maxResults })
    const messages = listRes.data.messages ?? []
    if (messages.length === 0) return []

    return await Promise.all(
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
  } catch {
    return []
  }
}

const decodeBody = (data: string) => Buffer.from(data, 'base64url').toString('utf8')

// Prefer text/plain anywhere in the part tree; fall back to de-tagged HTML.
function extractText(payload: any, mime: string): string {
  if (!payload) return ''
  if (payload.mimeType === mime && payload.body?.data) return decodeBody(payload.body.data)
  for (const part of payload.parts ?? []) {
    const text = extractText(part, mime)
    if (text) return text
  }
  return ''
}

export async function readEmail(id: string): Promise<GmailMessageFull | null> {
  const gmail = await getGmail()
  if (!gmail) return null
  try {
    const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
    const headers = msg.data.payload?.headers ?? []
    const get = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

    const body =
      extractText(msg.data.payload, 'text/plain') ||
      extractText(msg.data.payload, 'text/html')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    return {
      id: msg.data.id!,
      threadId: msg.data.threadId!,
      subject: get('Subject') || '(no subject)',
      from: get('From'),
      to: get('To'),
      date: get('Date'),
      snippet: msg.data.snippet ?? '',
      body: body.slice(0, 20_000),
    }
  } catch {
    return null
  }
}

export async function sendEmail(args: {
  to: string
  subject: string
  bodyText: string
  threadId?: string | null
}): Promise<{ id: string; threadId: string } | null> {
  const gmail = await getGmail()
  if (!gmail) return null
  try {
    const { db } = await import('./db')
    const token = await db.googleToken.findUnique({ where: { id: 'singleton' } })
    const fromEmail = token?.email ?? 'me'

    const messageParts = [
      `From: ${fromEmail}`,
      `To: ${args.to}`,
      `Subject: ${args.subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      args.bodyText,
    ]
    const encodedMessage = Buffer.from(messageParts.join('\r\n'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
        ...(args.threadId ? { threadId: args.threadId } : {}),
      },
    })
    return { id: res.data.id ?? '', threadId: res.data.threadId ?? '' }
  } catch {
    return null
  }
}
