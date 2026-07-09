export type NoteRecord = {
  id: string
  title: string
  body: string
  date: string
}

const TZ = process.env.APP_TIMEZONE ?? 'America/New_York'
const hasDb = () => Boolean(process.env.DATABASE_URL)

function dateLabel(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'long' }).format(d)
}

// Dynamic import keeps the zero-env mock path from ever touching Prisma.
async function getDb() {
  const { db } = await import('./db')
  return db
}

const toRecord = (r: any): NoteRecord => ({
  id: r.id,
  title: r.title,
  body: r.body,
  date: dateLabel(r.createdAt),
})

export async function listNotes(): Promise<{ live: boolean; notes: NoteRecord[] }> {
  if (!hasDb()) return { live: false, notes: [] }
  try {
    const db = await getDb()
    const rows = await db.filedNote.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
    return { live: true, notes: rows.map(toRecord) }
  } catch {
    return { live: false, notes: [] }
  }
}

export async function createNote(input: { title: string; body: string }): Promise<NoteRecord | null> {
  if (!hasDb()) return null
  try {
    const db = await getDb()
    const row = await db.filedNote.create({ data: input })
    return toRecord(row)
  } catch {
    return null
  }
}
