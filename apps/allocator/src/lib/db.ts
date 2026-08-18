import { PrismaClient } from '@prisma/client'

// The tenancy choke point. Every model that carries a workspaceId is
// scoped automatically: list/count/update-many/delete-many queries gain
// `workspaceId` in their where, creates gain it in their data — resolved
// from the active workspace context (see tenant.ts). Code above this layer
// mostly never mentions workspaces at all.
//
// Deliberate v1 boundary: findUnique/update/delete by primary key are NOT
// re-scoped (cuid ids are unguessable, and every id in play was surfaced
// by an already-scoped list). rawDb bypasses scoping entirely — for
// adoption, sign-in, and cross-workspace machinery like the cron.

const TENANT_MODELS = new Set([
  'Todo',
  'TodoUpdate',
  'ReviewItem',
  'ApolloTask',
  'ApolloLesson',
  'ApolloSkill',
  'BriefEdition',
  'MarginEntry',
  'ResearchThesis',
  'FiledNote',
  'BookContact',
  'ContactNote',
  'CompanyContext',
  'BenchRow',
  'BenchTrial',
  'CalendarEvent',
  'MeetingNote',
  'InboundEmail',
])

const SCOPE_WHERE = new Set([
  'findMany',
  'findFirst',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
])

function createPrismaClient() {
  const base = new PrismaClient()
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) return query(args)
          const { activeWorkspaceId, ensureAdopted } = await import('./tenant')
          await ensureAdopted()
          const ws = await activeWorkspaceId()
          const a: any = args ?? {}
          if (SCOPE_WHERE.has(operation)) {
            a.where = { ...(a.where ?? {}), workspaceId: ws }
          } else if (operation === 'create') {
            a.data = { workspaceId: ws, ...(a.data ?? {}) }
          } else if (operation === 'createMany') {
            const data = Array.isArray(a.data) ? a.data : [a.data]
            a.data = data.map((d: any) => ({ workspaceId: ws, ...d }))
          } else if (operation === 'upsert') {
            a.create = { workspaceId: ws, ...(a.create ?? {}) }
          }
          return query(a)
        },
      },
    },
  })
}

type Db = ReturnType<typeof createPrismaClient>

const globalForPrisma = globalThis as unknown as {
  prisma: Db | undefined
  prismaRaw: PrismaClient | undefined
}

// Lazy proxies — clients are only created on first DB access (not at import
// time). `db` is typed as PrismaClient so call sites read naturally.
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_, prop) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrismaClient()
    }
    return (globalForPrisma.prisma as any)[prop]
  },
})

// The unscoped client: adoption, sign-in, and cross-workspace machinery.
export const rawDb: PrismaClient = new Proxy({} as PrismaClient, {
  get(_, prop) {
    if (!globalForPrisma.prismaRaw) {
      globalForPrisma.prismaRaw = new PrismaClient()
    }
    return (globalForPrisma.prismaRaw as any)[prop]
  },
})
