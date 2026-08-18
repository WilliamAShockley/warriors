import Link from 'next/link'
import Register from '@/components/Register'

export const dynamic = 'force-dynamic'

export default function RegisterPage() {
  return (
    <main className="pt-14">
      <header>
        <p className="eyebrow">The Context Table</p>
        <h1 className="mt-2 font-serif text-[32px] font-semibold leading-none tracking-tight">
          The Register
        </h1>
        <p className="dek mt-2">
          Every company the desk has touched — who founded it, what it is, why it matters.
          The desk reads this before researching and refreshes it overnight.
        </p>
        <p className="mt-3">
          <Link
            href="/book"
            className="eyebrow text-faint underline decoration-hairline underline-offset-4"
          >
            The people are in the Book →
          </Link>
        </p>
      </header>

      <div className="rule-masthead mt-6" />

      <Register />
    </main>
  )
}
