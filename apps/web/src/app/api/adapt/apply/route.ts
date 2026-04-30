import { NextResponse } from 'next/server'
import { hasGitHubConfig, commitToGitHub, FileChange } from '@/lib/github'
import fs from 'fs'
import path from 'path'

function applyLocally(changes: FileChange[]): { mode: 'local'; results: { file: string; ok: boolean; error?: string }[] } {
  const results: { file: string; ok: boolean; error?: string }[] = []
  for (const change of changes) {
    const normalized = change.file.replace(/^\//, '')
    if (!normalized.startsWith('src/')) {
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

export async function POST(req: Request) {
  const { changes }: { changes: FileChange[] } = await req.json()

  if (hasGitHubConfig()) {
    const commitMsg = `adapt: ${changes.map((c) => c.description).join('; ')}`
    const result = await commitToGitHub(changes, commitMsg)
    const allOk = result.ok
    return NextResponse.json({
      mode: 'github',
      results: changes.map((c) => ({ file: c.file, ok: allOk })),
      commitUrl: result.commitUrl,
      error: result.error,
    })
  }

  return NextResponse.json(applyLocally(changes))
}
