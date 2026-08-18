// The Register — the context table. One entry per company: the name, the
// founder's first name, and the running context that informs every
// downstream workstream. The docket worker reads it BEFORE researching
// and writes back what it learns; a nightly pass keeps entries fresh;
// the reader edits it like anything else on the desk.

const hasDb = () => Boolean(process.env.DATABASE_URL)

async function getDb() {
  const { db } = await import('./db')
  return db
}

export type CompanyRecord = {
  id: string
  name: string
  founderFirstName: string | null
  founderFullName: string | null
  context: string | null
  websiteUrl: string | null
  founderEmail: string | null
  linkedinUrl: string | null
  enrichedOn: string | null
  enrichError: string | null
}

const TZ = process.env.APP_TIMEZONE ?? 'America/New_York'
const dateLabel = (d: Date | null) =>
  d
    ? new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'long' }).format(d)
    : null

export const nameKeyOf = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, '-')

const toRecord = (r: any): CompanyRecord => ({
  id: r.id,
  name: r.name,
  founderFirstName: r.founderFirstName,
  founderFullName: r.founderFullName,
  context: r.context,
  websiteUrl: r.websiteUrl,
  founderEmail: r.founderEmail,
  linkedinUrl: r.linkedinUrl,
  enrichedOn: dateLabel(r.lastEnrichedAt),
  enrichError: r.enrichError ?? null,
})

export async function listCompanies(): Promise<{ live: boolean; companies: CompanyRecord[] }> {
  if (!hasDb()) return { live: false, companies: [] }
  try {
    const db = await getDb()
    const rows = await db.companyContext.findMany({ orderBy: { updatedAt: 'desc' }, take: 200 })
    return { live: true, companies: rows.map(toRecord) }
  } catch {
    return { live: false, companies: [] }
  }
}

// Lookup by name: exact key first, then a contains match either way
// ("Nebra Exchange" finds "Nebex" only if the reader filed it that way —
// the key is honesty, not cleverness).
export async function findCompany(name: string): Promise<CompanyRecord | null> {
  if (!hasDb() || !name.trim()) return null
  try {
    const db = await getDb()
    const key = nameKeyOf(name)
    const exact = await db.companyContext.findFirst({ where: { nameKey: key } })
    if (exact) return toRecord(exact)
    const rows = await db.companyContext.findMany({ take: 200 })
    const loose = rows.find(
      (r: any) => r.nameKey.includes(key) || key.includes(r.nameKey)
    )
    return loose ? toRecord(loose) : null
  } catch {
    return null
  }
}

export type CompanyInput = {
  name: string
  founderFirstName?: string
  founderFullName?: string
  context?: string
  websiteUrl?: string
  founderEmail?: string
  linkedinUrl?: string
  enriched?: boolean // stamp lastEnrichedAt
}

