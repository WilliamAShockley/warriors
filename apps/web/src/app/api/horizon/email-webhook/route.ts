import { NextResponse } from 'next/server'
import { getEmailAdapter } from '@/lib/horizon/email'
import { handleInboundReply, markTouchSent } from '@/lib/horizon/pipeline'

export const maxDuration = 60

/**
 * Inbound webhook from the email sequencer (Smartlead), plus the local-dev
 * simulated-reply path used to exercise reply classification end-to-end.
 *
 * Smartlead events handled:
 *  - EMAIL_SENT  → record the outbound Interaction + advance the touch
 *  - EMAIL_REPLY → classify, write inbound Interaction, update membership
 *
 * Simulated shape (accepted whether or not a sequencer is configured):
 *  { "simulated": true, "event": "reply", "email": "...", "body": "..." }
 */
export async function POST(req: Request) {
  const raw = await req.text()
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const adapter = getEmailAdapter()
  const isSimulated = body?.simulated === true
  if (!isSimulated && adapter) {
    const sig = req.headers.get('x-smartlead-signature') ?? req.headers.get('x-webhook-secret')
    if (!adapter.verifyWebhook(raw, sig)) {
      return NextResponse.json({ error: 'bad signature' }, { status: 401 })
    }
  }

  const eventType = String(body?.event ?? body?.event_type ?? '').toLowerCase()
  const email = String(body?.email ?? body?.to_email ?? body?.lead_email ?? '')
  const replyBody = String(body?.body ?? body?.reply_body ?? body?.preview_text ?? '')

  if (eventType.includes('reply')) {
    const result = await handleInboundReply({ email, body: replyBody, channel: 'email' })
    return NextResponse.json({ ok: true, ...result })
  }

  if (eventType.includes('sent')) {
    // Sequencer confirmed a send: advance the matching membership's touch.
    const { db } = await import('@/lib/db')
    const person = await db.person.findFirst({ where: { email } })
    if (person) {
      const membership = await db.campaignMembership.findFirst({
        where: { personId: person.id, placementState: 'sequencer' },
      })
      if (membership) {
        // Temporarily flip to queued so markTouchSent's guard accepts it.
        await db.campaignMembership.update({ where: { id: membership.id }, data: { placementState: 'queued' } })
        await markTouchSent(membership.id, 'runner', 'system').catch(() => null)
      }
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true, ignored: eventType })
}
