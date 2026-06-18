// Orchestrates a Morning Report:
//   aggregate open items → triage → draft → apply autonomy gate → summarize.
//
// The autonomy gate is the safety boundary: a draft only auto-executes when
// the master switch is armed AND its action type is set to "auto". With the
// conservative defaults, every draft is left "pending" for manual approval.

import { db } from '@/lib/db'
import { anthropic } from '@/lib/claude'
import { getAutonomySettings, shouldAutoExecute, type ActionType } from '@/lib/autonomy'
import { aggregateOpenItems } from './aggregate'
import { triageItems } from './triage'
import { draftForItem } from './draft'
import { executeDraft } from './execute'

const SUMMARY_MODEL = 'claude-haiku-4-5-20251001'

export async function generateMorningReport(): Promise<string> {
  const report = await db.morningReport.create({
    data: { status: 'generating' },
  })

  try {
    const items = await aggregateOpenItems()

    if (items.length === 0) {
      await db.morningReport.update({
        where: { id: report.id },
        data: { status: 'ready', itemCount: 0, summary: 'Nothing open — inbox zero on your to-dos. 🎉' },
      })
      return report.id
    }

    const triage = await triageItems(items)
    const settings = await getAutonomySettings()

    // Persist items + drafts, applying the gate as we go.
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const t = triage[i]

      const reportItem = await db.reportItem.create({
        data: {
          reportId: report.id,
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          sourceText: item.text,
          sourceContext: item.context ?? null,
          category: t.category,
          priority: t.priority,
          reasoning: t.reasoning,
        },
      })

      if (t.category === 'manual') continue

      const payload = await draftForItem(item, t)
      if (!payload) continue

      const draft = await db.actionDraft.create({
        data: {
          reportItemId: reportItem.id,
          type: payload.type,
          emailTo: 'emailTo' in payload ? payload.emailTo : null,
          emailThreadId: 'emailThreadId' in payload ? payload.emailThreadId : null,
          emailSubject: 'emailSubject' in payload ? payload.emailSubject : null,
          emailBody: 'emailBody' in payload ? payload.emailBody : null,
          eventTitle: 'eventTitle' in payload ? payload.eventTitle : null,
          eventStart: 'eventStart' in payload ? payload.eventStart : null,
          eventEnd: 'eventEnd' in payload ? payload.eventEnd : null,
          eventAttendees:
            'eventAttendees' in payload ? JSON.stringify(payload.eventAttendees) : null,
          eventLocation: 'eventLocation' in payload ? payload.eventLocation : null,
          eventDescription: 'eventDescription' in payload ? payload.eventDescription : null,
        },
      })

      // ── Autonomy gate ──────────────────────────────────────────
      if (shouldAutoExecute(settings, payload.type as ActionType)) {
        await executeDraft(draft, { auto: true })
      }
      // else: stays "pending" until the user approves.
    }

    const summary = await generateSummary(items, triage)

    await db.morningReport.update({
      where: { id: report.id },
      data: { status: 'ready', itemCount: items.length, summary },
    })

    return report.id
  } catch (err: any) {
    await db.morningReport.update({
      where: { id: report.id },
      data: { status: 'failed', error: err?.message ?? 'Generation failed' },
    })
    throw err
  }
}

async function generateSummary(
  items: { text: string; context?: string }[],
  triage: { category: string; priority: number }[],
): Promise<string> {
  const lines = items
    .map((it, i) => `- (${triage[i]?.category}, p${triage[i]?.priority}) ${it.text}`)
    .join('\n')

  const prompt = `You are a founder's chief of staff writing the top of their morning briefing. Given today's open items below, write 2-3 sentences: what to focus on first and the overall shape of the day. Be specific and motivating, not generic. No greeting, no sign-off.

Open items:
${lines}

Briefing:`

  try {
    const message = await anthropic.messages.create({
      model: SUMMARY_MODEL,
      max_tokens: 220,
      messages: [{ role: 'user', content: prompt }],
    })
    return message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  } catch {
    return `${items.length} open items today.`
  }
}
