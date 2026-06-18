// Execute an approved/auto ActionDraft: actually send the email or create the
// calendar event. Marks the draft executed/failed and returns a summary.

import { db } from '@/lib/db'
import { sendEmail } from '@/lib/gmail'
import { createCalendarEvent } from '@/lib/calendar'
import type { ActionDraft } from '@prisma/client'

export interface ExecutionOutcome {
  ok: boolean
  result: string
}

export async function executeDraft(
  draft: ActionDraft,
  opts: { auto: boolean } = { auto: false },
): Promise<ExecutionOutcome> {
  try {
    let result: string

    if (draft.type === 'email' || draft.type === 'follow_up') {
      if (!draft.emailTo) throw new Error('No recipient on draft')
      if (!draft.emailSubject || !draft.emailBody) throw new Error('Incomplete email draft')
      const sent = await sendEmail({
        to: draft.emailTo,
        subject: draft.emailSubject,
        bodyText: draft.emailBody,
        threadId: draft.emailThreadId,
      })
      result = `Email sent to ${draft.emailTo} (message ${sent.id})`
    } else if (draft.type === 'calendar') {
      if (!draft.eventTitle || !draft.eventStart || !draft.eventEnd) {
        throw new Error('Incomplete calendar draft')
      }
      const attendees = draft.eventAttendees
        ? (JSON.parse(draft.eventAttendees) as string[])
        : []
      const event = await createCalendarEvent({
        title: draft.eventTitle,
        start: draft.eventStart,
        end: draft.eventEnd,
        attendees,
        location: draft.eventLocation,
        description: draft.eventDescription,
      })
      result = `Calendar event created: ${event.htmlLink || event.id}`
    } else {
      throw new Error(`Unknown draft type: ${draft.type}`)
    }

    await db.actionDraft.update({
      where: { id: draft.id },
      data: {
        status: 'executed',
        executedAt: new Date(),
        executionResult: result,
        autoExecuted: opts.auto,
      },
    })
    return { ok: true, result }
  } catch (err: any) {
    const result = err?.message ?? 'Execution failed'
    await db.actionDraft.update({
      where: { id: draft.id },
      data: { status: 'failed', executionResult: result, autoExecuted: opts.auto },
    })
    return { ok: false, result }
  }
}
