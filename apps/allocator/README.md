# The Allocator

A private morning brief for a solo alternative-asset manager. Mobile-first, editorial by design. Runs fully mocked with zero configuration; with the backend configured, The Brief (`/brief`) carries tomorrow's real schedule with meeting-prep notes drawn from Granola.

Meant to travel: fork it, set `NEXT_PUBLIC_READER_NAME` and your own keys, and it's your brief. Everything degrades to seeded mock content without a database, so the demo works before any setup.

**The interactive layer** (all database-backed, all optional):

- **The Docket** (`/todos`) — add, clear, restore; cleared items file to the record at local midnight, and open items appear in the morning Brief.
- **The Margin** (bottom of `/news`) — think aloud or dictate; the desk replies inline in the house voice. Yesterday's entries return each morning as **Worth Reciting** recall cues in the Brief — active recall for things worth retaining.
- **Research intake** (`/research/new`) — a new thesis begins with a short interview; the desk asks a few questions, then drafts the research charter and files it. Theses can be retired from their page. With a database connected, Research starts as a blank slate.
- **The Book** — add contacts from the app; they persist alongside the seeded cast.

## Apollo Agent

The home page is **Apollo**: hand it a task ("prep me for the week", "find what I'm about to drop", "research X against my theses") and it works the problem — an agentic Claude loop (`claude-opus-4-8` by default; `APOLLO_MODEL` to override) with typed tools over the app's own data (docket, book, theses, margin, calendar, meeting notes), web search, and **logged write access** (it can file to-dos, add contacts, and file margin notes; every mutation appears in the task's working papers). Results are filed as an editorial briefing at `/apollo/<id>`.

Apollo is also a continual-learning experiment:

- **Every task's full trace is captured** (the messages array, tool calls included) — the future fine-tuning dataset. Pull it as JSONL: `curl -H "Authorization: Bearer $CRON_SECRET" <url>/api/apollo/export`.
- **Verdicts teach it.** Each "Good work / Needs another pass" (plus your optional note) is distilled into one lesson, and the latest lessons ride in every future system prompt — prompt-side continual learning, live from day one.
- **The executor is swappable.** Claude isn't publicly fine-tunable; the export targets an eventual open-weights student model. `APOLLO_MODEL` keeps that a config change, not a rewrite.

## Running it

```bash
pnpm install
pnpm dev          # http://localhost:5821 — mocked edition, no env vars needed
```

With no `DATABASE_URL`, every surface serves the seeded mock content and the middleware stays open in dev. Production **fails closed** without `APP_PASSWORD`.

## Backend setup (calendar + Granola → the daily edition)

### 1. Database — Neon Postgres via Vercel Marketplace

On the `warriors-allocator` Vercel project: **Storage → Create Database → Neon**. This auto-provisions `DATABASE_URL` and `DATABASE_URL_UNPOOLED`. Then locally:

```bash
cd apps/allocator
vercel link --scope william-shockleys-projects --project warriors-allocator
vercel env pull .env   # brings DATABASE_URL etc. into local dev
pnpm db:push           # creates the four tables (no migrations dir — db push, as in apps/web)
```

### 2. Environment variables

```bash
vercel env add APP_PASSWORD        # access gate — the app is unusable in prod without it
vercel env add CRON_SECRET         # protects /api/cron/brief (Vercel sends it automatically)
vercel env add ANTHROPIC_API_KEY   # brief assembly
vercel env add GOOGLE_CLIENT_ID    # same "Warriors Local" OAuth client as apps/web
vercel env add GOOGLE_CLIENT_SECRET
vercel env add GRANOLA_API_KEY     # starts with grn_ — Granola workspace settings (Business plan)
vercel env add NEXT_PUBLIC_APP_URL # prod URL, no trailing slash
vercel env add APP_TIMEZONE        # e.g. America/New_York (defaults to it)
```

Mirror the same keys in `.env` for local dev (`.env.example` lists them all).

### 3. Google Cloud Console — one-time

The "Warriors Local" OAuth client already has the calendar scope in use. Add the allocator's redirect URIs under **APIs & Services → Credentials → Warriors Local → Authorized redirect URIs**:

- `http://localhost:5821/api/auth/google/callback`
- `https://<your-prod-domain>/api/auth/google/callback`

Then visit `/api/auth/google` (once, from a logged-in session) and grant read-only calendar access. The token lives in the `GoogleToken` singleton row and refreshes itself.

### 4. The daily edition

`vercel.json` schedules `GET /api/cron/brief` at **09:00 UTC** — 5 a.m. New York in summer, 4 a.m. in winter (Vercel cron is UTC-only; shift to `0 10 * * *` for the winter months if the hour matters to you).

The job is idempotent: calendar events upsert by Google event id, Granola notes by note id, and the edition row is keyed by local date — re-running simply overwrites today's edition.

**Manual sync / testing:**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<prod-domain>/api/cron/brief
# or locally:
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:5821/api/cron/brief
```

The response reports each step: `{ calendar: {...}, granola: {...}, brief: {...} }`. Steps degrade independently — a Granola failure still leaves you a calendar-only edition, and any assembly failure leaves `/brief` serving the previous (or mock) edition. It never breaks the page.

## Architecture notes

- **Patterns are copied from `apps/web`**, per the monorepo rule against shared packages: the lazy-Proxy Prisma client (`src/lib/db.ts`), OAuth state-cookie flow (`src/lib/google.ts`), retry-with-backoff (`src/lib/retry.ts`), the `APP_PASSWORD` middleware, and the cron shape.
- **Granola**: official public API (`public-api.granola.ai/v1`), cursor pagination, last 7 days, sequential requests under the 5 req/s limit, 429s retried with backoff. Notes without a generated summary are skipped. Action items aren't a discrete API field — they're extracted from summaries by Claude at assembly time.
- **Linking**: a note attaches to a calendar event on matching title + start (±15 min), else attendee-email overlap. The "last time with this person" context in the Brief comes from these links plus attendee-shared recent notes.
- **Times are never written by the model.** The schedule section renders verbatim from the database; Claude only writes the editorial layer (lead, digest, one prep line per meeting).
