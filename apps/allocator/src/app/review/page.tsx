import { Suspense } from 'react'
import Link from 'next/link'
import ProofRoom from '@/components/ProofRoom'

export default function ReviewPage() {
  return (
    // Mobile keeps the app's single column; on desktop the proof room
    // breaks out of the 430px shell to a typical email reading width.
    <main className="pt-14">
      <header>
        <div className="flex items-baseline justify-between gap-4">
          <p className="eyebrow">Review</p>
          <Link href="/record" className="eyebrow text-faint underline decoration-hairline underline-offset-4">
            The Record →
          </Link>
        </div>
        <h1 className="mt-2 font-serif text-[32px] font-semibold leading-none tracking-tight">
          The Proofs
        </h1>
        <p className="dek mt-2">Work drafted on your behalf, awaiting signature. One at a time.</p>
      </header>

      <div className="rule-masthead mt-6" />

      <Suspense fallback={null}>
        <ProofRoom />
      </Suspense>
    </main>
  )
}
