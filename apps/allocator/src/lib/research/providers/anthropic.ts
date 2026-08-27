import type { Citation, ResearchInput, ResearchProvider, ResearchResult } from '../types'
import { RESEARCH_TIMEOUT_MS } from '../types'
import { chargeFor } from '../charge'

// The Anthropic engine's house charge is the deliberately DEAD-SIMPLE one
// (see ../charge) — the reader's call, 19 Aug 2026, after the full charge
// sent the model on an exhaustive search spree. Reader amendments in the
// Bench's Charges section override it per workspace.

// The incumbent: Sonnet with the web_search server tool — the model
// composes up to three searches, Anthropic runs them server-side, and the
// brief plus JSON come back in the same turn. This is the exact engine
// the Register runs on.
//
// The call STREAMS. A non-streaming multi-minute request (thinking plus
// three search rounds before the first byte) sits on a silent connection
// and dies to timeouts — streaming keeps bytes flowing and is the
// documented mode for long requests. The server can also pause a long
// tool-using turn (stop_reason "pause_turn"); re-sending the paused
// content resumes it where it left off.
const MODEL = process.env.ENRICH_MODEL || 'claude-sonnet-5'
// ONE resume, not four. A resumed request gets a FRESH web_search
// allowance — max_uses caps per request, not per conversation — so
// generous resumes let a search-happy run loop pause→resume→search until
// the deadline dies (observed: 13 searches, 31 chars drafted). One
// resume exists to let a paused run finish WRITING, not to keep digging.
const MAX_ROUNDS = 1

async function run(input: ResearchInput): Promise<ResearchResult> {
  const { anthropic } = await import('../../claude')
  const { parseFields } = await import('../parse')
  const started = Date.now()

  // One deadline across every round and retry; on abort the error reports
  // how far the run got, so a timeout is diagnosable from the cell.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RESEARCH_TIMEOUT_MS)

  let searches = 0
  let drafted = 0
  const citations: Citation[] = []
  const seen = new Set<string>()
  const add = (url?: string, title?: string) => {
    if (url && !seen.has(url)) {
      seen.add(url)
      citations.push({ url, title })
    }
  }
  const harvest = (block: any) => {
    if (block?.type === 'server_tool_use') searches++
    for (const c of block?.citations ?? []) add(c?.url, c?.title)
    if (block?.type === 'web_search_tool_result' && Array.isArray(block?.content)) {
      for (const r of block.content) add(r?.url, r?.title)
    }
  }

  try {
    // The BASIC search variant: the newer _20260209 tool runs code
    // execution under the hood to filter results — each search fans out
    // into extra server-side work, which is how runs drowned in tool
    // rounds. Basic search is one operation per search. Effort low keeps
    // thinking between searches short; this is a lookup, not a thesis.
    const base: any = {
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'low' },
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
    }
    let messages: any[] = [{ role: 'user', content: await chargeFor('anthropic', input) }]
    let response: any
    for (let round = 0; ; round++) {
      // maxRetries 1: the SDK's default 2 silent retries can re-run a
      // slow attempt until the whole deadline is spent on invisible work.
      const stream: any = await (anthropic as any).messages.stream(
        { ...base, messages },
        { signal: controller.signal, maxRetries: 1 }
      )
      stream.on('text', (t: string) => {
        drafted += t.length
      })
      stream.on('contentBlock', harvest)
      response = await stream.finalMessage()
      if (response?.stop_reason === 'pause_turn' && round < MAX_ROUNDS) {
        // Resume the paused turn: user charge + the paused assistant
        // content, untouched — the server picks up where it stopped.
        messages = [...messages, { role: 'assistant', content: response.content }]
        continue
      }
      break
    }

    const text = (response.content as any[])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')

    const fields = await parseFields(text)
    if (!fields.context || !String(fields.context).trim()) {
      throw new Error(
        `the model returned no context (stop_reason: ${response?.stop_reason ?? 'unknown'}, ${searches} searches ran)`
      )
    }
    return { fields, citations, latencyMs: Date.now() - started, rawText: text }
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(
        `the web check timed out after ${Math.round(RESEARCH_TIMEOUT_MS / 1000)} seconds (${searches} ${
          searches === 1 ? 'search' : 'searches'
        } ran, ~${drafted} characters drafted before the cutoff)`
      )
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export const anthropicProvider: ResearchProvider = {
  id: 'anthropic',
  label: 'Anthropic',
  run,
}
