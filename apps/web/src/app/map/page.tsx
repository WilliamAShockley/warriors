import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { scanAppRoutes, countRoutes } from '@/lib/sitemap'
import MapTree from './MapTree'

// Re-scan the filesystem on every request so the map stays current as
// routes are added or removed.
export const dynamic = 'force-dynamic'

export default function MapPage() {
  const tree = scanAppRoutes()

  return (
    <div className="min-h-screen bg-[#F7F6F3]">
      <div className="max-w-3xl mx-auto px-10 pt-12 pb-20">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-[#888884] hover:text-[#1A1A1A] transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Home
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-[#1A1A1A]">
          Site Map
        </h1>
        <p className="text-sm text-[#888884] mt-1 mb-8">
          A live tree of every page and API route, read from the codebase on
          each load — new routes appear here automatically.
        </p>
        {tree ? (
          <MapTree tree={tree} {...countRoutes(tree)} />
        ) : (
          <p className="text-sm text-[#888884]">
            Could not read the route directory in this environment.
          </p>
        )}
      </div>
    </div>
  )
}
