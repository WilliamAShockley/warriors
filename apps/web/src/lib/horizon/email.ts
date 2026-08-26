import type { Draft } from './types'

/**
 * Email sequencer adapter. The sequencer owns cadence and reply detection;
 * we push approved contacts+drafts to it and react to its webhooks.
 *
 * With no SMARTLEAD_API_KEY configured, `getEmailAdapter()` returns null and
 * the pipeline routes email touches through the manual queue (same flow as
 * LinkedIn: surface when due, operator copies + sends, marks sent) — so the
 * email channel works fully with nothing configured.
 */

export type SequencerLead = {
  membershipId: string
  email: string
  name: string
  drafts: Draft[] // email touches only
}

export interface EmailSequencerAdapter {
  readonly name: string
  /** Push a lead + its email drafts into the sequencer. Returns external id. */
  enqueue(campaignName: string, lead: SequencerLead): Promise<string>
  /** Verify an inbound webhook request came from the sequencer. */
  verifyWebhook(rawBody: string, signature: string | null): boolean
}

class SmartleadAdapter implements EmailSequencerAdapter {
  readonly name = 'smartlead'
  constructor(private apiKey: string) {}

  async enqueue(campaignName: string, lead: SequencerLead): Promise<string> {
    // Smartlead v1: create-or-fetch a campaign by name, then add the lead with
    // its personalized sequence bodies as custom fields.
    const base = 'https://server.smartlead.ai/api/v1'
    const campaigns: Array<{ id: number; name: string }> = await fetch(
      `${base}/campaigns?api_key=${this.apiKey}`
    ).then((r) => r.json())
    let campaign = campaigns.find?.((c) => c.name === campaignName)
    if (!campaign) {
      campaign = await fetch(`${base}/campaigns/create?api_key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: campaignName }),
      }).then((r) => r.json())
    }
    const res = await fetch(`${base}/campaigns/${campaign!.id}/leads?api_key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lead_list: [
          {
            email: lead.email,
            first_name: lead.name.split(' ')[0],
            last_name: lead.name.split(' ').slice(1).join(' '),
            custom_fields: Object.fromEntries(
              lead.drafts.map((d) => [`touch_${d.touchIndex}`, `${d.subject ?? ''}\n${d.editedBody ?? d.body}`])
            ),
          },
        ],
      }),
    }).then((r) => r.json())
    return String(res?.id ?? campaign!.id)
  }

  verifyWebhook(rawBody: string, signature: string | null): boolean {
    const secret = process.env.SMARTLEAD_WEBHOOK_SECRET
    if (!secret) return true // no secret configured → accept (dev)
    return signature === secret // Smartlead sends the configured secret verbatim
  }
}

export function getEmailAdapter(): EmailSequencerAdapter | null {
  const key = process.env.SMARTLEAD_API_KEY
  if (!key) return null
  return new SmartleadAdapter(key)
}