// Merge-style upsert: provided fields land, absent fields survive. The
// worker and the enricher both come through here, so nothing learned is
// ever clobbered by a sparser update.
export async function upsertCompany(input: CompanyInput): Promise<CompanyRecord | null> {
  if (!hasDb() || !input.name.trim()) return null
  try {
    const db = await getDb()
    const { activeWorkspaceId } = await import('./tenant')
    const key = nameKeyOf(input.name)
    const data: Record<string, unknown> = {}
    if (input.founderFirstName?.trim()) data.founderFirstName = input.founderFirstName.trim().slice(0, 60)
    if (input.founderFullName?.trim()) data.founderFullName = input.founderFullName.trim().slice(0, 120)
    if (input.context?.trim()) data.context = input.context.trim().slice(0, 8000)
    if (input.websiteUrl && /^https?:\/\//.test(input.websiteUrl.trim()))
      data.websiteUrl = input.websiteUrl.trim().slice(0, 500)
    if (input.founderEmail?.trim()) data.founderEmail = input.founderEmail.trim().slice(0, 200)
    if (input.linkedinUrl?.trim()) data.linkedinUrl = input.linkedinUrl.trim().slice(0, 300)
    if (input.enriched) data.lastEnrichedAt = new Date()

    const row = await db.companyContext.upsert({
      where: { workspaceId_nameKey: { workspaceId: await activeWorkspaceId(), nameKey: key } },
      create: { name: input.name.trim().slice(0, 120), nameKey: key, ...data },
      update: data,
    })
    return toRecord(row)
  } catch {
    return null
  }
}

// Reader edits from the Register page: explicit field replacement,
// including clearing (empty string clears the optional fields).
export async function amendCompany(
  id: string,
  input: Partial<Omit<CompanyInput, 'enriched'>>
): Promise<CompanyRecord | null> {
  if (!hasDb()) return null
  try {
    const db = await getDb()
    const data: Record<string, unknown> = {}
    if (input.name !== undefined && input.name.trim()) {
      data.name = input.name.trim().slice(0, 120)
      data.nameKey = nameKeyOf(input.name)
    }
    if (input.founderFirstName !== undefined)
      data.founderFirstName = input.founderFirstName.trim().slice(0, 60) || null
    if (input.founderFullName !== undefined)
      data.founderFullName = input.founderFullName.trim().slice(0, 120) || null
    if (input.context !== undefined) data.context = input.context.trim().slice(0, 8000) || null
    if (input.websiteUrl !== undefined)
      data.websiteUrl = /^https?:\/\//.test(input.websiteUrl.trim())
        ? input.websiteUrl.trim().slice(0, 500)
        : null
    if (input.founderEmail !== undefined)
      data.founderEmail = input.founderEmail.trim().slice(0, 200) || null
    if (input.linkedinUrl !== undefined)
      data.linkedinUrl = input.linkedinUrl.trim().slice(0, 300) || null
    if (Object.keys(data).length === 0) return null
    const row = await db.companyContext.update({ where: { id }, data })
    return toRecord(row)
  } catch {
    return null
  }
}

export async function removeCompany(id: string): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    await db.companyContext.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

// The refresh model: Sonnet-tier is the cost/quality sweet spot for
// bounded factual lookups; override with ENRICH_MODEL to trade up.
const ENRICH_MODEL = process.env.ENRICH_MODEL || 'claude-sonnet-5'

export type RefreshResult = { ok: boolean; error?: string }

// Refresh ONE entry with a focused, bounded web check. Shared by the
// nightly pass, file-time enrichment, and the manual Research It Now.
// A failed refresh leaves the entry standing AND dateless, so the next
// pass retries it; the failure is logged and returned, never swallowed.
async function refreshEntry(db: any, row: any): Promise<RefreshResult> {
  try {
    const { anthropic } = await import('./claude')
    const { parseLLMJsonObject } = await import('./retry')
    // Generous ceiling: adaptive thinking and three search rounds all
    // count against max_tokens — a small cap truncates before the JSON.
    // A hard client-side timeout keeps the run inside the platform's
    // function window, so a hang becomes a recordable failure.
    const call = anthropic.messages.create({
      model: ENRICH_MODEL,
          max_tokens: 16000,
          output_config: { effort: 'medium' } as any,
          tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 } as any],
          messages: [
            {
              role: 'user',
              // The reader's own enrichment charge — filed 18 Aug 2026;
              // change it only at his direction.
              content: `Refresh a company-context entry with a quick web check (funding, product,
leadership changes — anything material and current). Ask yourself these questions. Did the company recently announce a fundraise? Did the company recently share some sort of blog or product announcement? Did the company recently come out of stealth? What is the main problem the company is trying to solve? What is the company's main product? Do they have any customers listed on their website? What broader investment theme does this company sit within? For Founder first name, we are specifically focused on the CEO

 We define recent as in the past 3 months from the date of this search. The date of this search: ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}. Keep what still holds;
correct what changed; add what's new. Be terse and factual.

CURRENT ENTRY:
Company: ${row.name}
Founder first name: ${row.founderFirstName ?? '(unknown)'}
Founder full name: ${row.founderFullName ?? '(unknown)'}
Website: ${row.websiteUrl ?? '(unknown)'}
Context: ${row.context ?? '(none yet)'}

IDENTITY ANCHORS — read before searching. Company names collide; several unrelated companies may share this one. Whatever the entry already knows — the website, the founder, the existing context — pins WHICH company this is: every search result you use must be about THAT company, and anything about a same-name company at a different domain or with different founders must be DISCARDED, however prominent it is. If the entry has no anchors and your searches reveal multiple distinct companies under this name, do NOT guess: set context to a one-line note naming the candidates (e.g. "AMBIGUOUS — could be X at a.com or Y at b.com; add the website or founder to the entry to anchor the research") and leave founder fields null.

End your reply with ONLY this JSON (no prose after it):
{"founderFirstName": "<or null>", "founderFullName": "<or null>",
 "context": "<the refreshed running brief, 3-8 sentences>",
 "websiteUrl": "<https url or null>"}`,
            },
          ],
        } as any)
    const response: any = await Promise.race([
      call,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('the web check timed out after 100 seconds')), 100_000)
      ),
    ])
        const text = (response.content as any[])
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
        const parsed = parseLLMJsonObject<{
          founderFirstName?: string | null
          founderFullName?: string | null
          context?: string | null
          websiteUrl?: string | null
        }>(text, {})
    // No usable context = a failed run. Do NOT stamp lastEnrichedAt —
    // stamping an empty result would park the entry for six days.
    if (!parsed.context || !String(parsed.context).trim()) {
      const reason = `the model returned no context (stop_reason: ${(response as any).stop_reason ?? 'unknown'})`
      console.error(`[register] enrichment of "${row.name}" failed: ${reason}`)
      await recordFailure(db, row.id, reason)
      return { ok: false, error: reason }
    }

    await db.companyContext.update({
      where: { id: row.id },
      data: {
        ...(parsed.founderFirstName ? { founderFirstName: String(parsed.founderFirstName).slice(0, 60) } : {}),
        ...(parsed.founderFullName ? { founderFullName: String(parsed.founderFullName).slice(0, 120) } : {}),
        context: String(parsed.context).slice(0, 8000),
        ...(parsed.websiteUrl && /^https?:\/\//.test(String(parsed.websiteUrl))
          ? { websiteUrl: String(parsed.websiteUrl).slice(0, 500) }
          : {}),
        lastEnrichedAt: new Date(),
        enrichError: null,
      },
    })
    return { ok: true }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error(`[register] enrichment of "${row.name}" threw: ${reason}`)
    await recordFailure(db, row.id, reason)
    return { ok: false, error: reason.slice(0, 300) }
  }
}

