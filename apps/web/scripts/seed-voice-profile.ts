/**
 * Seeds the Horizon voice-profile setting (horizon.voiceProfile) from the
 * canonical voice profile document. Re-running overwrites the setting with the
 * file's current contents — edit the file, then re-run to update.
 *
 * Usage: pnpm dlx dotenv-cli -e .env -- pnpm tsx scripts/seed-voice-profile.ts
 *   (or any invocation with DATABASE_URL set)
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { PrismaClient } from '@prisma/client'

const PROFILE_PATH = resolve(__dirname, '../../allocator/dez-email-voice-profile.md')
const KEY = 'horizon.voiceProfile'

async function main() {
  const value = readFileSync(PROFILE_PATH, 'utf8')
  const db = new PrismaClient()
  await db.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value },
    update: { value },
  })
  await db.$disconnect()
  console.log(`seeded ${KEY} (${value.length} chars) from ${PROFILE_PATH}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
