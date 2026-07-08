import { db } from './db'
import { withRetry } from './retry'

const BASE_URL = 'https://public-api.granola.ai/v1'

type GranolaAttendee = { name?: string; email?: string }
type GranolaNote = {
  id: string
  title?: string
  summary?: string
  attendees?: GranolaAttendee[]
  calendar_event?: {
    event_title?: string
    scheduled_start_time?: string
    scheduled_end_time?: string
    invitees?: GranolaAttendee[]
    organiser?: GranolaAttendee
  }
  url?: string
  created_at?: string
}

async function granolaFetch(path: string): Promise<any> {
  const key = process.env.GRANOLA_API_KEY
  if (!key) throw new Error('GRANOLA_API_KEY is not configured')

  return withRetry(
    async () => {
      const res = await fetch(`${BASE_URL}${path}`, {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (res.status === 404) return null // note without a generated summary
      if (!res.ok) {
        // 429/5xx are retryable; withRetry's non-retryable filter passes them through
        throw new Error(`Granola ${res.status} on ${path}`)
      }
      return res.json()
    },
    { maxAttempts: 4, initialDelayMs: 1500, maxDelayMs: 15000 }
  )
}

export type GranolaSyncResult = { synced: number; skippedNoSummary: number; linked: number; skipped: boolean }

// Pull the last 7 days of notes. Sequential requests keep us comfortably
// under Granola's sustained 5 req/s limit.
export async function syncGranola(): Promise<GranolaSyncResult> {
  if (!process.env.GRANOLA_API_KEY) {
    return { synced: 0, skippedNoSummary: 0, linked: 0, skipped: true }
  }

  const createdAfter = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  let cursor: string | undefined
  let synced = 0
  let skippedNoSummary = 0

  do {
    const params = new URLSearchParams({ created_after: createdAfter })
    if (cursor) params.set('cursor', cursor)
    const page = await granolaFetch(`/notes?${params}`)
    if (!page) break

    const notes: GranolaNote[] = page.notes ?? page.data ?? []
    for (const note of notes) {
      if (!note.id) continue
      if (!note.summary) {
        skippedNoSummary++
        continue
      }

      const attendees = (note.attendees ?? [])
        .filter((a) => a.email || a.name)
        .map((a) => ({ name: a.name ?? '', email: a.email ?? '' }))

      const data = {
        title: note.title ?? '(untitled)',
        summary: note.summary,
        attendees: attendees.length ? JSON.stringify(attendees) : null,
        calendarEventTitle: note.calendar_event?.event_title ?? null,
        calendarEventStart: note.calendar_event?.scheduled_start_time
          ? new Date(note.calendar_event.scheduled_start_time)
          : null,
        noteUrl: note.url ?? null,
        raw: JSON.stringify(note),
        granolaCreatedAt: note.created_at ? new Date(note.created_at) : null,
      }
      await db.meetingNote.upsert({
        where: { id: note.id },
        create: { id: note.id, ...data },
        update: data,
      })
      synced++
    }

    cursor = page.cursor ?? page.next_cursor ?? undefined
  } while (cursor)

  const linked = await linkNotesToEvents()
  return { synced, skippedNoSummary, linked, skipped: false }
}

// Attach notes to calendar events: exact-ish title + start within ±15 min,
// else meaningful attendee-email overlap. Runs over unlinked notes each sync
// so late-arriving events still pick up their notes.
export async function linkNotesToEvents(): Promise<number> {
  const notes = await db.meetingNote.findMany({ where: { linkedEventId: null } })
  if (notes.length === 0) return 0
  const events = await db.calendarEvent.findMany()
  if (events.length === 0) return 0

  let linked = 0
  for (const note of notes) {
    const match =
      events.find(
        (ev) =>
          note.calendarEventTitle &&
          note.calendarEventStart &&
          ev.title.trim().toLowerCase() === note.calendarEventTitle.trim().toLowerCase() &&
          Math.abs(ev.start.getTime() - note.calendarEventStart.getTime()) <= 15 * 60 * 1000
      ) ?? events.find((ev) => attendeeOverlap(note.attendees, ev.attendees))

    if (match) {
      await db.meetingNote.update({ where: { id: note.id }, data: { linkedEventId: match.id } })
      linked++
    }
  }
  return linked
}

function attendeeOverlap(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  const emails = (json: string) =>
    new Set(
      (JSON.parse(json) as GranolaAttendee[])
        .map((x) => x.email?.toLowerCase())
        .filter((e): e is string => Boolean(e))
    )
  try {
    const setA = emails(a)
    const setB = emails(b)
    if (setA.size === 0 || setB.size === 0) return false
    const shared = [...setA].filter((e) => setB.has(e)).length
    return shared >= 2 || shared / Math.min(setA.size, setB.size) >= 0.5
  } catch {
    return false
  }
}
