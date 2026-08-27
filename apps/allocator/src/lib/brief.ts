import { briefLead, briefItems, type BriefItem } from './data'
import type { RecallCue, ScheduleEntry } from './assembleBrief'

export type BriefData = {
  lead: typeof briefLead | null
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

// Today's edition from the database; the seeded mock belongs to zero-env
// demos ONLY. A live desk with no edition yet (a brand-new workspace, or
// before the first overnight run) gets an honest empty edition instead of
// fiction. The mock path must never touch Prisma, hence dynamic imports.

const emptyEdition: BriefData = { lead: null, items: [], schedule: null, recall: [], live: true }
export async function getBrief(): Promise<BriefData> {
  if (!process.env.DATABASE_URL) return mockEdition

  try {
    const [{ db }, { localDateString }] = await Promise.all([
      import('./db'),
      import('./calendar'),
    ])
    const edition = await db.briefEdition.findFirst({ where: { date: localDateString() } })
    if (!edition) return emptyEdition

    return {
      lead: JSON.parse(edition.leadJson),
      items: JSON.parse(edition.itemsJson),
      schedule: JSON.parse(edition.scheduleJson),
      recall: edition.recallJson ? JSON.parse(edition.recallJson) : [],
      live: true,
    }
  } catch {
    return emptyEdition
  }
}
