import { AsyncLocalStorage } from 'node:async_hooks'
import crypto from 'node:crypto'

// The workspace context. Every request (and every background run) resolves
// to exactly one workspace; the db layer scopes every query to it.
//
// Resolution order:
//  1. An explicit runAsWorkspace() frame — background work (the docket
//     worker, the delivery watch, the brief cron) always wraps itself.
//  2. The request's session cookie — a signed identity token (Google
//     sign-in), or the pre-account password/guest session, which maps to
//     the "primary" workspace (the original single-tenant desk).
//  3. "primary" — so a fresh clone with no accounts behaves exactly like
//     the single-tenant app it grew from.

export const PRIMARY_WORKSPACE = 'primary'

const als = new AsyncLocalStorage<{ workspaceId: string }>()

export function runAsWorkspace<T>(workspaceId: string, fn: () => Promise<T>): Promise<T> {
  return als.run({ workspaceId }, fn)
}

// Legacy password sessions: sha256("allocator-session:" + word) — must stay
// in step with src/middleware.ts.
const legacyTokens = (): Set<string> => {
  const words = [
    ...(process.env.APP_PASSWORD ?? '').split(','),
    ...(process.env.APP_GUEST_PASSWORD ?? '').split(','),
  ]
    .map((s) => s.trim())
    .filter(Boolean)
  return new Set(
    words.map((w) => crypto.createHash('sha256').update(`allocator-session:${w}`).digest('hex'))
  )
}

export async function activeWorkspaceId(): Promise<string> {
  const frame = als.getStore()
  if (frame) return frame.workspaceId

  // Request path: read the cookies without assuming we are in a request.
  try {
    const { cookies } = await import('next/headers')
    const jar = await cookies()
    const identity = jar.get('allocator_id')?.value
    if (identity) {
      const { verifySession } = await import('./auth')
      const session = await verifySession(identity)
      if (session) return session.workspaceId
    }
    const legacy = jar.get('allocator_session')?.value
    if (legacy && legacyTokens().has(legacy)) return PRIMARY_WORKSPACE
  } catch {
    // Not in a request (build-time render, background without a frame).
  }
  return PRIMARY_WORKSPACE
}

// One-time adoption of the pre-account rows: the singleton GoogleToken and
// ReaderSetting become workspace "primary"'s, and the workspace row itself
// is guaranteed to exist. Everything else self-migrated via the schema's
// @default("primary"). Cheap and idempotent; runs once per boot.
let adopted: Promise<void> | null = null

export function ensureAdopted(): Promise<void> {
  if (!process.env.DATABASE_URL) return Promise.resolve()
  if (!adopted) {
    adopted = (async () => {
      try {
        const { rawDb } = await import('./db')
        await rawDb.workspace.upsert({
          where: { id: PRIMARY_WORKSPACE },
          create: { id: PRIMARY_WORKSPACE, name: 'The Desk' },
          update: {},
        })
        await rawDb.googleToken.updateMany({
          where: { id: 'singleton' },
          data: { id: PRIMARY_WORKSPACE },
        })
        await rawDb.readerSetting.updateMany({
          where: { id: 'singleton' },
          data: { id: PRIMARY_WORKSPACE },
        })
      } catch {
        // Adoption re-runs on the next boot; reads fall back gracefully.
        adopted = null
      }
    })()
  }
  return adopted
}
