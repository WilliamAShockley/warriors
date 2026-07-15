import { createTask } from './store'
import { runApollo, APOLLO_MODEL } from './run'

// The docket worker: when a to-do calls for an email, Apollo picks it up
// unbidden — thread check first, then research if cold, then one staged
// proof tied to the to-do. The reader's part is the signature.

const hasDb = () => Boolean(process.env.DATABASE_URL)

async function getDb() {
  const { db } = await import('../db')
  return db
}

// The drafting doctrine — appended to the system prompt for worker runs,
// so it governs the email itself rather than competing with the task text.
const EMAIL_DOCTRINE = `The email doctrine (this task drafts an email — these rules govern the draft):
- Follow-ups quote nothing back and re-explain nothing; they pick up exactly where the last message left off, in one or two sentences plus the ask.
- Cold notes are four sentences at most: who the reader is (one clause, not a resume), the one specific thing about THEIR company that makes this note theirs and no one else's, and a single clear ask — usually twenty minutes. Address the founder by first name.
- No "hope this finds you well", no "I was impressed by", no flattery padding, no exclamation marks. The specificity IS the compliment.
- Sign off simply with the reader's first name.
- The subject line is plain and concrete: their company's name and the reason, e.g. "Freeport — quick question from an allocator".`

const workerAsk = (todoId: string, text: string) => `A to-do just landed on the Docket that calls for an email: "${text}" (Docket id ${todoId}).

Draft that email and stage it for the reader's signature. Follow this procedure exactly — it is a short job, not an investigation. Budget: at most 6 tool calls, at most 3 web searches.

STEP 1 — Thread check (always first). search_email for the company or person named in the to-do.
- If a thread EXISTS: read_email the most recent message. This is a FOLLOW-UP — the draft continues that conversation from where it left off, addressed to the same person, staged with their address and the threadId. Skip Step 2 entirely.
- If NO thread: this is a COLD email. Go to Step 2.

STEP 2 — Cold email research (only when there is no thread). Search the web for the company: what it does, and — most important — WHO THE FOUNDER IS AND THEIR FIRST NAME. One or two searches, three at most. Use what you learn for exactly two things: address the founder by first name, and make one line of the body specific to what they are building. For the address: use the founder's real email if research surfaced one; otherwise best-guess the pattern firstname@companydomain.com and say so plainly in the proof's summary line.

STEP 3 — Stage it. stage_proof with kind "email", the recipient's address in "to", and todoId "${todoId}" so signing it clears the to-do. You must ALWAYS stage exactly one proof, even if research came up thin — a short honest draft with a flagged best-guess address beats no draft.

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
    await runApollo(task.id, ask, { systemAppendix: EMAIL_DOCTRINE })
  } catch {
    // Best-effort: the to-do stands either way; the reader can always ask
    // Apollo by hand.
  }
}
