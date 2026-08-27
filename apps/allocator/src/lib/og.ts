// OG — the cold-draft test bench. Rows are companies under trial: seat one
// by name (the first sheet) or by URL (the second — the same machinery,
// kept apart so the two input shapes can be compared), and the row runs
// the desk's real cold pipeline end to end: the research bench's engines,
// then the founder-email skill in Dez's voice, then every straight-through
// check as its own column. The full evidence — research, draft, checks —
// files on the row, so a red cell can be diagnosed at the source.

import { STP_CHECKS, runStpChecks, type StpResult } from './stp'

const hasDb = () => Boolean(process.env.DATABASE_URL)

async function getDb() {
  const { db } = await import('./db')
  return db
}

export type OgTab = 'name' | 'url'

export type OgResearchRecord = {
  provider: string
  founderFirstName: string | null
  founderFullName: string | null
  brief: string
  websiteUrl: string | null
  guessedEmail: string | null
  citations: { title?: string; url: string }[]
  readerView: string
}

export type OgRowRecord = {
  id: string
  tab: OgTab
  input: string
  status: string // running | done | failed
  company: string | null
  founderName: string | null
  provider: string | null
  research: OgResearchRecord | null
  draft: { subject: string; body: string } | null
  stp: StpResult[]
  error: string | null
  ranOn: string | null
}

export type OgColumn = { id: string; label: string }

export type OgSheet = {
  live: boolean
  tab: OgTab
  columns: OgColumn[]
  // Registry checks not currently shown — the add-a-column menu.
  available: OgColumn[]
  rows: OgRowRecord[]
}

const registryColumns = (): OgColumn[] => STP_CHECKS.map((c) => ({ id: c.id, label: c.label }))

// ── Column picks (ReaderSetting.ogColumnsJson) ────────────────────

export async function getOgColumns(): Promise<OgColumn[]> {
  const all = registryColumns()
  if (!hasDb()) return all.slice(0, 12)
  try {
    const db = await getDb()
    const { activeWorkspaceId } = await import('./tenant')
    const row = await db.readerSetting.findUnique({ where: { id: await activeWorkspaceId() } })
    if (!row?.ogColumnsJson) return all.slice(0, 12)
    const ids = JSON.parse(row.ogColumnsJson) as string[]
    const byId = new Map(all.map((c) => [c.id, c]))
    const picked = ids.map((id) => byId.get(id)).filter(Boolean) as OgColumn[]
    return picked.length ? picked : all.slice(0, 12)
  } catch {
    return all.slice(0, 12)
  }
}

export async function setOgColumns(ids: string[]): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    const { activeWorkspaceId, ensureAdopted } = await import('./tenant')
    const { getReaderName } = await import('./settings')
    await ensureAdopted()
    const ws = await activeWorkspaceId()
    const valid = new Set(STP_CHECKS.map((c) => c.id))
    const cleaned = ids.filter((id) => valid.has(id))
    await db.readerSetting.upsert({
      where: { id: ws },
      create: { id: ws, name: await getReaderName(), ogColumnsJson: JSON.stringify(cleaned) },
      update: { ogColumnsJson: JSON.stringify(cleaned) },
    })
    return true
  } catch {
    return false
  }
}

// ── The sheet ─────────────────────────────────────────────────────

