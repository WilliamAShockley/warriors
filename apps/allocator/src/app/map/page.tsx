import { scanAppRoutes, countRoutes } from '@/lib/sitemap'
import MapTree from './MapTree'

// Re-scan the filesystem on every request so the map stays current as
// pages are added or removed.
export const dynamic = 'force-dynamic'

export default function MapPage() {
  const tree = scanAppRoutes()

  return (
    <main className="pt-14">
      <header>
        <p className="eyebrow">Site Map</p>
        <h1 className="mt-2 font-serif text-[32px] font-semibold leading-none tracking-tight">
          The Atlas
        </h1>
        <p className="dek mt-2">
          Every page in the app, drawn fresh from the code on each reading —
          new rooms appear here the moment they are built.
        </p>
      </header>

      {tree ? (
        <MapTree tree={tree} {...countRoutes(tree)} />
      ) : (
        <p className="dek mt-8">
          The route directory could not be read in this environment.
        </p>
      )}
    </main>
  )
}
