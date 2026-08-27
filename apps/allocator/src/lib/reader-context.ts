// Dez's Context: standing notes the reader files by hand in Settings —
// how he thinks about spaces, businesses, and what makes one worth a cold
// email. Every note is handed to the drafting pass before any cold email.
// Manual for now; other feeds may add to it later.

export type ContextNote = {
  id: string
  text: string
  filedOn: string
}

const TZ = process.env.APP_TIMEZONE ?? 'America/New_York'
const hasDb = () => Boolean(process.env.DATABASE_URL)

const dateLabel = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'long' }).format(d)

async function getDb() {
  const { db } = await import('./db')
  return db
}

export async function listContextNotes(): Promise<{ live: boolean; notes: ContextNote[] }> {
  if (!hasDb()) return { live: false, notes: [] }
  try {
    const db = await getDb()
    const rows = await db.readerContextNote.findMany({ orderBy: { createdAt: 'asc' } })
    return {
      live: true,
      notes: rows.map((r: any) => ({ id: r.id, text: r.text, filedOn: dateLabel(r.createdAt) })),
    }
  } catch {
    return { live: false, notes: [] }
  }
}

export async function addContextNote(text: string): Promise<ContextNote | null> {
  if (!hasDb() || !text.trim()) return null
  try {
    const db = await getDb()
    const row = await db.readerContextNote.create({ data: { text: text.trim().slice(0, 4000) } })
    return { id: row.id, text: row.text, filedOn: dateLabel(row.createdAt) }
  } catch {
    return null
  }
}

export async function removeContextNote(id: string): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    await db.readerContextNote.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

// The composed block for the drafting pass: every note, oldest first, as
// one plain-text run. '' when the shelf is empty.
export async function contextNotesBlock(): Promise<string> {
  const { notes } = await listContextNotes()
  return notes.map((n) => n.text).join('\n\n')
}