// The failure goes on the card, time-stamped so a repeat of the same
// error still reads as a fresh answer to the reader's retry.
async function recordFailure(db: any, id: string, reason: string): Promise<void> {
  try {
    const at = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date())
    await db.companyContext.update({
      where: { id },
      data: { enrichError: `${reason.slice(0, 240)} (at ${at})` },
    })
  } catch {}
}

// Enrich one entry now — file-time (post-response) and the Register's
// manual Research It Now both come through here.
export async function enrichCompanyById(id: string): Promise<RefreshResult> {
  if (!hasDb()) return { ok: false, error: 'no database' }
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: 'no ANTHROPIC_API_KEY configured' }
  try {
    const db = await getDb()
    const row = await db.companyContext.findUnique({ where: { id } })
    if (!row) return { ok: false, error: 'no such entry' }
    return await refreshEntry(db, row)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'enrichment failed' }
  }
}

// The nightly pass: refresh the stalest entries — never-enriched first,
// then anything older than six days. Best-effort throughout.
export async function enrichCompanies(limit = 3): Promise<{ enriched: number }> {
  if (!hasDb() || !process.env.ANTHROPIC_API_KEY) return { enriched: 0 }
  try {
    const db = await getDb()
    const cutoff = new Date(Date.now() - 6 * 24 * 3600 * 1000)
    const rows = await db.companyContext.findMany({
      // Contextless entries are always candidates, stamped or not — an
      // earlier bug stamped empty results; this un-parks them.
      where: {
        OR: [{ lastEnrichedAt: null }, { lastEnrichedAt: { lt: cutoff } }, { context: null }],
      },
      orderBy: [{ lastEnrichedAt: { sort: 'asc', nulls: 'first' } }],
      take: limit,
    })
    let enriched = 0
    for (const row of rows) {
      if ((await refreshEntry(db, row)).ok) enriched++
    }
    return { enriched }
  } catch {
    return { enriched: 0 }
  }
}
