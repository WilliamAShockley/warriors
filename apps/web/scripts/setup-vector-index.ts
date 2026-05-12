/**
 * Creates the libSQL vector index on DocumentChunk.embedding.
 *
 * Prisma's schema can't model libSQL's vector index, so this is run once
 * after `prisma db push` against a libSQL/Turso database. Re-running is
 * safe (CREATE INDEX IF NOT EXISTS).
 *
 * Usage: pnpm tsx scripts/setup-vector-index.ts
 */
import { createClient } from '@libsql/client'

async function main() {
  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN?.replace(/\s+/g, '')

  if (!url) {
    console.error('TURSO_DATABASE_URL is not set. Vector indexes require libSQL/Turso.')
    process.exit(1)
  }

  const client = createClient({ url, authToken })

  await client.execute(
    `CREATE INDEX IF NOT EXISTS document_chunk_embedding_idx
       ON DocumentChunk (libsql_vector_idx(embedding))`,
  )

  console.log('Vector index ready: document_chunk_embedding_idx')
  client.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
