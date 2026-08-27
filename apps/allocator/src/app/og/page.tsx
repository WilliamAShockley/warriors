import Link from 'next/link'
import Og from '@/components/Og'

export const dynamic = 'force-dynamic'

export default function OgPage() {
  return (
    <main className="pt-14">
      <header>
        <p className="eyebrow">The Cold-Draft Test Bench</p>
        <h1 className="mt-2 font-serif text-[32px] font-semibold leading-none tracking-tight">OG</h1>
        <p className="dek mt-2">
          Seat a company by name or by URL and the desk runs its whole cold pipeline against it —
          the research engines, the founder-email skill in Dez&rsquo;s voice, and every
          straight-through check as its own column. Tap a row to read the draft, the verdicts, and
          the raw JSON it all came from.
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
      <Og />
    </main>
  )
}
