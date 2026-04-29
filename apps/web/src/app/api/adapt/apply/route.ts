import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

type Change = {
  file: string
  description: string
  content: string
}

type Result = { file: string; ok: boolean; error?: string }

// ─── GitHub commit (production) ──────────────────────────────────────────────

async function commitToGitHub(changes: Change[]): Promise<{
  mode: 'github'
  results: Result[]
  commitUrl?: string
  error?: string
}> {
  const token = process.env.GITHUB_TOKEN!
  const owner = process.env.GITHUB_OWNER!
  const repo = process.env.GITHUB_REPO!
  const branch = process.env.GITHUB_BRANCH ?? 'main'
  const appPath = process.env.GITHUB_APP_PATH ?? 'apps/web'

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
  const base = `https://api.github.com/repos/${owner}/${repo}`

  // 1. Get HEAD commit SHA
  const refRes = await fetch(`${base}/git/ref/heads/${branch}`, { headers })
  if (!refRes.ok) {
    const err = await refRes.text()
    return { mode: 'github', results: [], error: `GitHub ref lookup failed: ${err}` }
  }
  const headSha: string = (await refRes.json()).object.sha

  // 2. Get base tree SHA
  const commitRes = await fetch(`${base}/git/commits/${headSha}`, { headers })
  const baseTreeSha: string = (await commitRes.json()).tree.sha

  // 3. Create blobs
  const treeEntries: { path: string; mode: string; type: string; sha: string }[] = []
  const results: Result[] = []

  for (const change of changes) {
    const normalized = change.file.replace(/^\//, '')
    if (!normalized.startsWith('src/')) {
      results.push({ file: change.file, ok: false, error: 'Only src/ files are allowed' })
      continue
    }
    const repoPath = appPath ? `${appPath}/${normalized}` : normalized

    const blobRes = await fetch(`${base}/git/blobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: Buffer.from(change.content).toString('base64'),
        encoding: 'base64',
      }),
    })
    if (!blobRes.ok) {
      const blobErr = await blobRes.text()
      results.push({ file: change.file, ok: false, error: `Blob failed (${blobRes.status}): ${blobErr}` })
      continue
    }
    const blobSha: string = (await blobRes.json()).sha
    treeEntries.push({ path: repoPath, mode: '100644', type: 'blob', sha: blobSha })
    results.push({ file: change.file, ok: true })
  }

  if (treeEntries.length === 0) {
    return { mode: 'github', results, error: 'No valid files to commit' }
  }

  // 4. Create new tree
  const treeRes = await fetch(`${base}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
  })
  const newTreeSha: string = (await treeRes.json()).sha

  // 5. Create commit
  const commitMsg = `adapt: ${changes.map((c) => c.description).join('; ')}`
  const newCommitRes = await fetch(`${base}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: commitMsg, tree: newTreeSha, parents: [headSha] }),
  })
  const newCommit = await newCommitRes.json()

  // 6. Advance the branch ref
  await fetch(`${base}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ sha: newCommit.sha }),
  })

  return { mode: 'github', results, commitUrl: newCommit.html_url }
}

// ─── Local filesystem write (dev) ────────────────────────────────────────────

function applyLocally(changes: Change[]): { mode: 'local'; results: Result[] } {
  const results: Result[] = []
  for (const change of changes) {
    const normalized = change.file.replace(/^\//, '')
    if (!normalized.startsWith('src/') && !normalized.startsWith('src\\')) {
      results.push({ file: change.file, ok: false, error: 'Only src/ files are allowed' })
      continue
    }
    const fullPath = path.join(process.cwd(), normalized)
    try {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, change.content, 'utf-8')
      results.push({ file: change.file, ok: true })
    } catch (err) {
      results.push({ file: change.file, ok: false, error: String(err) })
    }
  }
  return { mode: 'local', results }
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { changes }: { changes: Change[] } = await req.json()

  const hasGitHub = !!(
    process.env.GITHUB_TOKEN &&
    process.env.GITHUB_OWNER &&
    process.env.GITHUB_REPO
  )

  if (hasGitHub) {
    const result = await commitToGitHub(changes)
    return NextResponse.json(result)
  }

  return NextResponse.json(applyLocally(changes))
}
