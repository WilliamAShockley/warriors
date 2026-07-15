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
