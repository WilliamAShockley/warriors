import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/claude'
import { hasGitHubConfig, githubReadFile, githubGetTree, extractPrismaModels, parseAdaptResponse } from '@/lib/github'
import fs from 'fs'
import path from 'path'

const SRC_ROOT = path.join(process.cwd(), 'src')

// ─── Local filesystem fallback (dev) ─────────────────────────────────────────

function localReadFile(relPath: string): string | null {
  try { return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8') } catch { return null }
}

function localGetTree(dir: string, indent = ''): string {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => !['node_modules', '.next', '.git'].includes(e.name))
      .map((e) => e.isDirectory()
        ? `${indent}${e.name}/\n${localGetTree(path.join(dir, e.name), indent + '  ')}`
        : `${indent}${e.name}`)
      .join('\n')
  } catch { return '(unavailable)' }
}

// ─── Context file selection ───────────────────────────────────────────────────

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
  if (lower.includes('gmail') || lower.includes('sync')) paths.push('src/lib/gmail.ts', 'src/lib/syncGmail.ts')
  if (lower.includes('settings')) paths.push('src/app/settings/page.tsx')
  if (lower.includes('summary') || lower.includes('claude') || lower.includes('ai')) paths.push('src/lib/claude.ts')
  if (lower.includes('content') || lower.includes('link') || lower.includes('folder')) {
    paths.push('src/app/content/page.tsx', 'src/app/api/content/route.ts', 'src/components/AddContentLinkModal.tsx')
  }
  if (lower.includes('todo') || lower.includes('task')) paths.push('src/app/todos/page.tsx')
  return [...new Set(paths)]
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { request, history } = await req.json()

  const ghAvailable = hasGitHubConfig()
  const paths = getRelevantPaths(request)

  let tree: string
  const files: Record<string, string> = {}

  if (ghAvailable) {
    const [treeResult, ...fileResults] = await Promise.all([
      githubGetTree(),
      ...paths.map((p) => githubReadFile(p)),
    ])
    tree = treeResult
    paths.forEach((p, i) => { if (fileResults[i]) files[p] = fileResults[i]! })
  } else {
    tree = localGetTree(SRC_ROOT)
    paths.forEach((p) => { const c = localReadFile(p); if (c) files[p] = c })
  }

  // Extract existing Prisma models so Claude never invents new ones
  const schemaContent = files['prisma/schema.prisma'] ?? ''
  const existingModels = extractPrismaModels(schemaContent)
  const modelList = existingModels.length > 0
    ? existingModels.map((m) => `  - ${m}`).join('\n')
    : '  (unknown — see schema above)'

  const filesBlock = Object.entries(files)
    .map(([p, c]) => `### ${p}\n\`\`\`\n${c}\n\`\`\``)
    .join('\n\n')

  const systemPrompt = `You are an expert Next.js developer embedded inside a VC workflow app called Warriors. Implement features by modifying source files directly.

Stack: Next.js 15 App Router, Tailwind CSS, Prisma 5 + SQLite/Turso, Anthropic SDK.
Design: background #F7F6F3, white cards, borders #E8E7E3, muted text #888884, dark buttons #1A1A1A.

STRICT RULES — violating these will break the build:
1. Only modify files inside src/. Never touch prisma/schema.prisma, package.json, next.config.ts, or any config.
2. NEVER create new Prisma models. The app's schema cannot be changed through Adapt. Only use the models listed below.
3. Database import is ALWAYS named: \`import { db } from '@/lib/db'\` — never a default import.
4. Never add new npm packages. Use only what is installed.
5. Return COMPLETE file contents — never diffs or partial snippets.
6. Only change files that actually need to change.
7. Never put markdown, explanations, or warnings inside a FILE block — only valid source code.

AVAILABLE PRISMA MODELS (these are the ONLY models you may use):
${modelList}

RESPONSE FORMAT (exact — no deviations):

SUMMARY:
[Plain English explanation of what you changed and why.]

FILE: src/path/to/file.tsx
DESCRIPTION: [one line]
\`\`\`tsx
[complete file content]
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
  return NextResponse.json(parseAdaptResponse(raw))
}
