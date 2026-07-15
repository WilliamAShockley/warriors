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

const workerAsk = (todoId: string, text: string) => `A to-do just landed on the Docket that calls for an email: "${text}" (Docket id ${todoId}).

Draft that email and stage it for the reader's signature. Follow this procedure exactly — it is a short job, not an investigation. Budget: at most 7 tool calls, at most 3 web searches.

STEP 1 — Thread check (always first). search_email for the company or person named in the to-do.
- If a thread EXISTS: read_email the most recent message. This is a FOLLOW-UP; the recipient, their address, and the threadId come from the thread.
- If NO thread: this is a COLD email. Search the web for the company: what it does, and — most important — WHO THE FOUNDER IS AND THEIR FIRST NAME. One or two searches, three at most. For the address: a real one if research surfaced it; otherwise best-guess firstname@companydomain.com and say so plainly in the proof's summary line.

STEP 2 — Draft through the skill, never by hand. For outreach to a founder or company, you MUST call draft_founder_email — mode "follow_up" when a thread exists (put what the last message said in context), mode "cold" otherwise (put your research in context: what they are building, the founder's first name, any news trigger). The skill writes in the reader's real sent-mail voice; you do not. The context you pass carries ONLY facts about the recipient and the thread — NEVER the reader's own identity, affiliation, or how this workspace describes him; the skill's voice profile alone owns who he is and how he introduces himself. Only if the recipient is plainly not founder outreach — counsel, an LP, pure scheduling — draft directly instead, and even then state nothing about the reader's identity or firm from your own framing.

STEP 3 — Stage it VERBATIM. stage_proof with kind "email", the skill's subject and body EXACTLY as returned — do not polish, shorten, or fix its grammar; its quirks are the reader's own voice — plus the recipient's address in "to", the threadId when it is a follow-up, and todoId "${todoId}" so signing it clears the to-do. You must ALWAYS stage exactly one proof, even if research came up thin — a flagged best-guess beats no draft.

Do NOT read the docket, the calendar, or meeting notes for this task. Do NOT send the email directly. Do NOT file new to-dos. After staging, the final briefing is one short section: what you drafted, for whom, and what you based the address on.`

// Fire-and-forget from the caller's perspective; failures are recorded on
// the Apollo task itself, never surfaced to the to-do that spawned it.
export async function workDocketItem(todoId: string, text: string): Promise<void> {
  if (!hasDb() || !process.env.ANTHROPIC_API_KEY) return
  try {
    // One draft per to-do: skip if a proof already awaits signature for it.
    const db = await getDb()
    const existing = await db.reviewItem.count({ where: { todoId, status: 'pending' } })
    if (existing > 0) return

    const ask = workerAsk(todoId, text)
    const task = await createTask(ask, APOLLO_MODEL)
    if (!task) return
    await runApollo(task.id, ask)
  } catch {
    // Best-effort: the to-do stands either way; the reader can always ask
    // Apollo by hand.
  }
}
