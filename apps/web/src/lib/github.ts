// Shared GitHub API utilities for Adapt routes

export type FileChange = {
  file: string
  description: string
  content: string
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
}

function base(): string {
  return `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`
}

function repoPath(relPath: string): string {
  const appPath = process.env.GITHUB_APP_PATH ?? 'apps/web'
  return appPath ? `${appPath}/${relPath}` : relPath
}

export function hasGitHubConfig(): boolean {
  return !!(process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO)
}

export async function githubReadFile(relPath: string): Promise<string | null> {
  const branch = process.env.GITHUB_BRANCH ?? 'main'
  try {
    const res = await fetch(
      `${base()}/contents/${repoPath(relPath)}?ref=${branch}`,
      { headers: headers() }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (data.encoding === 'base64') {
      return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8')
    }
    return null
  } catch {
    return null
  }
}

export async function githubGetTree(): Promise<string> {
  const branch = process.env.GITHUB_BRANCH ?? 'main'
  const appPath = process.env.GITHUB_APP_PATH ?? 'apps/web'
  try {
    const res = await fetch(
      `${base()}/git/trees/${branch}?recursive=1`,
      { headers: headers() }
    )
    if (!res.ok) return '(unavailable)'
    const data = await res.json()
    const prefix = appPath ? `${appPath}/src/` : 'src/'
    return (data.tree as { path: string }[])
      .filter((item) => item.path.startsWith(prefix))
      .map((item) => item.path.replace(prefix, ''))
      .join('\n')
  } catch {
    return '(unavailable)'
  }
}

export async function githubGetCommitFiles(commitSha: string): Promise<string[]> {
  const appPath = process.env.GITHUB_APP_PATH ?? 'apps/web'
  try {
    const res = await fetch(`${base()}/commits/${commitSha}`, { headers: headers() })
    if (!res.ok) return []
    const data = await res.json()
    return (data.files ?? [])
      .map((f: { filename: string }) => {
        const stripped = f.filename.replace(`${appPath}/`, '')
        return stripped
      })
      .filter((f: string) => f.startsWith('src/') || f === 'prisma/schema.prisma')
  } catch {
    return []
  }
}

export async function commitToGitHub(
  changes: FileChange[],
  message: string
): Promise<{ ok: boolean; commitUrl?: string; error?: string }> {
  const branch = process.env.GITHUB_BRANCH ?? 'main'
  const h = headers()
  const b = base()

  try {
    // Get HEAD
    const refRes = await fetch(`${b}/git/ref/heads/${branch}`, { headers: h })
    if (!refRes.ok) return { ok: false, error: `Ref lookup failed: ${await refRes.text()}` }
    const headSha: string = (await refRes.json()).object.sha

    // Get base tree
    const commitRes = await fetch(`${b}/git/commits/${headSha}`, { headers: h })
    const baseTreeSha: string = (await commitRes.json()).tree.sha

    // Create blobs
    const treeEntries: { path: string; mode: string; type: string; sha: string }[] = []
    const results: { file: string; ok: boolean; error?: string }[] = []

    for (const change of changes) {
      const normalized = change.file.replace(/^\//, '')
      if (!normalized.startsWith('src/')) {
        results.push({ file: change.file, ok: false, error: 'Only src/ files are allowed' })
        continue
      }
      const blobRes = await fetch(`${b}/git/blobs`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({
          content: Buffer.from(change.content).toString('base64'),
          encoding: 'base64',
        }),
      })
      if (!blobRes.ok) {
        const err = await blobRes.text()
        results.push({ file: change.file, ok: false, error: `Blob failed (${blobRes.status}): ${err}` })
        continue
      }
      treeEntries.push({ path: repoPath(normalized), mode: '100644', type: 'blob', sha: (await blobRes.json()).sha })
      results.push({ file: change.file, ok: true })
    }

    if (treeEntries.length === 0) return { ok: false, error: 'No valid src/ files to commit' }

    // Create tree + commit + update ref
    const treeRes = await fetch(`${b}/git/trees`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
    })
    const newTreeSha: string = (await treeRes.json()).sha

    const newCommitRes = await fetch(`${b}/git/commits`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ message, tree: newTreeSha, parents: [headSha] }),
    })
    const newCommit = await newCommitRes.json()

    await fetch(`${b}/git/refs/heads/${branch}`, {
      method: 'PATCH', headers: h,
      body: JSON.stringify({ sha: newCommit.sha }),
    })

    return { ok: true, commitUrl: newCommit.html_url }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

// Parse model names out of a Prisma schema string
export function extractPrismaModels(schema: string): string[] {
  const matches = schema.matchAll(/^model\s+(\w+)\s*\{/gm)
  return [...matches].map((m) => m[1])
}

// Parse Claude's FILE/SUMMARY response format
export function parseAdaptResponse(raw: string): {
  summary: string
  changes: FileChange[]
} {
  const summaryMatch = raw.match(/^SUMMARY:\s*([\s\S]*?)(?=\nFILE:|$)/m)
  const summary = summaryMatch ? summaryMatch[1].trim() : raw.slice(0, 500)

  const changes: FileChange[] = []
  const fileRegex = /FILE:\s*(.+?)\nDESCRIPTION:\s*(.+?)\n([\s\S]*?)(?=\nFILE:|\n?$)/g

  let match
  while ((match = fileRegex.exec(raw)) !== null) {
    const raw3 = match[3].trim().replace(/^```(?:tsx?|jsx?|js|ts|css|prisma)?\n?/, '')
    const closingFence = raw3.indexOf('\n```')
    const content = (closingFence !== -1 ? raw3.slice(0, closingFence) : raw3).trim()
    changes.push({ file: match[1].trim(), description: match[2].trim(), content })
  }

  return { summary, changes }
}
