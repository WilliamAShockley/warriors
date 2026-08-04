import Anthropic from '@anthropic-ai/sdk'

// The model client, workspace-aware. A workspace that brought its own key
// (Workspace.anthropicKey) bills its own tasks; every other workspace runs
// on the instance's ANTHROPIC_API_KEY. Call sites keep the plain
// `anthropic.messages.create(...)` shape — resolution happens per call.

const clients = new Map<string, Anthropic>()

const clientFor = (key: string) => {
  let c = clients.get(key)
  if (!c) {
    c = new Anthropic({ apiKey: key })
    clients.set(key, c)
  }
  return c
}

async function resolveClient(): Promise<Anthropic> {
  const fallback = process.env.ANTHROPIC_API_KEY ?? ''
  try {
    if (process.env.DATABASE_URL) {
      const [{ activeWorkspaceId }, { rawDb }] = await Promise.all([
        import('./tenant'),
        import('./db'),
      ])
      const ws = await activeWorkspaceId()
      if (ws !== 'primary') {
        const row = await rawDb.workspace.findUnique({ where: { id: ws } })
        if (row?.anthropicKey?.trim()) return clientFor(row.anthropicKey.trim())
      }
    }
  } catch {}
  return clientFor(fallback)
}

export const anthropic = {
  messages: {
    create: async (args: any): Promise<any> => (await resolveClient()).messages.create(args),
  },
} as unknown as Anthropic
