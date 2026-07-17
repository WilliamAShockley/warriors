import { createTask } from './store'
import { runApollo, APOLLO_MODEL } from './run'

// The docket worker: when a to-do calls for an email, Apollo picks it up
// unbidden — thread check first, research if cold, then the founder-email
// skill drafts in the reader's actual voice, and one proof is staged tied
// to the to-do. The reader's part is the signature.

const hasDb = () => Boolean(process.env.DATABASE_URL)

async function getDb() {
  const { db } = await import('../db')
  return db
}

export type WorkerRedirect = { correction: string; previousTo?: string; previousTitle?: string }

const workerAsk = (todoId: string, text: string, redirect?: WorkerRedirect) => `A to-do${redirect ? ' on the Docket' : ' just landed on the Docket that'} calls for an email: "${text}"${todoId ? ` (Docket id ${todoId})` : ''}.${
  redirect
    ? `\n\nREDIRECTED BY THE READER — this task was drafted once before and the TARGETING WAS WRONG. The previous draft${redirect.previousTitle ? ` ("${redirect.previousTitle}")` : ''}${redirect.previousTo ? ` was addressed to ${redirect.previousTo}` : ''} has been spiked. The reader's correction, which overrides everything your own research suggests:\n"${redirect.correction}"\nFollow the correction absolutely: re-research from it, and do not return to the previously targeted company or person.`
    : ''
}

Draft that email and stage it for the reader's signature. Follow this procedure exactly — it is a short job, not an investigation. Budget: at most 8 tool calls, at most 3 web searches.

STEP 1 — Who is this? If the to-do names a person, read_contact them first; if it names a company, read_book to see if anyone there is known. The Book's segment decides the AUDIENCE: Founders/Co-investors on a company matter → "founder"; LPs → "investor"; anything else (or advisors, counsel, scheduling) → "other". A company not in the Book at all is founder outreach.

STEP 2 — Thread check. search_email for the person or company.
- A thread EXISTS: read_email the most recent message. mode = "follow_up"; the recipient, address, and threadId come from the thread.
- NO thread: mode = "cold". For founder audience, search the web: what the company does and — most important — WHO THE FOUNDER IS AND THEIR FIRST NAME. Address: a real one if research surfaced it, else best-guess firstname@companydomain.com and say so plainly in the proof's summary line.

STEP 2b — Scheduling check (follow-ups only). If the thread shows the other party AGREED to meet or asked for times, call propose_times (pass meeting length and their timezone if the thread reveals them) and include the returned windows in the draft VERBATIM, as a bulleted list. Never compose availability yourself; if propose_times fails, the draft says you will follow up with times rather than inventing any.

STEP 3 — Draft by audience:
- FOUNDER audience: you MUST call draft_founder_email — the skill writes in the reader's real sent-mail voice; you do not. Context you pass carries ONLY facts about the recipient and the thread — never the reader's own identity or how this workspace describes him. If propose_times returned windows, put them in the context with the instruction: include these exact windows verbatim as the availability list.
- INVESTOR or OTHER audience: the founder playbook is BARRED (its voice does not extrapolate). Draft directly: plain, courteous, brief, matter-at-hand only. State NOTHING about the reader's identity or firm from your own framing — if the thread or the Book does not supply it, leave it out. Flag in the proof's summary that this is outside the tuned playbook.

STEP 4 — Stage it VERBATIM. stage_proof with kind "email", the draft exactly as produced (for skill drafts: no polishing, no grammar fixes — the quirks are the voice), the recipient's address in "to", threadId when following up, ${todoId ? `todoId "${todoId}" so signing it clears the to-do, ` : ''}audience and mode as determined above, and grounding = the same context that informed the draft (thread summary or research findings, with source attributions). You must ALWAYS stage exactly one proof — a flagged best-guess beats no draft.

Do NOT read the docket, the calendar, or meeting notes for this task. Do NOT send the email directly. Do NOT file new to-dos. After staging, the final briefing is one short section: what you drafted, for whom, and what you based the address on.`

// Fire-and-forget from the caller's perspective; failures are recorded on
// the Apollo task itself, never surfaced to the to-do that spawned it.
export async function workDocketItem(
  todoId: string,
  text: string,
  redirect?: WorkerRedirect
): Promise<void> {
  if (!hasDb() || !process.env.ANTHROPIC_API_KEY) return
  try {
    // One draft per to-do: skip if a proof already awaits signature for it.
    // A redirect re-run skips the guard — its predecessor was just spiked.
    if (todoId && !redirect) {
      const db = await getDb()
      const existing = await db.reviewItem.count({ where: { todoId, status: 'pending' } })
      if (existing > 0) return
    }

    const ask = workerAsk(todoId, text, redirect)
    const task = await createTask(ask, APOLLO_MODEL)
    if (!task) return
    await runApollo(task.id, ask)
  } catch {
    // Best-effort: the to-do stands either way; the reader can always ask
    // Apollo by hand.
  }
}
