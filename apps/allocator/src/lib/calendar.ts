import { google } from 'googleapis'
import { db } from './db'
import { getAuthedClient } from './google'

const TZ = process.env.APP_TIMEZONE ?? 'America/New_York'

// YYYY-MM-DD of a moment, in the reader's timezone (en-CA formats as ISO).
export function localDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

function offsetAt(d: Date): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(d)
    .find((p) => p.type === 'timeZoneName')!.value
  return name === 'GMT' ? '+00:00' : name.slice(3) // 'GMT-04:00' → '-04:00'
}

// UTC instant of local midnight in TZ. Two passes so the offset is taken at
// the midnight itself, not at some other point of a DST-transition day.
export function zonedMidnight(dateStr: string): Date {
  let guess = new Date(`${dateStr}T00:00:00Z`)
  for (let i = 0; i < 2; i++) {
    guess = new Date(`${dateStr}T00:00:00${offsetAt(guess)}`)
  }
  return guess
}

export type CalendarSyncResult = { day: string; synced: number; skipped: boolean }

// Sync one local day's events (default: tomorrow) into calendar_events.
// Upserts by Google event id, so re-syncs absorb edits without duplicating.
export async function syncCalendar(targetDay?: string): Promise<CalendarSyncResult> {
  const day = targetDay ?? addDays(localDateString(), 1)
  const client = await getAuthedClient()
  if (!client) return { day, synced: 0, skipped: true }

  const timeMin = zonedMidnight(day)
  const timeMax = zonedMidnight(addDays(day, 1))

  const calendar = google.calendar({ version: 'v3', auth: client })
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true, // expands recurring events into instances with unique ids
    orderBy: 'startTime',
    maxResults: 50,
  })

  let synced = 0
  for (const ev of res.data.items ?? []) {
    if (!ev.id || ev.status === 'cancelled' || !ev.start) continue

    // All-day events carry `date` (no `dateTime`); pin them to local midnight.
    const allDay = Boolean(ev.start.date && !ev.start.dateTime)
    const start = ev.start.dateTime ? new Date(ev.start.dateTime) : zonedMidnight(ev.start.date!)
    const end = ev.end?.dateTime
      ? new Date(ev.end.dateTime)
      : zonedMidnight(ev.end?.date ?? addDays(ev.start.date!, 1))

    const attendees = (ev.attendees ?? [])
      .filter((a) => !a.resource && a.email)
      .map((a) => ({ name: a.displayName ?? '', email: a.email! }))

    const data = {
      title: ev.summary ?? '(untitled)',
      start,
      end,
      allDay,
      location: ev.location ?? null,
      attendees: attendees.length ? JSON.stringify(attendees) : null,
      description: ev.description ?? null,
      source: 'google',
    }
    await db.calendarEvent.upsert({
      where: { id: ev.id },
      create: { id: ev.id, ...data },
      update: data,
    })
    synced++
  }

  return { day, synced, skipped: false }
}

// ————————————————————————————————— The scheduling window

// A LIVE read of the next N days, straight from Google — the synced table
// only ever holds the Brief's single day, which must never be mistaken
// for an open week. Returns null when the calendar is unreachable, which
// callers must treat as "cannot know", never as "free".
export type WindowDay = { label: string; events: { time: string; title: string; free: boolean }[] }

const dayFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  weekday: 'long',
  month: 'numeric',
  day: 'numeric',
})
const timeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZoneName: 'short',
})

export async function getCalendarWindow(days = 10): Promise<WindowDay[] | null> {
  try {
    const client = await getAuthedClient()
    if (!client) return null

    const start = addDays(localDateString(), 1)
    const timeMin = zonedMidnight(start)
    const timeMax = zonedMidnight(addDays(start, days))

    const calendar = google.calendar({ version: 'v3', auth: client })
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    })

    // Every day appears, busy or empty — an absent day is not an open day.
    const byLabel = new Map<string, WindowDay>()
    for (let i = 0; i < days; i++) {
      const d = zonedMidnight(addDays(start, i))
      byLabel.set(dayFmt.format(d), { label: dayFmt.format(d), events: [] })
    }

    for (const ev of res.data.items ?? []) {
      if (ev.status === 'cancelled' || !ev.start) continue
      const isAllDay = Boolean(ev.start.date && !ev.start.dateTime)
      const startAt = new Date(ev.start.dateTime ?? `${ev.start.date}T12:00:00Z`)
      const day = byLabel.get(dayFmt.format(startAt))
      if (!day) continue
      const time = isAllDay
        ? 'All day'
        : `${timeFmt.format(startAt)} – ${ev.end?.dateTime ? timeFmt.format(new Date(ev.end.dateTime)) : '?'}`
      day.events.push({
        time,
        title: ev.summary ?? '(untitled)',
        free: ev.transparency === 'transparent',
      })
    }
    return [...byLabel.values()]
  } catch {
    return null
  }
}
