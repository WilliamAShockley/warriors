import { NextResponse } from 'next/server'
import { rawDb } from '@/lib/db'
import { runAsWorkspace } from '@/lib/tenant'
import { fileEmailTask } from '@/lib/inbound'

// Door two: the provisioned inbound address. An inbound-mail vendor
// (Postmark, SendGrid inbound parse, or anything that POSTs JSON) delivers
// mail sent to task-<inboundToken>@<your-inbound-domain> here. The token
// is the authentication — a per-workspace capability, rotatable by
// regenerating the workspace row. Works the moment a deployment wires a
// vendor to it; harmless and inert otherwise.
//
// Accepted shapes (first match wins):
//   token:   ?token=… | To/recipient containing task-<token>@…
//   fields:  Postmark {From, To, Subject, TextBody, MessageID}
//            SendGrid {from, to, subject, text}
//            generic  {from, to, subject, body}

export const maxDuration = 300

const tokenFrom = (to: string) => to.match(/task-([a-z0-9]+)@/i)?.[1] ?? null

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  const body = await req.json().catch(() => ({}))

  const to = String(body?.To ?? body?.to ?? body?.recipient ?? '')
  const token = searchParams.get('token') ?? tokenFrom(to)
  if (!token) return NextResponse.json({ error: 'no workspace token' }, { status: 401 })

  const workspace = await rawDb.workspace.findUnique({ where: { inboundToken: token } }).catch(() => null)
  if (!workspace) return NextResponse.json({ error: 'unknown token' }, { status: 401 })

  const subject = String(body?.Subject ?? body?.subject ?? '').slice(0, 500)
  const text = String(body?.TextBody ?? body?.text ?? body?.body ?? '').slice(0, 20_000)
  const from = String(body?.From ?? body?.from ?? '').slice(0, 200)
  const messageId = String(body?.MessageID ?? body?.messageId ?? body?.message_id ?? '') ||
    `post-${Buffer.from(`${from}|${subject}|${text.slice(0, 200)}`).toString('base64url').slice(0, 60)}`

  if (!subject && !text) return NextResponse.json({ error: 'empty message' }, { status: 400 })

  const result = await runAsWorkspace(workspace.id, () =>
    fileEmailTask({ messageId, subject, body: text, source: 'post', from })
  )
  return NextResponse.json(result)
}
