import { createTask } from './store'
import { runApollo, APOLLO_MODEL } from './run'
import { activeWorkspaceId, runAsWorkspace } from '../tenant'

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

Draft that email and stage it for the reader's signature. Follow this procedure exactly — it is a short job, not an investigation. Budget: at most 10 tool calls, at most 3 web searches.

STEP 1 — Who is this? If the to-do names a person, read_contact them first; if it names a company, read_book to see if anyone there is known. The Book's segment decides the AUDIENCE: Founders/Co-investors on a company matter → "founder"; LPs → "investor"; anything else (or advisors, counsel, scheduling) → "other". A company not in the Book at all is founder outreach.

STEP 1b — The Register. When a company is in play, read_company_context BEFORE any web research. A good entry gives you the founder's first name, what the company does, the site, often the address — trust it for identity, verify only what looks time-sensitive, and spend your web searches on what it lacks.

STEP 2 — Thread check. search_email for the person or company.
- A thread EXISTS: read_email the most recent message. mode = "follow_up"; the recipient, address, and threadId come from the thread.
- NO thread: mode = "cold". For founder audience, whatever the Register did not already answer, search the web: what the company does and — most important — WHO THE FOUNDER IS AND THEIR FIRST NAME. Also capture the founder's LinkedIn profile URL whenever it surfaces, and the company's homepage URL (https://…). Address: a real one if research surfaced it, else best-guess firstname@companydomain.com and say so plainly in the proof's summary line. If NO plausible email exists at all (no address found and no clean domain to guess against), stage with the linkedinUrl INSTEAD of "to" and say in the summary that this one goes out over LinkedIn.
- Either way, once you know things the Register did not: save_company_context with the company name, founder first name (and full name), a tight 3-8 sentence context, and the site/email/LinkedIn you surfaced. The next task on this company starts from your entry.

STEP 2b — Scheduling check (follow-ups only). If the thread shows the other party AGREED to meet or asked for times, call propose_times (pass meeting length and their timezone if the thread reveals them) and include the returned windows in the draft VERBATIM, as a bulleted list. Never compose availability yourself; if propose_times fails, the draft says you will follow up with times rather than inventing any.

STEP 2c — Podcast invitations only. If the to-do invites someone onto the reader's podcast: after gathering context (the Register first, research for what it lacks), call podcast_context_line with the company, the founder, and everything gathered. It returns 2-3 context-line options plus a recommendation. Then draft ONE COMPLETE EMAIL PER OPTION with the STEP 3 playbook (the reader's podcast-invite authored playbook when one matches, else draft_founder_email) — each call's context carries that option's line with the instruction: include verbatim, as its own sentence — "I think a ton of people would love to hear more about <the option>, and just in general how you're thinking about the business." No paraphrasing the line. Stage ONE proof carrying every draft via stage_proof's variants (RECOMMENDED option's draft FIRST, each labeled by its angle); body and subject carry the recommended draft.

STEP 3 — Draft by playbook, in this order of precedence:
- AUTHORED PLAYBOOK FIRST: if the reader has authored playbooks (listed in your system prompt with their skillIds) and this to-do matches one's trigger, you MUST call draft_with_skill with that skillId — it overrides both rules below. Context you pass carries ONLY facts about the recipient and the thread — never the reader's own identity or how this workspace describes him. Say in the proof's summary which playbook drafted it.
- FOUNDER audience (no authored playbook matched): you MUST call draft_founder_email — the skill writes in the reader's real sent-mail voice; you do not. Context rules as above. If propose_times returned windows, put them in the context with the instruction: include these exact windows verbatim as the availability list.
- INVESTOR or OTHER audience (no authored playbook matched): the founder playbook is BARRED (its voice does not extrapolate). Draft directly: plain, courteous, brief, matter-at-hand only. State NOTHING about the reader's identity or firm from your own framing — if the thread or the Book does not supply it, leave it out. Flag in the proof's summary that this is outside the tuned playbook.

STEP 4 — Stage it VERBATIM. stage_proof with kind "email", the draft exactly as produced (for skill drafts: no polishing, no grammar fixes — the quirks are the voice), the recipient's address in "to" (or linkedinUrl in its place when no email exists — pass linkedinUrl whenever you have it either way), threadId when following up, ${todoId ? `todoId "${todoId}" so signing it clears the to-do, ` : ''}audience and mode as determined above, and grounding = the same context that informed the draft (thread summary or research findings, with source attributions). Also pass dossier — a short brief on the RECIPIENT for the foot of the review page: who they are, background, what the company does, stage/funding if known, and why now; 4–8 tight lines, every one grounded in your research, none invented — and websiteUrl (the company homepage) when research surfaced it. You must ALWAYS stage exactly one proof — a flagged best-guess beats no draft.

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
    // Runs post-response, where the request context may be gone — the
    // to-do row itself names the workspace this run belongs to.
    let ws = await activeWorkspaceId()
    if (todoId) {
      const db = await getDb()
      const todo = await db.todo.findUnique({ where: { id: todoId } })
      if (todo) ws = (todo as any).workspaceId ?? ws
    }
    await runAsWorkspace(ws, async () => {
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
    })
  } catch {
    // Best-effort: the to-do stands either way; the reader can always ask
    // Apollo by hand.
  }
}
