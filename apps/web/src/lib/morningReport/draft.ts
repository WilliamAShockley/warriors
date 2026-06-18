// Draft pass: for triaged items that can become a concrete action, generate
// the artifact with Claude Sonnet. Email/follow-up drafts are grounded in the
// user's actual inbox via Gmail search so they reference the real thread.

import { anthropic } from '@/lib/claude'
import { searchEmailsForContact, type GmailMessage } from '@/lib/gmail'
import type { OpenItem } from './aggregate'
import type { TriageResult } from './triage'

const DRAFT_MODEL = 'claude-sonnet-4-6'

export interface EmailDraftPayload {
  type: 'email' | 'follow_up'
  emailTo: string | null
  emailThreadId: string | null
  emailSubject: string
  emailBody: string
}

export interface CalendarDraftPayload {
  type: 'calendar'
  eventTitle: string
  eventStart: Date
  eventEnd: Date
  eventAttendees: string[]
  eventLocation: string | null
  eventDescription: string | null
}

export type DraftPayload = EmailDraftPayload | CalendarDraftPayload

function extractEmail(from: string): string | null {
  const m = from.match(/<([^>]+)>/)
  if (m) return m[1]
  const bare = from.match(/[\w.+-]+@[\w.-]+\.\w+/)
  return bare ? bare[0] : null
}

function extractJson(raw: string): any | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

async function findThreadContext(
  triage: TriageResult,
): Promise<{ messages: GmailMessage[]; latest: GmailMessage | null }> {
  if (!triage.contactName && !triage.contactEmail) {
    return { messages: [], latest: null }
  }
  try {
    const messages = await searchEmailsForContact(
      triage.contactName ?? triage.contactEmail ?? '',
      triage.contactEmail,
      8,
    )
    // Most recent first
    const sorted = [...messages].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )
    return { messages: sorted, latest: sorted[0] ?? null }
  } catch {
    return { messages: [], latest: null }
  }
}

async function draftEmail(
  item: OpenItem,
  triage: TriageResult,
): Promise<EmailDraftPayload | null> {
  const { messages, latest } = await findThreadContext(triage)

  const threadContext =
    messages.length > 0
      ? messages
          .slice(0, 5)
          .map((m) => `- ${m.date} | from ${m.from} | "${m.subject}": ${m.snippet}`)
          .join('\n')
      : 'No prior email thread found in the inbox for this contact.'

  const toEmail = triage.contactEmail ?? (latest ? extractEmail(latest.from) : null)

  const prompt = `You are drafting an email on behalf of a founder, based on a to-do item. Write a short, ready-to-send draft.

To-do item: "${item.text}"${item.context ? `\nContext: ${item.context}` : ''}
Contact: ${triage.contactName ?? toEmail ?? 'unknown'}
Type: ${triage.category === 'follow_up' ? 'follow-up / check-in' : 'reply or new message'}

Recent email thread with this contact (most recent first):
${threadContext}

RULES:
- Body: 2-5 sentences. Warm, direct, specific. Reference the real thread if one exists.
- If this is a follow-up and a thread exists, write it as a natural continuation.
- Subject: if replying to an existing thread, reuse it (add "Re: " if not present). Otherwise write a short specific subject.
- Do NOT invent facts that aren't supported by the to-do or the thread.
- Sign off with just a dash "—" (no placeholder name).
- Return ONLY JSON: {"subject":"...","body":"...","confident":true|false}
  Set "confident" to false if you lack the context to write a genuinely send-ready draft.`

  const message = await anthropic.messages.create({
    model: DRAFT_MODEL,
    max_tokens: 700,
    messages: [{ role: 'user', content: prompt }],
  })
  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  const parsed = extractJson(raw)
  if (!parsed || !parsed.subject || !parsed.body) return null

  return {
    type: triage.category === 'follow_up' ? 'follow_up' : 'email',
    emailTo: toEmail,
    emailThreadId: latest?.threadId ?? null,
    emailSubject: parsed.subject,
    emailBody: parsed.body,
  }
}

async function draftCalendar(
  item: OpenItem,
  triage: TriageResult,
): Promise<CalendarDraftPayload | null> {
  const nowIso = new Date().toISOString()
  const prompt = `You are turning a to-do into a proposed calendar event for a founder to review.

To-do item: "${item.text}"${item.context ? `\nContext: ${item.context}` : ''}
Contact (if any): ${triage.contactName ?? 'none'}${triage.contactEmail ? ` <${triage.contactEmail}>` : ''}
Current time (ISO): ${nowIso}

Propose a sensible default event. If no specific time is implied, pick the next business day at 10:00 in the user's apparent timezone offset from the current time, 30 minutes long. The user will edit before confirming.

Return ONLY JSON:
{"title":"...","startIso":"ISO-8601","endIso":"ISO-8601","attendees":["email", ...],"location":"... or null","description":"... or null"}
Only include attendee emails that literally appear in the item text.`

  const message = await anthropic.messages.create({
    model: DRAFT_MODEL,
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  })
  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  const parsed = extractJson(raw)
  if (!parsed || !parsed.title || !parsed.startIso || !parsed.endIso) return null

  const start = new Date(parsed.startIso)
  const end = new Date(parsed.endIso)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null

  return {
    type: 'calendar',
    eventTitle: parsed.title,
    eventStart: start,
    eventEnd: end,
    eventAttendees: Array.isArray(parsed.attendees)
      ? parsed.attendees.filter((a: unknown) => typeof a === 'string')
      : [],
    eventLocation: typeof parsed.location === 'string' ? parsed.location : null,
    eventDescription: typeof parsed.description === 'string' ? parsed.description : null,
  }
}

// Returns a draft payload for draftable categories, or null when the item is
// "manual" or we couldn't produce a usable draft.
export async function draftForItem(
  item: OpenItem,
  triage: TriageResult,
): Promise<DraftPayload | null> {
  try {
    if (triage.category === 'email_reply' || triage.category === 'follow_up') {
      return await draftEmail(item, triage)
    }
    if (triage.category === 'calendar') {
      return await draftCalendar(item, triage)
    }
    return null
  } catch (err) {
    console.error('draftForItem failed:', err)
    return null
  }
}