const parseJson = <T>(s: string | null): T | null => {
  if (!s) return null
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

export async function listOg(tab: OgTab): Promise<OgSheet> {
  const columns = await getOgColumns()
  const shown = new Set(columns.map((c) => c.id))
  const available = registryColumns().filter((c) => !shown.has(c.id))
  if (!hasDb()) return { live: false, tab, columns, available, rows: [] }
  const db = await getDb()
  const rows = await db.ogRun.findMany({ where: { tab }, orderBy: { createdAt: 'desc' }, take: 100 })
  return {
    live: true,
    tab,
    columns,
    available,
    rows: rows.map((r: any): OgRowRecord => ({
      id: r.id,
      tab: r.tab as OgTab,
      input: r.input,
      status: r.status,
      company: r.company,
      founderName: r.founderName,
      provider: r.provider,
      research: parseJson<OgResearchRecord>(r.researchJson),
      draft: parseJson<{ subject: string; body: string }>(r.draftJson),
      stp: parseJson<StpResult[]>(r.stpJson) ?? [],
      error: r.error,
      ranOn: r.updatedAt?.toISOString?.() ?? null,
    })),
  }
}

// ── Seating and running a row ─────────────────────────────────────

// URL-tab inputs arrive as bare domains or full addresses; the company
// name is derived from the hostname the way the old pipeline did.
const companyFromUrl = (input: string): { company: string; websiteUrl: string } => {
  const websiteUrl = /^https?:\/\//.test(input) ? input : `https://${input}`
  const hostname = websiteUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  const raw = hostname.split('.')[0] || input
  return { company: raw.charAt(0).toUpperCase() + raw.slice(1), websiteUrl }
}

export async function seatOgRun(tab: OgTab, input: string): Promise<string | null> {
  if (!hasDb()) return null
  const db = await getDb()
  const row = await db.ogRun.create({ data: { tab, input: input.trim(), status: 'running' } })
  return row.id
}

export async function strikeOgRun(id: string): Promise<void> {
  if (!hasDb()) return
  const db = await getDb()
  await db.ogRun.deleteMany({ where: { id } })
}

/**
 * The trial itself, run post-response: research the company (the bench's
 * engines, Register filed as a side effect), draft the cold email with the
 * founder-email skill exactly as the Docket worker would, then hold the
 * draft to every applicable straight-through check. Failures file on the
 * row rather than throwing — a red row is a result, not a crash.
 */
export async function runOgRow(id: string): Promise<void> {
  if (!hasDb()) return
  const db = await getDb()
  const row = await db.ogRun.findFirst({ where: { id } })
  if (!row) return

  try {
    const seat =
      row.tab === 'url'
        ? companyFromUrl(row.input)
        : { company: row.input.trim(), websiteUrl: undefined as string | undefined }

    // 1. Research — same pass the worker's research_company tool runs.
    const { researchCompany } = await import('./apollo/company-research')
    const research = await researchCompany({
      company: seat.company,
      websiteUrl: seat.websiteUrl,
      taskContext: `Cold outreach trial from the OG bench (seated by ${row.tab === 'url' ? 'URL' : 'company name'}).`,
    })
    if ('error' in research) {
      await db.ogRun.update({
        where: { id },
        data: { status: 'failed', company: seat.company, error: `Research: ${research.error}` },
      })
      return
    }

    // 2. Draft — the founder-email skill, cold mode, Dez's Context riding
    // in exactly as production hands it over.
    const founder =
      research.founderFullName || research.founderFirstName || `the founder of ${seat.company}`
    const contextBlock = [
      `RESEARCH BRIEF (engine: ${research.provider})`,
      research.founderFullName || research.founderFirstName
        ? `Founder: ${research.founderFullName ?? research.founderFirstName}`
        : 'Founder: not established by research',
      research.websiteUrl ? `Site: ${research.websiteUrl}` : null,
      '',
      research.brief,
      research.citations.length
        ? `\nSources:\n${research.citations.map((c) => `- ${c.title ? `${c.title} — ` : ''}${c.url}`).join('\n')}`
        : null,
    ]
      .filter((l) => l !== null)
      .join('\n')

    const { draftFounderEmail } = await import('./apollo/skills/founder-email')
    const { getReaderName } = await import('./settings')
    const draft = await draftFounderEmail(
      {
        mode: 'cold',
        founder,
        firm: seat.company,
        context: contextBlock,
        readerView: research.readerView || undefined,
      },
      await getReaderName()
    )

    // 3. The checks — the same registry the proof room runs at staging.
    const { findCompany } = await import('./context')
    const register = await findCompany(seat.company).catch(() => null)
    const stp = await runStpChecks({
      body: draft.body,
      subject: draft.subject ?? null,
      to: research.guessedEmail,
      mode: 'cold',
      audience: 'founder',
      grounding: contextBlock,
      register: register
        ? { founderFirstName: register.founderFirstName ?? null, founderFullName: register.founderFullName ?? null }
        : null,
    })

    await db.ogRun.update({
      where: { id },
      data: {
        status: 'done',
        company: seat.company,
        founderName: research.founderFullName ?? research.founderFirstName ?? null,
        provider: research.provider,
        researchJson: JSON.stringify(research),
        draftJson: JSON.stringify(draft),
        stpJson: JSON.stringify(stp),
        error: null,
      },
    })
  } catch (err) {
    await db.ogRun.update({
      where: { id },
      data: { status: 'failed', error: err instanceof Error ? err.message : 'The trial failed.' },
    })
  }
}
