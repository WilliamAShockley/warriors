import { anthropic } from '../claude'
import { parseLLMJsonObject, withRetry } from '../retry'
import { getReaderName } from '../settings'
import { APOLLO_TOOL_DEFS, executeApolloTool } from './tools'
import { skillsBriefing } from './skills'
import {
  appendStep,
  completeTask,
  listLessons,
  setPlanNote,
  addLesson,
  type ApolloBriefing,
  type ApolloTaskRecord,
} from './store'

export const APOLLO_MODEL = process.env.APOLLO_MODEL || 'claude-opus-4-8'

const MAX_ITERATIONS = 12
const MAX_ELAPSED_MS = 240_000

const WEB_SEARCH_TOOL = { type: 'web_search_20260209', name: 'web_search', max_uses: 8 }

async function systemPrompt(): Promise<string> {
  const [lessons, readerName] = await Promise.all([listLessons(10), getReaderName()])
  return `You are Apollo, the private agent of ${readerName} — an investor running a new alternative-asset manager — inside "The Allocator", his personal editorial workspace. He hands you a task; you complete it using the tools, then file a briefing.

His workspace, which your tools read and write:
- The Docket: his to-dos. The Book: LPs, founders, co-investors, advisors. Research: his active theses and charters. The Margin: his freeform thinking. The calendar and meeting notes: his real schedule and Granola summaries. The mailbox: his connected Gmail (search, read, send). The Proofs: his review tray, where drafted work awaits his signature. The wire: web search.

How you work:
1. Open with ONE sentence stating your reading of the task — before any tool call. Then work.
2. Ground everything in what the tools return. Never invent contacts, events, notes, or facts. If the workspace lacks what you need, search the web; if that fails too, say what is missing.
3. You may write to the workspace (file to-dos, add contacts, file margin notes) when the task's outcome calls for it — write deliberately, never duplicate, and only what he would plausibly want kept. Anything drafted on his behalf — an email, a post, an analysis — goes to The Proofs via stage_proof, where he signs it personally; approval executes it. Send email directly ONLY when the task explicitly says send, to the recipient it names.
4. Voice: precise, financially literate, quietly witty. No emoji, no exclamation marks, no hype. Headlines read like the FT.

Skills — specialized drafting playbooks you invoke through tools when a task calls for one:
${skillsBriefing()}
When a skill applies, gather the workspace context it needs FIRST, then invoke it, and reproduce its output verbatim in your briefing (a drafted email goes in its own section, subject line included, unaltered).

When the work is done, end your final message with ONLY this JSON (no prose after it):
{"title": "<serif headline for the briefing>", "dateline": "Apollo · <one-line source note, e.g. 'from the Book, the calendar, and the wire'>", "sections": [{"label": "<small-caps label>", "body": "<one tight paragraph>"}]}
Two to five sections. The briefing is the deliverable — it should read like a well-edited column, not a log.${
    lessons.length
      ? `\n\nLessons from prior tasks (feedback from the reader — honor these):\n${lessons.map((l) => `- ${l}`).join('\n')}`
      : ''
  }`
}

