# The Allocator — Product Vision & Harness

The owner's standing mental model for this product. Filed 18 August 2026,
from his own words and diagram; keep this current as the system evolves,
and read it before designing anything structural.

## The shape of the system

Three layers, top to bottom (per the owner's notebook diagram):

1. **Entry pathways** — many doors, one desk. Tasks can be kicked off:
   - **In the Allocator itself** (the Docket) — live.
   - **By email** — live, both ways: forward/self-send to the connected
     Gmail with "Allocator:"/"Task:" in the subject, or a provisioned
     `task-<token>@<domain>` inbound address.
   - **By text/SMS** — planned, deliberately deferred (Twilio when ready).
   Regardless of the door, everything lands in the Allocator and starts
   executing automatically (classifier → docket worker → The Proofs).

2. **The Allocator layer** — the app itself: the Docket, Apollo and its
   skills, The Proofs review tray, the learning loop (lessons, exemplars,
   redline, straight-through-processing ledger).

3. **The database layer** — the leverage. Its purpose is not storage but
   **improving the quality of task output**. Getting tasks right is
   mostly getting context right.

## The context table (BUILT — "The Register", /register)

The owner's words: a context table that tracks, per company —

- the **company name**
- the **founder's first name**
- **context** (what the company does, stage, the hook, whatever informs
  outreach and analysis)

Behavior: **almost continuously, on a batch process**, the system builds
out each company's entry — enrichment runs in the background, not just at
task time. The table then **informs downstream workstreams**: cold
outreach drafting, follow-ups, dossiers, analyses. Today's per-proof
`dossier`/`grounding` fields are per-task exhaust; the context table makes
that knowledge cumulative and reusable.

Built 18 August 2026: CompanyContext model, read_company_context/save_company_context Apollo tools, nightly enrichment in the cron, editable Register page. Original design notes: per-workspace like everything else; the
docket worker should read it before researching (cache hit = fewer web
searches, more consistent facts) and write back what it learns; a batch
enrichment pass (cron) keeps entries fresh; entries should be editable in
the UI like the Book.

## The provider bench (BUILT — "The Bench", /bench)

The owner wants the web-research layer contestable: Anthropic's bundled
web_search, OpenAI's Responses web_search, Exa, and Parallel run the
**identical enrichment charge** head-to-head, compared in a
spreadsheet-style grid inside the app (rows = companies, columns =
engines). The reader's eye is the judge — a crowned winner per row, a
running tally (wins, failures, latency), and a "File to the Register"
promotion for the best cell. Built 18 August 2026: the pluggable engine
layer lives in `src/lib/research/` (the Register's enrichment now runs on
the same Anthropic adapter), keys via `OPENAI_API_KEY` / `EXA_API_KEY` /
`PARALLEL_API_KEY`, model/processor overrides via `BENCH_OPENAI_MODEL` /
`BENCH_PARALLEL_PROCESSOR`. The standing intent: once the tally crowns a
sustained winner, the Register's default engine becomes a setting.
The charges themselves are editable in-app (the Bench's "The Charges"
section, per engine with apply-to-all); templates store per workspace in
`BenchCharge`, tokens fill in per row, and an emptied save restores the
house default in code.

Added 20 August 2026: the Bench runs two sheets — **Company** (the
original bake-off) and **People** — switched by buttons under the
back-to-Register link. A person seats with any two of full name /
company / LinkedIn URL; the identical four engines then summarize their
professional background and best-guess a work email (published address
or the company's email pattern). Same crowning, tally, and standings
machinery; People rows don't file to the Register (it holds companies).

## Other standing intents

- **Open-source release** planned: the app as a clonable "operating
  system" for third parties (work-specific clones). Before the repo goes
  public: move the personal email voice profile out of source into the
  primary workspace's database, scrub seeds/history, add a license.
- **Multi-tenant hosted instance**: self-serve Google sign-up is live —
  a new user lands in their own empty workspace. `INVITE_ONLY=true`
  closes circulation for private clones.
- Before publicizing signup: per-workspace bring-your-own-Anthropic-key
  UI (column exists on `Workspace`), usage caps, Postgres RLS as a second
  tenancy wall, workspace export/delete.
- **Email drafting always goes through the voice-profile skill
  (founder-email) or a reader-authored playbook — never the Apollo core
  system prompt.** This is a hard rule from the owner.
