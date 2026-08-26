import Anthropic from '@anthropic-ai/sdk'
import { anthropic } from '@/lib/claude'
import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { getScope } from '@/lib/horizon/scope'
import { CHAT_TOOLS, executeChatTool } from '@/lib/horizon/chat-tools'

export const maxDuration = 300

const CHAT_MODEL = process.env.HORIZON_CHAT_MODEL || 'claude-sonnet-4-6'
const MAX_TOOL_ROUNDS = 8

const SYSTEM_PROMPT = `You are the Horizon OS operator console — the chat surface of an investment firm's long-horizon agent system.

Context:
- A MISSION is a multi-day, stateful process (first type: outreach_campaign) that runs mostly unattended and pauses at human gates. Mission state lives in Postgres; you are a client of that state, never its owner. You act only within this conversation turn — background progress belongs to the advance job.
- The outreach pipeline stages: sourced → enriched → [strategy gate] → [list gate] → drafting → [draft-batch gate] → [release gate] → queued → sent → replied → closed. Email sends are automated via a sequencer; LinkedIn messages are pre-placed by a local runner and a human always clicks send.
- Approvals are real gates: you have NO ability to resolve them. When one is pending, give the operator the /horizon/approvals link. Never claim you approved anything.
- Before calling create_mission, pause_mission, or resume_mission: restate exactly what you're about to do in one or two lines and ask for a one-word confirm. Only call the tool after the operator confirms in their next message.

House style: terse, operator-console tone. Short lines. No filler, no enthusiasm, no emoji. Lead with the fact. Use monospace-friendly formatting (plain lines, simple tables). When listing missions or approvals, keep it dense.`

type SSEWriter = (event: Record<string, unknown>) => void

export async function POST(req: Request) {
  const { workspaceId } = await getScope()
  const body = await req.json().catch(() => ({}))
  const userText = String(body?.message ?? '').trim()
  if (!userText) return new Response(JSON.stringify({ error: 'message required' }), { status: 400 })

  // Resolve or create the session.
  let sessionId: string = body?.sessionId
  if (sessionId) {
    const exists = await db.chatSession.findFirst({ where: { id: sessionId, workspaceId } })
    if (!exists) sessionId = ''
  }
  if (!sessionId) {
    const session = await db.chatSession.create({
      data: { workspaceId, title: userText.slice(0, 60), createdBy: 'operator' },
    })
    sessionId = session.id
  }

  // Replay history straight from stored content blocks.
  const stored = await db.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
  })
  const history: Anthropic.MessageParam[] = stored.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content as unknown as Anthropic.MessageParam['content'],
  }))

  // Persist the user turn before doing anything else — a crash after this
  // point loses no input.
  await db.chatMessage.create({
    data: { sessionId, role: 'user', content: [{ type: 'text', text: userText }] as Prisma.InputJsonValue },
  })
  await db.chatSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } })

  const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: userText }]

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send: SSEWriter = (event) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch { /* stream already closed (client hit Esc) */ }
      }
      send({ type: 'session', sessionId })

      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const msgStream = anthropic.messages.stream(
            {
              model: CHAT_MODEL,
              max_tokens: 2048,
              system: SYSTEM_PROMPT,
              tools: CHAT_TOOLS,
              messages,
            },
            { signal: req.signal }
          )

          msgStream.on('text', (delta) => send({ type: 'text', text: delta }))
          msgStream.on('contentBlock', (block) => {
            if (block.type === 'tool_use') {
              send({ type: 'tool_start', id: block.id, name: block.name, input: block.input })
            }
          })

          const final = await msgStream.finalMessage()

          // Persist the assistant turn in Anthropic content-block shape.
          await db.chatMessage.create({
            data: { sessionId, role: 'assistant', content: final.content as unknown as Prisma.InputJsonValue },
          })
          messages.push({ role: 'assistant', content: final.content })

          const toolUses = final.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
          )
          if (final.stop_reason !== 'tool_use' || toolUses.length === 0) break

          const results: Anthropic.ToolResultBlockParam[] = []
          for (const tu of toolUses) {
            let result: unknown
            try {
              result = await executeChatTool(tu.name, tu.input as Record<string, unknown>)
            } catch (err) {
              result = { error: String(err) }
            }
            const resultStr = JSON.stringify(result, null, 1)
            send({ type: 'tool_result', id: tu.id, name: tu.name, result })
            results.push({ type: 'tool_result', tool_use_id: tu.id, content: resultStr })
          }
          await db.chatMessage.create({
            data: { sessionId, role: 'user', content: results as unknown as Prisma.InputJsonValue },
          })
          messages.push({ role: 'user', content: results })
        }
        send({ type: 'done' })
      } catch (err) {
        const aborted = err instanceof Error && (err.name === 'AbortError' || /abort/i.test(err.message))
        if (!aborted) send({ type: 'error', message: String(err) })
      } finally {
        try { controller.close() } catch { /* already closed */ }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
