import type { Segment } from './data'

export type BookRecord = {
  id: string
  name: string
  role: string
  firm: string
  segment: Segment
  context: string
  relationship: string | null
  followUp: string | null
  location: string | null
  addedOn: string
}

const hasDb = () => Boolean(process.env.DATABASE_URL)

async function getDb() {
  const { db } = await import('./db')
  return db
}

const toRecord = (r: any): BookRecord => ({
  id: r.id,
  name: r.name,
  role: r.role,
  firm: r.firm,
  segment: r.segment as Segment,
  context: r.context,
  relationship: r.relationship,
  followUp: r.followUp,
  location: r.location,
  addedOn: r.createdAt.toISOString().slice(0, 10),
})

export async function listDbContacts(): Promise<BookRecord[]> {
  if (!hasDb()) return []
  try {
    const db = await getDb()
    const rows = await db.bookContact.findMany({ orderBy: { createdAt: 'asc' } })
    return rows.map(toRecord)
  } catch {
    return []
  }
}

export async function getDbContact(id: string): Promise<BookRecord | null> {
  if (!hasDb()) return null
  try {
    const db = await getDb()
    const row = await db.bookContact.findUnique({ where: { id } })
    return row ? toRecord(row) : null
  } catch {
    return null
  }
}

export async function createContact(input: {
  name: string
  role: string
  firm: string
  segment: string
  context: string
}): Promise<BookRecord | null> {
  if (!hasDb()) return null
  try {
    const db = await getDb()
    const row = await db.bookContact.create({ data: input })
    return toRecord(row)
  } catch {
    return null
  }
}
