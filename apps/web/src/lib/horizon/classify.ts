import { anthropic } from '@/lib/claude'

const CLASSIFY_MODEL = process.env.HORIZON_CLASSIFY_MODEL || 'claude-opus-5'

export type ReplyClassification = 'interested' | 'not-now' | 'referral' | 'negative' | 'other'

const VALID: ReplyClassification[] = ['interested', 'not-now', 'referral', 'negative', 'other']

export async function classifyReply(replyBody: string, context?: string): Promise<ReplyClassification> {
  const msg = await anthropic.messages.create({
    model: CLASSIFY_MODEL,
    max_tokens: 16,
    messages: [
      {
        role: 'user',
        content: `Classify this reply to a cold outreach ${context ? `(context: ${context}) ` : ''}as exactly one of: interested, not-now, referral, negative, other.

Reply:
"""
${replyBody.slice(0, 4000)}
"""

Answer with only the label.`,
      },
    ],
  })
  const text = (msg.content.find((b) => b.type === 'text')?.text ?? '').trim().toLowerCase()
  const match = VALID.find((v) => text.includes(v))
  return match ?? 'other'
}
