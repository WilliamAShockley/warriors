import { userName as fallbackName } from './data'

const hasDb = () => Boolean(process.env.DATABASE_URL)

async function getDb() {
  const { db } = await import('./db')
  return db
}

// The reader's name: their saved setting, else the first name from their
// sign-in identity, else a plain "Reader". The seeded name belongs to the
// zero-env demo and the primary desk only — a stranger's fresh workspace
// must never greet them as someone else.
export async function getReaderName(): Promise<string> {
  if (!hasDb()) return fallbackName
  try {
    const db = await getDb()
    const { activeWorkspaceId, ensureAdopted, PRIMARY_WORKSPACE } = await import('./tenant')
    await ensureAdopted()
    const ws = await activeWorkspaceId()
    const row = await db.readerSetting.findUnique({ where: { id: ws } })
    if (row?.name?.trim()) return row.name
    if (ws === PRIMARY_WORKSPACE) return fallbackName
    const { rawDb } = await import('./db')
    const user = await rawDb.user.findFirst({ where: { workspaceId: ws } })
    return user?.name?.trim().split(/\s+/)[0] || 'Reader'
  } catch {
    return fallbackName
  }
}

export async function setReaderName(name: string): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    const { activeWorkspaceId, ensureAdopted } = await import('./tenant')
    await ensureAdopted()
    const ws = await activeWorkspaceId()
    await db.readerSetting.upsert({
      where: { id: ws },
      create: { id: ws, name },
      update: { name },
    })
    return true
  } catch {
    return false
  }
}

// The context experiment switch: when on, cold founder drafts come as an
// A/B pair — with and without Dez's Context — decided in The Experiment.
// On by default; no row means on.
export async function getContextExperiment(): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    const { activeWorkspaceId } = await import('./tenant')
    const row = await db.readerSetting.findUnique({ where: { id: await activeWorkspaceId() } })
    return row ? Boolean(row.contextExperiment) : true
  } catch {
    return false
  }
}

export async function setContextExperiment(on: boolean): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    const { activeWorkspaceId, ensureAdopted } = await import('./tenant')
    await ensureAdopted()
    const ws = await activeWorkspaceId()
    const name = await getReaderName()
    await db.readerSetting.upsert({
      where: { id: ws },
      create: { id: ws, name, contextExperiment: on },
      update: { contextExperiment: on },
    })
    return true
  } catch {
    return false
  }
}

// The Google account the calendar is connected as, for display.
export async function getConnectedAccount(): Promise<string | null> {
  if (!hasDb()) return null
  try {
    const db = await getDb()
    const { activeWorkspaceId, ensureAdopted } = await import('./tenant')
    await ensureAdopted()
    const row = await db.googleToken.findUnique({ where: { id: await activeWorkspaceId() } })
    return row?.email ?? null
  } catch {
    return null
  }
}
