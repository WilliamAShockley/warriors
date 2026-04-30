import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/claude'
import {
  hasGitHubConfig,
  githubReadFile,
  githubGetCommitFiles,
  commitToGitHub,
  extractPrismaModels,
  parseAdaptResponse,
} from '@/lib/github'

// Fetch build logs from Vercel API
async function fetchBuildLogs(deploymentId: string): Promise<string> {
  const token = process.env.VERCEL_TOKEN
  const teamId = process.env.VERCEL_TEAM_ID
  if (!token) return '(build logs unavailable — VERCEL_TOKEN not set)'

  try {
    const url = `https://api.vercel.com/v2/deployments/${deploymentId}/events${teamId ? `?teamId=${teamId}` : ''}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return `(could not fetch logs: ${res.status})`

    const text = await res.text()
    const lines = text.trim().split('\n').flatMap((line) => {
      try {
        const event = JSON.parse(line)
        const msg: string = event?.payload?.text ?? event?.text ?? ''
        return msg ? [msg] : []
      } catch { return [] }
    })

    // Return last 4000 chars — enough to capture the error
    return lines.join('\n').slice(-4000)
  } catch {
    return '(error fetching build logs)'
  }
}

export async function POST(req: Request) {
  // Must have GitHub config to commit fixes
  if (!hasGitHubConfig()) return NextResponse.json({ ok: false, error: 'GitHub not configured' })

  const body = await req.json()

  // Only handle deployment errors
  if (body.type !== 'deployment-error') return NextResponse.json({ ok: true })

  const deploymentId: string = body.payload?.deployment?.id
  const commitSha: string = body.payload?.deployment?.meta?.githubCommitSha
  const commitMessage: string = body.payload?.deployment?.meta?.githubCommitMessage ?? ''

  if (!deploymentId || !commitSha) return NextResponse.json({ ok: true })

  // Prevent infinite loop — skip if this is already an auto-fix commit
  if (commitMessage.startsWith('fix(auto):')) return NextResponse.json({ ok: true, skipped: 'auto-fix commit' })

  // 1. Fetch build logs
  const logs = await fetchBuildLogs(deploymentId)

  // 2. Get files changed in the failing commit
  const changedFiles = await githubGetCommitFiles(commitSha)

  // 3. Read current state of changed files + schema
  const allFiles = [...new Set([...changedFiles, 'prisma/schema.prisma'])]
  const fileEntries = await Promise.all(allFiles.map(async (f) => [f, await githubReadFile(f)] as const))
  const files = Object.fromEntries(fileEntries.filter(([, c]) => c !== null)) as Record<string, string>

  const schemaContent = files['prisma/schema.prisma'] ?? ''
  const existingModels = extractPrismaModels(schemaContent)
  const modelList = existingModels.map((m) => `  - ${m}`).join('\n')

  const filesBlock = Object.entries(files)
    .map(([p, c]) => `### ${p}\n\`\`\`\n${c}\n\`\`\``)
    .join('\n\n')

  // 4. Ask Claude to diagnose and fix
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 16000,
    system: `You are an expert Next.js developer. A recent commit broke the production build of a VC workflow app called Warriors. Your job is to fix it.

Stack: Next.js 15 App Router, Tailwind CSS, Prisma 5, Anthropic SDK.

STRICT RULES:
1. Only fix files inside src/. Never touch prisma/schema.prisma.
2. Database import is ALWAYS named: \`import { db } from '@/lib/db'\`
3. NEVER reference Prisma models that don't exist in the schema.
4. Return COMPLETE file contents — never partial diffs.
5. Only change what's broken — minimal footprint.
6. Never put markdown or text inside a FILE block — only valid source code.

AVAILABLE PRISMA MODELS:
${modelList}

RESPONSE FORMAT:
SUMMARY:
[What was broken and exactly what you fixed.]

FILE: src/path/to/file.tsx
DESCRIPTION: [one line]
\`\`\`tsx
[complete fixed file content]
\`\`\`

Files from the failing commit:
${filesBlock}`,
    messages: [{
      role: 'user',
      content: `The build failed with this error:\n\n${logs}\n\nPlease diagnose and fix it.`,
    }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  const parsed = parseAdaptResponse(raw)

  if (parsed.changes.length === 0) {
    return NextResponse.json({ ok: false, error: 'Claude could not determine a fix', logs })
  }

  // 5. Commit the fix
  const result = await commitToGitHub(parsed.changes, `fix(auto): ${parsed.summary.slice(0, 120)}`)

  return NextResponse.json({ ok: result.ok, commitUrl: result.commitUrl, fixed: parsed.changes.length })
}
