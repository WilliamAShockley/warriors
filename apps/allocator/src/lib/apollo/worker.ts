import { createTask } from './store'
import { runApollo, APOLLO_MODEL } from './run'

// The docket worker: when a to-do calls for an email, Apollo picks it up
// unbidden — researches the recipient, drafts in the reader's voice, and
// stages the proof tied to the to-do. The reader's part is the signature.

const hasDb = () => Boolean(process.env.DATABASE_URL)

async function getDb() {
  const { db } = await import('../db')
  return db
}

const workerAsk = (todoId: string, text: string) => `A to-do just landed on the Docket that calls for an email: "${text}" (Docket id ${todoId}).

Draft that email and stage it for the reader's signature. Work it properly:
1. Identify the recipient. Check the Book (read_book) and search the mailbox for prior threads (search_email) — prior correspondence decides whether this is an outreach note or a follow-up, gives you their address, and tells you what was last said. If they are unknown to the workspace, search the web to learn who they are and what they are building.
2. Draft in the reader's voice: direct, warm, brief. Say the one thing the note exists to say. No hype, no filler, no "hope this finds you well".
3. Stage it with stage_proof — kind "email", the recipient's address in "to", and todoId "${todoId}" so signing it clears the to-do. Reply within the existing thread (threadId) when one exists. If you could not confirm an address, use your best guess and flag it plainly in the summary line.

Do NOT send the email directly, and do not file new to-dos. The staged proof is the deliverable — keep the final briefing to one short section on what you drafted and what you based it on.`

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