// The manual agent loop: per-step DB logging is the point. Callers with a
// specialty (the docket worker) append their doctrine to the system prompt.
export async function runApollo(
  taskId: string,
  ask: string,
  opts?: { systemAppendix?: string }
): Promise<void> {
  const system = (await systemPrompt()) + (opts?.systemAppendix ? `\n\n${opts.systemAppendix}` : '')
  const tools: any[] = [...APOLLO_TOOL_DEFS, WEB_SEARCH_TOOL]
  const messages: any[] = [{ role: 'user', content: ask }]
  const startedAt = Date.now()
  let planCaptured = false
  let finalText = ''

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const outOfTime = Date.now() - startedAt > MAX_ELAPSED_MS
      if (outOfTime) {
        await appendStep(taskId, { kind: 'note', name: 'Out of desk time', detail: 'filing best effort' })
        messages.push({
          role: 'user',
          content:
            'You are out of desk time. Stop working and file your best-effort briefing now — the JSON only, noting honestly anything left unverified.',
        })
      }

      // One flaky API response must not kill a whole run; the timeout is
      // generous because thinking + server-side search make long turns.
      const response = await withRetry(
        () =>
          anthropic.messages.create({
            model: APOLLO_MODEL,
            max_tokens: 16000,
            thinking: { type: 'adaptive' },
            system,
            tools,
            messages,
          } as any),
        { maxAttempts: 3, timeoutMs: 180_000 }
      )

      // Capture Apollo's one-line reading of the task from the first text block.
      if (!planCaptured) {
        const firstText = response.content.find((b: any) => b.type === 'text')
        if (firstText && 'text' in firstText && firstText.text.trim()) {
          planCaptured = true
          await setPlanNote(taskId, firstText.text.trim().split('\n')[0].slice(0, 240))
        }
      }

      // Log server-side web searches as steps.
      for (const block of response.content as any[]) {
        if (block.type === 'server_tool_use' && block.name === 'web_search') {
          await appendStep(taskId, {
            kind: 'search',
            name: 'Searched the wire',
            detail: String(block.input?.query ?? '').slice(0, 80),
          })
        }
      }

      // 'pause_turn' postdates the installed SDK's stop_reason union.
      if ((response.stop_reason as string) === 'pause_turn') {
        messages.push({ role: 'assistant', content: response.content })
        continue
      }

      if (response.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: response.content })
        const uses = (response.content as any[]).filter((b) => b.type === 'tool_use')
        const results = []
        for (const use of uses) {
          const exec = await executeApolloTool(use.name, use.input)
          await appendStep(taskId, exec.step)
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            // Clipped defensively: one oversized tool payload (a huge thread,
            // a long mailbox search) must not blow the context window.
            content: exec.output.length > 30_000 ? `${exec.output.slice(0, 30_000)}… [clipped]` : exec.output,
            ...(exec.isError ? { is_error: true } : {}),
          })
        }
        // All parallel tool results go back in ONE user message.
        messages.push({ role: 'user', content: results })
        continue
      }

      // end_turn (or refusal/max_tokens) — take the text and stop.
      messages.push({ role: 'assistant', content: response.content })
      finalText = (response.content as any[])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
      break
    }

    const fallback: ApolloBriefing = {
      title: 'Apollo reports',
      dateline: 'Apollo · working papers',
      sections: [
        {
          label: 'As filed',
          body: finalText.trim() || 'The task ended without a filed briefing. The step log above records what was attempted.',
        },
      ],
    }
    const parsed = parseLLMJsonObject<ApolloBriefing>(finalText, fallback)
    const result: ApolloBriefing =
      parsed && Array.isArray(parsed.sections) && parsed.sections.length > 0 && parsed.title
        ? parsed
        : fallback

    await completeTask(taskId, { status: 'done', result, trace: messages })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // The full error must survive: to the step (readably), to the task's
    // result (so the UI shows the whole thing), and to the platform logs.
    console.error(`[apollo] run ${taskId} failed:`, msg)
    await appendStep(taskId, { kind: 'note', name: 'The run failed', detail: msg.slice(0, 300) })
    await completeTask(taskId, {
      status: 'failed',
      result: {
        title: 'The run failed',
        dateline: 'Apollo · error report',
        sections: [{ label: 'What the API said', body: msg.slice(0, 2000) }],
      },
      trace: messages,
    })
  }
}

// Continual learning, prompt-side: distill reader feedback into one lesson.
export async function distillLesson(task: ApolloTaskRecord): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY || !task.verdict) return
  try {
    const message = await anthropic.messages.create({
      model: APOLLO_MODEL,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Apollo (an agent for an alternative-asset investor) completed a task and the reader judged it.

Task: ${task.ask}
Apollo's reading of it: ${task.planNote ?? '(none)'}
Steps taken: ${task.steps.map((s) => `${s.name} — ${s.detail}`).join('; ') || '(none)'}
Result title: ${task.result?.title ?? '(no result)'}
Reader's verdict: ${task.verdict}${task.feedbackNote ? `\nReader's note: ${task.feedbackNote}` : ''}

Write ONE transferable lesson for Apollo's future tasks — a single sentence, imperative, specific enough to act on, general enough to reuse. If the verdict was good, capture what to keep doing; if needs-work, what to do differently. Reply with the sentence only.`,
        },
      ],
    } as any)
    const content = message.content[0] as any
    const lesson = content?.type === 'text' ? content.text.trim() : ''
    if (lesson) await addLesson(task.id, lesson.slice(0, 500))
  } catch {}
}
