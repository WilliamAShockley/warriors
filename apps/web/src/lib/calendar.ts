// Google Calendar event creation for the Morning Report autonomy pipeline.
//
// NOTE: requires the `calendar.events` OAuth scope. It was added to the auth
// request in lib/gmail.ts, but an existing Gmail connection was authorized
// before that scope existed — reconnect Gmail once to grant it. Until then,
// calendar execution fails gracefully with a clear message.

import { google } from 'googleapis'
import { getAuthedClient } from './gmail'

export async function createCalendarEvent(args: {
  title: string
  start: Date
  end: Date
  attendees?: string[]
  location?: string | null
  description?: string | null
}): Promise<{ id: string; htmlLink: string }> {
  const client = await getAuthedClient()
  if (!client) throw new Error('Gmail not connected')

  const calendar = google.calendar({ version: 'v3', auth: client })

  try {
    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: args.title,
        location: args.location ?? undefined,
        description: args.description ?? undefined,
        start: { dateTime: args.start.toISOString() },
        end: { dateTime: args.end.toISOString() },
        attendees: args.attendees?.map((email) => ({ email })),
      },
    })
    return { id: res.data.id ?? '', htmlLink: res.data.htmlLink ?? '' }
  } catch (err: any) {
    const msg: string = err?.message ?? ''
    if (msg.includes('insufficient') || msg.includes('scope') || msg.includes('Insufficient Permission')) {
      throw new Error(
        'Calendar permission not granted. Reconnect Gmail to authorize calendar access.',
      )
    }
    throw err
  }
}
