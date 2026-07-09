import { briefLead, briefItems, type BriefItem } from './data'
import type { RecallCue, ScheduleEntry } from './assembleBrief'

export type BriefData = {
  lead: typeof briefLead
  items: BriefItem[]
  schedule: ScheduleEntry[] | null
  recall: RecallCue[]
  live: boolean
}

const mockEdition: BriefData = {
  lead: briefLead,
  items: briefItems,
  schedule: null,
  recall: [],
  live: false,
}

// Today's edition from the database, or the seeded mock when the backend
// isn't configured / hasn't produced one. The mock path must never touch
// Prisma (zero-env demos), hence the dynamic imports.
export async function getBrief(): Promise<BriefData> {
  if (!process.env.DATABASE_URL) return mockEdition

  try {
    const [{ db }, { localDateString }] = await Promise.all([
      import('./db'),
      import('./calendar'),
    ])
    const edition = await db.briefEdition.findUnique({ where: { date: localDateString() } })
    if (!edition) return mockEdition

    return {
      lead: JSON.parse(edition.leadJson),
      items: JSON.parse(edition.itemsJson),
      schedule: JSON.parse(edition.scheduleJson),
      recall: edition.recallJson ? JSON.parse(edition.recallJson) : [],
      live: true,
    }
  } catch {
    return mockEdition
  }
}
