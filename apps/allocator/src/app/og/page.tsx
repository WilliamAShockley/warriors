import Link from 'next/link'
import Og from '@/components/Og'

export const dynamic = 'force-dynamic'

// ?tab=url opens on the URL sheet — where the Docket's bare-URL
// commissions land, and where their items link back to.
export default async function OgPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const initialTab = (await searchParams).tab === 'url' ? ('url' as const) : ('name' as const)
  return (
    <main className="pt-14">
      <header>
        <p className="eyebrow">The Cold-Draft Test Bench</p>
        <h1 className="mt-2 font-serif text-[32px] font-semibold leading-none tracking-tight">OG</h1>
        <p className="dek mt-2">
          Seat a company by name or by URL and watch the cold email get built, component by
          component: the research context first (description, CEO, product, category), then the
          draft in its parts — fixed blocks assembled in code, variable sentences drafted from the
          research. Read across a row to triage where a step broke; tap it for the assembled email,
          the checks, and the raw JSON.
        </p>
        <p className="mt-3">
          <Link
            href="/bench"
            className="eyebrow text-faint underline decoration-hairline underline-offset-4"
          >
            The research bench →
          </Link>
        </p>
      </header>

      {/* The name/URL switch and the masthead rules render inside Og. */}
      <Og initialTab={initialTab} />
    </main>
  )
}
