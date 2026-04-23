import { PrismaClient } from '@prisma/client'

function createClient() {
  if (process.env.TURSO_DATABASE_URL) {
    // Production: use Turso/libSQL
    const { createClient } = require('@libsql/client')
    const { PrismaLibSQL } = require('@prisma/adapter-libsql')
    const libsql = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
    const adapter = new PrismaLibSQL(libsql)
    return new PrismaClient({ adapter } as any)
  }
  // Local: use SQLite file
  return new PrismaClient()
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const db = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
