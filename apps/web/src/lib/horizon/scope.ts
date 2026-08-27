import { db } from '@/lib/db'

/**
 * Minimal firm/workspace scoping for Horizon OS.
 *
 * The app is single-operator, so scope resolution is: the first Firm row and
 * its first Workspace row (created on demand). Every Horizon query filters by
 * this scope — Person/Interaction by firmId (shared across all workspaces of
 * the firm), Campaign/Mission/ChatSession by workspaceId. If multi-user auth
 * arrives later, only this function needs to learn how to resolve the caller's
 * workspace; call sites are already scoped.
 */

let cached: { firmId: string; workspaceId: string } | null = null

export async function getScope(): Promise<{ firmId: string; workspaceId: string }> {
  if (cached) return cached
  let firm = await db.firm.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!firm) firm = await db.firm.create({ data: { name: 'Default firm' } })
  let workspace = await db.workspace.findFirst({
    where: { firmId: firm.id },
    orderBy: { createdAt: 'asc' },
  })
  if (!workspace) {
    workspace = await db.workspace.create({ data: { firmId: firm.id, name: 'Main desk' } })
  }
  cached = { firmId: firm.id, workspaceId: workspace.id }
  return cached
}
