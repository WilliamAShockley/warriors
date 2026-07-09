import { db } from './db'
import { anthropic } from './claude'
import { parseLLMJsonObject } from './retry'
import { addDays, localDateString, zonedMidnight } from './calendar'
import { briefLead as mockLead, briefItems as mockItems } from './data'
import { yesterdaysMargin } from './margin'
import { openTodosPreview } from './todos'

const TZ = process.env.APP_TIMEZONE ?? 'America/New_York'

export type ScheduleEntry = {
  eventId: string
  time: string // verbatim display time, computed here — never by the model
  title: string
  location: string | null
  attendees: string[] // display names
  prep: string | null // one editorial line from Claude
  noteUrl: string | null
}

export type RecallCue = { cue: string; source: string }

export type AssembleResult = {
  date: string
  events: number
  notesUsed: number
  recallCues: number
  skipped: boolean
}

function displayTime(d: Date, allDay: boolean): string {
  if (allDay) return 'All day'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

function names(json: string | null): string[] {
  if (!json) return []
  try {
    return (JSON.parse(json) as { name: string; email: string }[])
      .map((a) => a.name || a.email)
      .filter(Boolean)
  } catch {
    return []
  }
}

// Assemble the morning edition: tomorrow's schedule with prep notes drawn
// from Granola, in the Brief's editorial voice. Upserts one BriefEdition row
// per local date, so re-runs overwrite rather than duplicate.
export async function assembleBrief(): Promise<AssembleResult> {
  const today = localDateString()
  const tomorrow = addDays(today, 1)

  const events = await db.calendarEvent.findMany({
    where: { start: { gte: zonedMidnight(tomorrow), lt: zonedMidnight(addDays(tomorrow, 1)) } },
    orderBy: { start: 'asc' },
    include: { notes: true },
  })
  const marginEntries = await yesterdaysMargin()
  const openDocket = await openTodosPreview(8)

  if (events.length === 0 && marginEntries.length === 0) {
    return { date: today, events: 0, notesUsed: 0, recallCues: 0, skipped: true }
  }

  // Context per event: its linked notes, plus recent notes sharing attendees.
  const recentNotes = await db.meetingNote.findMany({
    orderBy: { granolaCreatedAt: 'desc' },
    take: 40,
  })

  let notesUsed = 0
  const eventContexts = events.map((ev) => {
    const evEmails = new Set(
      names(ev.attendees).length
        ? (JSON.parse(ev.attendees!) as { email: string }[]).map((a) => a.email?.toLowerCase())
        : []
    )
    const related = recentNotes.filter(
      (n) =>
        n.linkedEventId === ev.id ||
        (n.attendees &&
          (JSON.parse(n.attendees) as { email: string }[]).some((a) =>
            evEmails.has(a.email?.toLowerCase())
          ))
    )
    notesUsed += related.length
    return {
      id: ev.id,
      title: ev.title,
      time: displayTime(ev.start, ev.allDay),
      attendees: names(ev.attendees),
      description: ev.description?.slice(0, 300) ?? null,
      priorNotes: related.slice(0, 3).map((n) => ({
        title: n.title,
        date: n.granolaCreatedAt?.toISOString().slice(0, 10) ?? null,
        summary: n.summary.slice(0, 1200),
      })),
    }
  })

  // Register examples so the model writes in the app's voice.
  const registerExamples = [mockLead.headline, ...mockItems.slice(0, 2).map((i) => i.headline)]

  const prompt = `You are the analyst behind "The Allocator", a private morning brief for a solo alternative-asset fund manager. Your voice: precise, financially literate, quietly witty. Never breathless, never hype, no emoji, no exclamation marks. Headlines read like the FT, not a startup changelog. Examples of the register:
${registerExamples.map((h) => `- ${h}`).join('\n')}

Tomorrow's calendar, with prior meeting notes where they exist:
${JSON.stringify(eventContexts, null, 2)}

The open docket (the reader's standing to-dos):
${openDocket.length ? openDocket.map((t) => `- [${t.group}] ${t.text}`).join('\n') : '- (empty)'}

What the reader filed in the margin yesterday — thoughts and things learned:
${marginEntries.length ? marginEntries.map((m) => `- ${m}`).join('\n') : '- (nothing)'}

Write JSON with exactly this shape:
{
  "lead": { "eyebrow": "The Lead · Schedule", "headline": "...", "dek": "...", "body": ["...", "..."], "source": "From the desk · calendar and filed notes" },
  "items": [ { "eyebrow": "...", "headline": "...", "dek": "...", "source": "..." } ],
  "preps": { "<eventId>": "one-line prep note" },
  "recall": [ { "cue": "...", "source": "The Margin · yesterday" } ]
}

Rules:
- "lead": the single most important thing about tomorrow (the day's shape, the meeting that matters most, a docket deadline colliding with the calendar, or a conflict worth noticing). Two short body paragraphs.
- "items": 2-4 digest entries drawn from the schedule, the docket, and prior notes — open threads, things promised last time, patterns across meetings. Eyebrows are short small-caps labels like "Follow Up" or "Worth Rereading".
- "preps": for EVERY event id, one line. Where prior notes exist, surface the sharpest carry-over (an unresolved question, an action item mentioned in the summary, what was agreed). Where none exist, one useful orienting line. Extract action items from the note summaries yourself.
- "recall": the reader retains information by reciting it. From yesterday's margin entries, write 1-3 recital cues — imperatives that make them reproduce the substance from memory ("Recite the mechanism by which…", "State the three reasons you noted for…"). Test the idea, not the wording. If the margin was empty, return [].
- Do not invent facts not present in the data. Do not restate times or attendee lists in preps — the schedule shows those already.
Return only the JSON.`

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const parsed = parseLLMJsonObject<{
    lead: typeof mockLead | null
    items: typeof mockItems
    preps: Record<string, string>
    recall: RecallCue[]
  }>(text, { lead: null, items: [], preps: {}, recall: [] })

  if (!parsed.lead) throw new Error('Brief assembly: model returned unparseable output')
  const recall = Array.isArray(parsed.recall) ? parsed.recall.slice(0, 3) : []

  // Schedule is built from the database, not the model — times and titles verbatim.
  const schedule: ScheduleEntry[] = events.map((ev) => ({
    eventId: ev.id,
    time: displayTime(ev.start, ev.allDay),
    title: ev.title,
    location: ev.location,
    attendees: names(ev.attendees),
    prep: parsed.preps[ev.id] ?? null,
    noteUrl: ev.notes[0]?.noteUrl ?? null,
  }))

  await db.briefEdition.upsert({
    where: { date: today },
    create: {
      date: today,
      leadJson: JSON.stringify(parsed.lead),
      itemsJson: JSON.stringify(parsed.items),
      scheduleJson: JSON.stringify(schedule),
      recallJson: JSON.stringify(recall),
    },
    update: {
      leadJson: JSON.stringify(parsed.lead),
      itemsJson: JSON.stringify(parsed.items),
      scheduleJson: JSON.stringify(schedule),
      recallJson: JSON.stringify(recall),
      generatedAt: new Date(),
    },
  })

  return { date: today, events: events.length, notesUsed, recallCues: recall.length, skipped: false }
}
