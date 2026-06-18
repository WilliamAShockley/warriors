// Triage pass: classify and prioritize each open item with Claude Haiku.
// One batched call for the whole list — cheap and fast.

import { anthropic } from '@/lib/claude'
import type { OpenItem } from './aggregate'

export type Category = 'email_reply' | 'calendar' | 'follow_up' | 'manual'

export interface TriageResult {
  category: Category
  priority: number // 1 (low) – 5 (urgent)
  reasoning: string
  // best-effort contact extracted from the item text, used to ground drafts
  contactName?: string
  contactEmail?: string
}

const CATEGORIES: Category[] = ['email_reply', 'calendar', 'follow_up', 'manual']

const TRIAGE_MODEL = 'claude-haiku-4-5-20251001'

export async function triageItems(items: OpenItem[]): Promise<TriageResult[]> {
  if (items.length === 0) return []

  const list = items
    .map((it, i) => {
      const ctx = it.context ? ` [${it.context}]` : ''
      return `${i}. ${it.text}${ctx}`
    })
    .join('\n')

  const prompt = `You are an executive assistant triaging a founder's to-do list. For EACH item, decide:

- category: one of
  - "email_reply": the item is about replying to or sending an email to a specific person/company.
  - "calendar": the item is about scheduling, booking, or calendaring a meeting/call/event.
  - "follow_up": the item is checking in / following up with someone (often via email) where there may be prior context.
  - "manual": anything else that can't be turned into a drafted email or calendar action (e.g. "write the deck", "think about pricing", "fix the bug").
- priority: integer 1-5 (5 = urgent/time-sensitive, 1 = whenever). Bias time-sensitive, person-blocking, and momentum items higher.
- reasoning: one short clause explaining the call.
- contactName / contactEmail: if the item names a person or company to contact, extract it. Omit if none. Only extract an email if one literally appears in the text.

Items:
${list}

Return ONLY a JSON array, one object per item in the SAME order, like:
[{"category":"email_reply","priority":4,"reasoning":"...","contactName":"Jane"}, ...]`

  const message = await anthropic.messages.create({
    model: TRIAGE_MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  const jsonMatch = raw.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    // Fail safe: everything manual.
    return items.map(() => ({ category: 'manual' as Category, priority: 2, reasoning: 'Triage unavailable' }))
  }

  let parsed: any[]
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return items.map(() => ({ category: 'manual' as Category, priority: 2, reasoning: 'Triage parse failed' }))
  }

  return items.map((_, i) => {
    const r = parsed[i] ?? {}
    const category: Category = CATEGORIES.includes(r.category) ? r.category : 'manual'
    const priority = Number.isInteger(r.priority) ? Math.min(5, Math.max(1, r.priority)) : 2
    return {
      category,
      priority,
      reasoning: typeof r.reasoning === 'string' ? r.reasoning : '',
      contactName: typeof r.contactName === 'string' ? r.contactName : undefined,
      contactEmail: typeof r.contactEmail === 'string' ? r.contactEmail : undefined,
    }
  })
}
