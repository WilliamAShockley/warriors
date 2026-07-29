// Persistence for reader-edited skill prompts. Generic by skill id; the code
// default (passed as fallback) is authoritative until the reader overrides it.
const hasDb = () => Boolean(process.env.DATABASE_URL)

async function getDb() {
  const { db } = await import('../../db')
  return db
}

// The system prompt in force for a skill: the stored override, else the default.
export async function getSkillPrompt(id: string, fallback: string): Promise<string> {
  if (!hasDb()) return fallback
  try {
    const db = await getDb()
    const row = await db.apolloSkill.findUnique({ where: { id } })
    return row?.systemPrompt?.trim() ? row.systemPrompt : fallback
  } catch {
    return fallback
  }
}

// True when the reader has saved a custom prompt for this skill.
export async function isSkillCustom(id: string): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    const row = await db.apolloSkill.findUnique({ where: { id } })
    return Boolean(row?.systemPrompt?.trim())
  } catch {
    return false
  }
}

export async function setSkillPrompt(id: string, systemPrompt: string): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    await db.apolloSkill.upsert({
      where: { id },
      create: { id, systemPrompt },
      update: { systemPrompt },
    })
    return true
  } catch {
    return false
  }
}

// Reset to the code default by dropping the override row.
export async function resetSkillPrompt(id: string): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    await db.apolloSkill.deleteMany({ where: { id } })
    return true
  } catch {
    return false
  }
}

// ————————————————————————————————— Reader-authored skills
// Skills the reader writes himself in Settings — same table, distinguished
// by a non-null label. Apollo reaches for them via draft_with_skill when a
// task matches their whenToUse.

export type CustomSkill = {
  id: string
  label: string
  whenToUse: string
  systemPrompt: string
}

const toCustom = (r: any): CustomSkill => ({
  id: r.id,
  label: r.label ?? r.id,
  whenToUse: r.whenToUse ?? '',
  systemPrompt: r.systemPrompt,
})

export async function listCustomSkills(): Promise<CustomSkill[]> {
  if (!hasDb()) return []
  try {
    const db = await getDb()
    const rows = await db.apolloSkill.findMany({
      where: { label: { not: null } },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(toCustom)
  } catch {
    return []
  }
}

export async function getCustomSkill(id: string): Promise<CustomSkill | null> {
  if (!hasDb()) return null
  try {
    const db = await getDb()
    const row = await db.apolloSkill.findUnique({ where: { id } })
    return row && row.label ? toCustom(row) : null
  } catch {
    return null
  }
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

export async function createCustomSkill(input: {
  label: string
  whenToUse: string
  systemPrompt: string
}): Promise<CustomSkill | null> {
  if (!hasDb()) return null
  try {
    const db = await getDb()
    const base = slugify(input.label) || 'skill'
    // First free id: the slug, else slug-2, slug-3 …
    let id = base
    for (let n = 2; await db.apolloSkill.findUnique({ where: { id } }); n++) id = `${base}-${n}`
    const row = await db.apolloSkill.create({
      data: {
        id,
        label: input.label,
        whenToUse: input.whenToUse,
        systemPrompt: input.systemPrompt,
      },
    })
    return toCustom(row)
  } catch {
    return null
  }
}

// Retiring a reader-authored skill deletes its row outright. Guarded to
// custom rows so a built-in override can never be removed by this path.
export async function deleteCustomSkill(id: string): Promise<boolean> {
  if (!hasDb()) return false
  try {
    const db = await getDb()
    const res = await db.apolloSkill.deleteMany({ where: { id, label: { not: null } } })
    return res.count > 0
  } catch {
    return false
  }
}
