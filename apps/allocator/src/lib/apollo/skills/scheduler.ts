import { anthropic } from '../../claude'
import { getSkillPrompt } from './store'

const SKILL_MODEL = process.env.APOLLO_SKILL_MODEL || process.env.APOLLO_MODEL || 'claude-opus-4-8'

// The reader's scheduling doctrine, verbatim — the skill's editable core.
// The calendar data itself arrives in the user message, freshly fetched,
// with EST/EDT labels computed in code so DST is never a model guess.
export const SCHEDULER_SYSTEM = `You are \${readerName}'s executive assistant for scheduling. When asked to propose meeting times, follow this process:

1. Check the calendar for the next 7–10 days, starting from tomorrow (or from a date specified in the request).
2. Identify open windows, applying these rules:
   - Only propose times during working hours: 9:00 AM – 5:30 PM Eastern, Monday–Friday, unless told otherwise.
   - Treat all calendar events as busy unless marked "free" or clearly a placeholder.
   - Leave a 15-minute buffer before and after existing meetings.
   - Prefer windows of at least 1 hour; never propose a window shorter than 30 minutes.
   - Don't propose times over lunch (12:00–1:00 PM) unless availability is tight.

3. Select windows across exactly 3 distinct days. The days do not need to be consecutive, but all 3 must fall within a 7-day span (10 days maximum if the calendar is tight). Favor spreading options across the week rather than clustering.

4. Present the times in exactly this format — bulleted list, M/D date, 12-hour times, timezone label:

   * 2/27 10:30 AM - 11:30 AM EST
   * 2/28 12:00 PM - 5:00 PM EST
   * 2/29 3:00 PM - 4:30 PM EST

   Offer one window per day (a longer block is fine if the day is wide open). Use EST or EDT correctly based on the date — the calendar data supplies the correct label; trust it.

5. If the meeting's length, purpose, or the other party's timezone is mentioned, factor that in: propose windows that comfortably fit the meeting length, and convert or dual-label times if the other party is in a different timezone.

6. If the calendar is too full to find 3 good days within 10 days, say so and show the best available options rather than silently breaking the rules.

Output only the proposed times (plus a one-line note if anything needs attention). Do not summarize the calendar or list existing meetings.

Hard rules that override everything above: the ONLY source of truth is the calendar data provided in the request — never invent, assume, or recall events. If the request says the calendar is unavailable, output exactly one line saying availability could not be checked, and no times.`

export const schedulerSkill = {
  id: 'scheduler',
  label: 'Scheduling',
  description:
    "The reader's executive-assistant scheduling doctrine — working hours, buffers, window sizes, and the exact format availability is offered in. Edit it here and the next proposal follows it.",
  whenToUse:
    'when a task or an email thread calls for proposing meeting times from the reader’s real calendar',
  defaultPrompt: SCHEDULER_SYSTEM,
} as const

export type ProposeTimesInput = {
  meetingLength?: string
  otherPartyTimezone?: string
  startDate?: string
  notes?: string
}

// Run the skill: fetch the live window, then let the doctrine pick times.
// A null window is "cannot know", never "free" — the skill must refuse.
export async function proposeTimes(
  input: ProposeTimesInput,
  readerName: string
): Promise<{ ok: boolean; text: string }> {
  const { getCalendarWindow } = await import('../../calendar')
  const window = await getCalendarWindow(10)

  if (window === null) {
    return {
      ok: false,
      text: 'The calendar could not be reached — availability was not checked, and no times were proposed.',
    }
  }

  const today = new Intl.DateTimeFormat('en-US', {
    timeZone: process.env.APP_TIMEZONE ?? 'America/New_York',
    weekday: 'long',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())

  const calendarBlock = window
    .map(
      (d) =>
        `${d.label}:\n${
          d.events.length
            ? d.events.map((e) => `  - ${e.time} · ${e.title}${e.free ? ' (marked free)' : ''}`).join('\n')
            : '  (no events)'
        }`
    )
    .join('\n')

  const particulars = [
    input.meetingLength ? `Meeting length: ${input.meetingLength}` : null,
    input.otherPartyTimezone ? `Other party's timezone: ${input.otherPartyTimezone}` : null,
    input.startDate ? `Start looking from: ${input.startDate}` : null,
    input.notes ? `Notes: ${input.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const template = await getSkillPrompt('scheduler', SCHEDULER_SYSTEM)
  const system = template.replaceAll('${readerName}', readerName)

  const response = await anthropic.messages.create({
    model: SKILL_MODEL,
    max_tokens: 600,
    system,
    messages: [
      {
        role: 'user',
        content: `Today is ${today}. Propose meeting times.\n${particulars ? `\n${particulars}\n` : ''}\nTHE CALENDAR, next 10 days (all times Eastern, labels are correct for the date):\n${calendarBlock}`,
      },
    ],
  } as any)

  const text = (response.content as any[])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()

  return { ok: Boolean(text), text: text || 'No proposal was produced.' }
}
