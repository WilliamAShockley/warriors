'use client'

import { useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import type { RouteNode } from '@/lib/sitemap'

function isApiOnly(node: RouteNode): boolean {
  if (node.hasPage) return false
  if (node.children.length === 0) return node.methods.length > 0
  return node.children.every(isApiOnly)
}

function isNavigable(urlPath: string) {
  return !urlPath.includes('[')
}

function SegmentName({ name }: { name: string }) {
  if (name.startsWith('[')) {
    return <span className="font-serif italic">:{name.slice(1, -1)}</span>
  }
  return <>{name}</>
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
  const isApiLeaf = node.methods.length > 0 && node.children.length === 0

  const row = (
    <div className="flex items-baseline gap-2.5 py-[7px]">
      <span
        className={clsx(
          'select-none text-[11px] leading-none',
          isPage ? 'text-ink' : 'text-faint'
        )}
      >
        {isPage ? '¶' : isApiLeaf ? '·' : '§'}
      </span>
      <span
        className={clsx(
          isPage
            ? 'text-[15px] font-medium text-ink'
            : apiOnly
              ? 'font-mono text-[12px] text-faint'
              : 'text-[14px] text-stone'
        )}
      >
        <SegmentName name={node.name} />
      </span>
      {isPage && (
        <span className="font-mono text-[11px] text-faint">{node.urlPath}</span>
      )}
      {isApiLeaf && showApis && (
        <span className="font-sans text-[9px] font-medium uppercase tracking-[0.14em] text-faint">
          {node.methods.join(' · ')}
        </span>
      )}
    </div>
  )

  return (
    <div className={depth > 0 ? 'ml-[5px] border-l border-hairline pl-4' : ''}>
      {isPage && isNavigable(node.urlPath) ? (
        <Link
          href={node.urlPath}
          className="block transition-opacity duration-300 ease-editorial hover:opacity-60"
        >
          {row}
        </Link>
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
    <div className="mt-8">
      <div className="flex items-baseline justify-between border-b border-hairline pb-3">
        <p className="eyebrow">
          {pages} pages · {apis} routes
        </p>
        <button
          onClick={() => setShowApis((v) => !v)}
          className={clsx(
            'font-sans text-[10px] font-medium uppercase tracking-[0.18em] transition-colors duration-300 ease-editorial',
            showApis ? 'text-ink underline underline-offset-4' : 'text-faint'
          )}
        >
          {showApis ? 'Hide the wiring' : 'Show the wiring'}
        </button>
      </div>
      <div className="pt-4">
        <TreeNode node={tree} depth={0} showApis={showApis} />
      </div>
    </div>
  )
}
