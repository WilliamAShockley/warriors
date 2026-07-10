import { userName as fallbackName } from './data'

const hasDb = () => Boolean(process.env.DATABASE_URL)

async function getDb() {
  const { db } = await import('./db')
  return db
}

// The reader's name: database first, NEXT_PUBLIC_READER_NAME as the
// zero-env fallback so forks work before any setup.
export async function getReaderName(): Promise<string> {
  if (!hasDb()) return fallbackName
  try {
    const db = await getDb()
    const row = await db.readerSetting.findUnique({ where: { id: 'singleton' } })
    return row?.name?.trim() || fallbackName
  } catch {
    return fallbackName
  }
}

export async function setReaderName(name: string): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    await db.readerSetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', name },
      update: { name },
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
    const row = await db.googleToken.findUnique({ where: { id: 'singleton' } })
    return row?.email ?? null
  } catch {
    return null
  }
}
