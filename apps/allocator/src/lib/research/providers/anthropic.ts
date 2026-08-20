import type { Citation, ResearchInput, ResearchProvider, ResearchResult } from '../types'
import { RESEARCH_TIMEOUT_MS } from '../types'

// The Anthropic engine runs a deliberately DEAD-SIMPLE charge — the
// reader's call, 19 Aug 2026, after the full charge sent the model on an
// exhaustive search spree that spent the whole deadline searching and
// never started writing. The other engines still run the full shared
// charge from ../charge; the JSON contract is identical.
const today = () =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date()
  )

const simpleCharge = (input: ResearchInput) =>
  input.kind === 'person' ? simplePersonCharge(input) : simpleCompanyCharge(input)

const simpleCompanyCharge = (input: ResearchInput) => `Quick web check on one company. Today is ${today()}.

Company: ${input.name}
CEO / founder: ${input.founderFullName ?? input.founderFirstName ?? '(unknown)'}
Website: ${input.websiteUrl ?? '(unknown)'}
What we already know: ${input.context ?? '(nothing yet)'}

Search the web — one or two searches, no more — then answer plainly:
1. What does the company do?
2. Who is the CEO (first and full name)?
3. Any news from the past 3 months — funding, launches, big announcements?

If other companies share this name, only trust results matching the website or founder above. If you cannot tell which company this is, write "AMBIGUOUS —" plus the candidates as the context and leave the founder fields null.

Keep it short. End your reply with ONLY this JSON (no prose after it):
{"founderFirstName": "<or null>", "founderFullName": "<or null>",
 "context": "<3-6 factual sentences>",
 "websiteUrl": "<https url or null>"}`

// The People sheet's simple charge: same dead-simple shape, person
// semantics. The contract keys are shared with the company charge (the
// founder fields carry the person's own name) so one parser serves both.
const simplePersonCharge = (input: ResearchInput) => `Quick web check on one person. Today is ${today()}.

Person: ${input.name?.trim() || '(unknown)'}
Company: ${input.company ?? '(unknown)'}
LinkedIn: ${input.linkedinUrl ?? '(unknown)'}

Search the web — one or two searches, no more — then answer plainly:
1. Their professional background: current role, prior roles and companies, education, anything notable. 3-6 terse factual sentences.
2. Their first and full name, confirmed.
3. Best guess at their work email — a published address, or the company's email pattern applied to their name; null if there is no basis.

If several people share this name, only trust results matching the company or LinkedIn above. If you cannot tell which person this is, write "AMBIGUOUS —" plus the candidates as the context and leave the other fields null.

Keep it short. End your reply with ONLY this JSON (no prose after it):
{"founderFirstName": "<or null>", "founderFullName": "<or null>",
 "context": "<3-6 factual sentences on their background>",
 "websiteUrl": "<their LinkedIn https url or null>",
 "guessedEmail": "<best-guess work email or null>"}`

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
    let messages: any[] = [{ role: 'user', content: simpleCharge(input) }]
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
