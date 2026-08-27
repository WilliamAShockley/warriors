import fs from 'fs'
import path from 'path'

export type RouteNode = {
  /** Segment name, e.g. "targets" or "[id]" */
  name: string
  /** Full URL path, e.g. "/targets/[id]" */
  urlPath: string
  hasPage: boolean
  hasLayout: boolean
  /** HTTP methods exported by route.ts, empty if no route handler */
  methods: string[]
  children: RouteNode[]
}

const METHOD_RE =
  /export\s+(?:async\s+)?(?:function|const|let)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g

function readMethods(routeFile: string): string[] {
  try {
    const src = fs.readFileSync(routeFile, 'utf8')
    const methods = new Set<string>()
    for (const m of src.matchAll(METHOD_RE)) methods.add(m[1])
    return Array.from(methods)
  } catch {
    return []
  }
}

function scanDir(dir: string, urlPath: string, name: string): RouteNode | null {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }

  const node: RouteNode = {
    name,
    urlPath: urlPath || '/',
    hasPage: false,
    hasLayout: false,
    methods: [],
    children: [],
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue
    const full = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      // Route groups (parentheses) contribute children without a URL segment.
      const isGroup = entry.name.startsWith('(') && entry.name.endsWith(')')
      const childUrl = isGroup ? urlPath : `${urlPath}/${entry.name}`
      const child = scanDir(full, childUrl, entry.name)
      if (!child) continue
      if (isGroup) {
        node.children.push(...child.children)
        node.hasPage = node.hasPage || child.hasPage
        node.hasLayout = node.hasLayout || child.hasLayout
        node.methods = Array.from(new Set([...node.methods, ...child.methods]))
      } else if (
        child.hasPage ||
        child.methods.length > 0 ||
        child.children.length > 0
      ) {
        node.children.push(child)
      }
    } else if (/^page\.(tsx|jsx|ts|js)$/.test(entry.name)) {
      node.hasPage = true
    } else if (/^layout\.(tsx|jsx|ts|js)$/.test(entry.name)) {
      node.hasLayout = true
    } else if (/^route\.(ts|js)$/.test(entry.name)) {
      node.methods = readMethods(full)
    }
  }

  node.children.sort((a, b) => {
    // Pages before pure API branches, then alphabetical; dynamic segments last.
    const aApi = !a.hasPage && a.methods.length > 0 && a.children.length === 0
    const bApi = !b.hasPage && b.methods.length > 0 && b.children.length === 0
    if (aApi !== bApi) return aApi ? 1 : -1
    const aDyn = a.name.startsWith('[')
    const bDyn = b.name.startsWith('[')
    if (aDyn !== bDyn) return aDyn ? 1 : -1
    return a.name.localeCompare(b.name)
  })

  return node
}

/** Scan the app router directory and return the live route tree. */
export function scanAppRoutes(): RouteNode | null {
  const appDir = path.join(process.cwd(), 'src', 'app')
  return scanDir(appDir, '', 'The Allocator')
}

export function countRoutes(node: RouteNode): { pages: number; apis: number } {
  let pages = node.hasPage ? 1 : 0
  let apis = node.methods.length > 0 ? 1 : 0
  for (const child of node.children) {
    const c = countRoutes(child)
    pages += c.pages
    apis += c.apis
  }
  return { pages, apis }
}
