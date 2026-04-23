# Warriors

A personal VC workflow hub. Manage targets, track activity, monitor news, run AI-powered skills, and rank your top companies — all in one place.

Built with Next.js, Prisma, SQLite, and Claude.

![Warriors](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Targets** — CRM-style contact list with status tracking, activity log, and Gmail sync
- **Top Companies** — Ranked list of your top 10 most exciting companies, drag to reorder
- **Research** — Auto-generated company briefs powered by Claude
- **News** — Live news feed for every company you're tracking
- **Skills** — Reusable Claude prompt templates with variable substitution
- **Adapt** — Modify the app itself in plain English

## Running your own instance

### 1. Clone and install

```bash
git clone https://github.com/WilliamAShockley/warriors
cd warriors
pnpm install
```

### 2. Set up environment variables

```bash
cp apps/web/.env.example apps/web/.env.local
```

Fill in your keys:

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | [Google Cloud Console](https://console.cloud.google.com) — create an OAuth 2.0 client, set redirect URI to `http://localhost:5820/api/auth/gmail/callback` |
| `NEXTAUTH_URL` | `http://localhost:5820` for local dev |

### 3. Set up the database

```bash
cd apps/web
pnpm prisma db push
```

### 4. Run

```bash
pnpm dev
```

Open [http://localhost:5820](http://localhost:5820).

## Tech stack

- [Next.js 15](https://nextjs.org) — App Router
- [Prisma](https://prisma.io) + SQLite — local-first database
- [Anthropic Claude](https://anthropic.com) — AI features
- [Tailwind CSS](https://tailwindcss.com) — styling
- [pnpm](https://pnpm.io) workspaces — monorepo
