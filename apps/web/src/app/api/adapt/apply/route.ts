import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

type Change = {
  file: string
  description: string
  content: string
}

export async function POST(req: Request) {
  const { changes }: { changes: Change[] } = await req.json()

  const results: { file: string; ok: boolean; error?: string }[] = []

  for (const change of changes) {
    // Safety: only allow src/ files
    const normalized = change.file.replace(/^\//, '')
    if (!normalized.startsWith('src/') && !normalized.startsWith('src\\')) {
      results.push({ file: change.file, ok: false, error: 'Only src/ files are allowed' })
      continue
    }

    const fullPath = path.join(process.cwd(), normalized)

    try {
      // Ensure directory exists
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, change.content, 'utf-8')
      results.push({ file: change.file, ok: true })
    } catch (err) {
      results.push({ file: change.file, ok: false, error: String(err) })
    }
  }

  return NextResponse.json({ results })
}
