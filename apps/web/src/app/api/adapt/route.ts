import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/claude'
import fs from 'fs'
import path from 'path'

// ─── GitHub file reading (production) ────────────────────────────────────────

const GH_HEADERS = {
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

async function githubReadFile(relPath: string): Promise<string | null> {
  const owner = process.env.GITHUB_OWNER
  const repo = process.env.GITHUB_REPO
  const branch = process.env.GITHUB_BRANCH ?? 'main'
  const appPath = process.env.GITHUB_APP_PATH ?? 'apps/web'
  const repoPath = appPath ? `${appPath}/${relPath}` : relPath

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${repoPath}?ref=${branch}`,
      { headers: GH_HEADERS }
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

async function githubGetTree(): Promise<string> {
  const owner = process.env.GITHUB_OWNER
  const repo = process.env.GITHUB_REPO
  const branch = process.env.GITHUB_BRANCH ?? 'main'
  const appPath = process.env.GITHUB_APP_PATH ?? 'apps/web'

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      { headers: GH_HEADERS }
    )
    if (!res.ok) return '(unavailable)'
    const data = await res.json()
    const prefix = appPath ? `${appPath}/src/` : 'src/'
    const lines = (data.tree as { path: string; type: string }[])
      .filter((item) => item.path.startsWith(prefix))
      .map((item) => item.path.replace(prefix, '  ').replace(/^/, ''))
    return lines.join('\n')
  } catch {
    return '(unavailable)'
  }
}

// ─── Local filesystem reading (dev) ──────────────────────────────────────────

const SRC_ROOT = path.join(process.cwd(), 'src')

function localReadFile(relPath: string): string | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8')
  } catch {
    return null
  }
}

function localGetTree(dir: string, indent = ''): string {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    return entries
      .filter((e) => !['node_modules', '.next', '.git'].includes(e.name))
      .map((e) => {
        if (e.isDirectory()) {
          return `${indent}${e.name}/\n${localGetTree(path.join(dir, e.name), indent + '  ')}`
        }
        return `${indent}${e.name}`
      })
      .join('\n')
  } catch {
    return '(unavailable)'
  }
}

// ─── Shared logic ─────────────────────────────────────────────────────────────

function getRelevantPaths(request: string): string[] {
  const paths = [
    'src/app/page.tsx',
    'src/app/globals.css',
    'src/lib/utils.ts',
    'prisma/schema.prisma',
  ]
  const lower = request.toLowerCase()
  if (lower.includes('target') || lower.includes('lead') || lower.includes('contact') || lower.includes('email')) {
    paths.push(
      'src/app/targets/page.tsx',
      'src/app/targets/[id]/page.tsx',
      'src/app/api/targets/route.ts',
      'src/app/api/targets/[id]/route.ts',
      'src/app/api/activities/route.ts',
      'src/components/AddTargetModal.tsx',
      'src/components/LogActivityModal.tsx',
      'src/components/EditTargetModal.tsx',
    )
  }
  if (lower.includes('gmail') || lower.includes('sync')) {
    paths.push('src/lib/gmail.ts', 'src/lib/syncGmail.ts')
  }
  if (lower.includes('settings')) {
    paths.push('src/app/settings/page.tsx')
  }
  if (lower.includes('summary') || lower.includes('claude') || lower.includes('ai')) {
    paths.push('src/lib/claude.ts')
  }
  return [...new Set(paths)]
}

// Parse the delimiter-based response format
function parseResponse(raw: string): { summary: string; changes: { file: string; description: string; content: string }[] } {
  const summaryMatch = raw.match(/^SUMMARY:\s*([\s\S]*?)(?=\nFILE:|$)/m)
  const summary = summaryMatch ? summaryMatch[1].trim() : raw.slice(0, 500)

  const changes: { file: string; description: string; content: string }[] = []
  const fileRegex = /FILE:\s*(.+?)\nDESCRIPTION:\s*(.+?)\n([\s\S]*?)(?=\nFILE:|\n?$)/g

  let match
  while ((match = fileRegex.exec(raw)) !== null) {
    const content = match[3]
      .trim()
      .replace(/^```(?:tsx?|jsx?|js|ts|css)?\n?/, '')
      .replace(/\n?```\s*$/, '')
      .trim()
    changes.push({ file: match[1].trim(), description: match[2].trim(), content })
  }

  return { summary, changes }
}

export async function POST(req: Request) {
  const { request, history } = await req.json()

  const hasGitHub = !!(process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO)
  const paths = getRelevantPaths(request)

  let tree: string
  const files: Record<string, string> = {}

  if (hasGitHub) {
    const [treeResult, ...fileResults] = await Promise.all([
      githubGetTree(),
      ...paths.map((p) => githubReadFile(p)),
    ])
    tree = treeResult
    paths.forEach((p, i) => {
      if (fileResults[i]) files[p] = fileResults[i]!
    })
  } else {
    tree = localGetTree(SRC_ROOT)
    paths.forEach((p) => {
      const content = localReadFile(p)
      if (content) files[p] = content
    })
  }

  const filesBlock = Object.entries(files)
    .map(([p, c]) => `### ${p}\n\`\`\`\n${c}\n\`\`\``)
    .join('\n\n')

  const systemPrompt = `You are an expert Next.js developer embedded inside a VC workflow app called Warriors. Implement features requested by the user by modifying source files directly.

The app runs locally on Next.js 15 App Router with Tailwind CSS, Prisma + SQLite, and the Anthropic SDK. Design language: off-white background (#F7F6F3), white cards, borders (#E8E7E3), muted text (#888884), dark buttons (#1A1A1A). Keep this consistent.

RULES:
- Only modify files inside src/. Never touch prisma/schema.prisma, package.json, or config files unless critical.
- If a prisma schema change is needed, mention it in the summary and tell the user to run \`pnpm db:push\` — but avoid schema changes when possible.
- Never introduce new npm packages. Use only what is already installed.
- Always return COMPLETE file contents, never partial snippets or diffs.
- Be surgical — only change files that need to change.

RESPONSE FORMAT (use this exactly — do not use JSON):

SUMMARY:
[Plain English explanation of what you are doing and why. Be specific.]

FILE: src/path/to/file.tsx
DESCRIPTION: [one line describing this change]
\`\`\`tsx
[complete file content here]
\`\`\`

FILE: src/path/to/another.tsx
DESCRIPTION: [one line describing this change]
\`\`\`tsx
[complete file content here]
\`\`\`

Current file tree (src/):
${tree}

Relevant source files:
${filesBlock}`

  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    ...(history ?? []),
    { role: 'user', content: request },
  ]

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 16000,
    system: systemPrompt,
    messages,
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  const parsed = parseResponse(raw)

  return NextResponse.json(parsed)
}
