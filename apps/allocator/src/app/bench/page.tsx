import Link from 'next/link'
import Bench from '@/components/Bench'

export const dynamic = 'force-dynamic'

export default function BenchPage() {
  return (
    <main className="pt-14">
      <header>
        <p className="eyebrow">The Provider Bake-Off</p>
        <h1 className="mt-2 font-serif text-[32px] font-semibold leading-none tracking-tight">
          The Bench
        </h1>
        <p className="dek mt-2">
          Four research engines — Anthropic, OpenAI, Exa, Parallel — run the identical charge
          against the same companies. Read the cells, crown the winners, and let the tally
          decide who powers the Register.
        </p>
        <p className="mt-3">
          <Link
            href="/register"
            className="eyebrow text-faint underline decoration-hairline underline-offset-4"
          >
            Back to the Register →
          </Link>
        </p>
      </header>

      <div className="rule-masthead mt-6" />

      <Bench />
    </main>
  )
}
