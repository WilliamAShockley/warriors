'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileText, Folder, Braces, LayoutTemplate } from 'lucide-react'
import type { RouteNode } from '@/lib/sitemap'

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-100 text-emerald-700',
  POST: 'bg-blue-100 text-blue-700',
  PUT: 'bg-violet-100 text-violet-700',
  PATCH: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
  HEAD: 'bg-gray-100 text-gray-600',
  OPTIONS: 'bg-gray-100 text-gray-600',
}

function isApiOnly(node: RouteNode): boolean {
  if (node.hasPage) return false
  if (node.children.length === 0) return node.methods.length > 0
  return node.children.every(isApiOnly)
}

function DynamicName({ name }: { name: string }) {
  if (name.startsWith('[')) {
    return <span className="italic text-amber-700">:{name.slice(1, -1)}</span>
  }
  return <>{name}</>
}

function MethodBadges({ methods }: { methods: string[] }) {
  return (
    <span className="flex gap-1">
      {methods.map((m) => (
        <span
          key={m}
          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide ${METHOD_COLORS[m] ?? 'bg-gray-100 text-gray-600'}`}
        >
          {m}
        </span>
      ))}
    </span>
  )
}

function isNavigable(urlPath: string) {
  return !urlPath.includes('[')
}

function TreeNode({
  node,
  depth,
  showApis,
}: {
  node: RouteNode
  depth: number
  showApis: boolean
}) {
  const apiOnly = isApiOnly(node)
  if (apiOnly && !showApis) return null

  const isPage = node.hasPage
  const isApiLeaf = node.methods.length > 0

  const row = (
    <div
      className={`group flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${
        isPage
          ? 'hover:bg-white hover:shadow-sm transition-all'
          : ''
      }`}
    >
      {isPage ? (
        <FileText className="w-3.5 h-3.5 text-[#1A1A1A] shrink-0" />
      ) : isApiLeaf && node.children.length === 0 ? (
        <Braces className="w-3.5 h-3.5 text-[#B0AEA8] shrink-0" />
      ) : (
        <Folder className="w-3.5 h-3.5 text-[#B0AEA8] shrink-0" />
      )}
      <span
        className={`text-sm ${
          isPage
            ? 'font-medium text-[#1A1A1A]'
            : apiOnly
              ? 'font-mono text-xs text-[#888884]'
              : 'text-[#55534E]'
        }`}
      >
        <DynamicName name={node.name} />
      </span>
      {node.hasLayout && (
        <span title="has layout">
          <LayoutTemplate className="w-3 h-3 text-[#C9C7C1] shrink-0" />
        </span>
      )}
      {isPage && (
        <span className="font-mono text-[11px] text-[#B0AEA8] group-hover:text-[#888884]">
          {node.urlPath}
        </span>
      )}
      {isApiLeaf && showApis && <MethodBadges methods={node.methods} />}
    </div>
  )

  return (
    <div className={depth > 0 ? 'ml-4 border-l border-[#E8E6E1] pl-3' : ''}>
      {isPage && isNavigable(node.urlPath) ? (
        <Link href={node.urlPath}>{row}</Link>
      ) : (
        row
      )}
      {node.children.map((child) => (
        <TreeNode
          key={child.name}
          node={child}
          depth={depth + 1}
          showApis={showApis}
        />
      ))}
    </div>
  )
}

export default function MapTree({
  tree,
  pages,
  apis,
}: {
  tree: RouteNode
  pages: number
  apis: number
}) {
  const [showApis, setShowApis] = useState(false)

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <span className="text-sm text-[#888884]">
          <span className="font-semibold text-[#1A1A1A]">{pages}</span> pages
          {' · '}
          <span className="font-semibold text-[#1A1A1A]">{apis}</span> API
          routes
        </span>
        <button
          onClick={() => setShowApis((v) => !v)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            showApis
              ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
              : 'bg-white text-[#55534E] border-[#E8E6E1] hover:border-[#B0AEA8]'
          }`}
        >
          {showApis ? 'Hide API routes' : 'Show API routes'}
        </button>
      </div>
      <TreeNode node={tree} depth={0} showApis={showApis} />
    </div>
  )
}
