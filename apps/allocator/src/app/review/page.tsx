import ProofRoom from '@/components/ProofRoom'

export default function ReviewPage() {
  return (
    // Mobile keeps the app's single column; on desktop the proof room
    // breaks out of the 430px shell to a typical email reading width.
    <main className="pt-14 md:relative md:left-1/2 md:w-[min(760px,calc(100vw-4rem))] md:-translate-x-1/2">
      <header>
        <p className="eyebrow">Review</p>
        <h1 className="mt-2 font-serif text-[32px] font-semibold leading-none tracking-tight">
          The Proofs
        </h1>
        <p className="dek mt-2">Work drafted on your behalf, awaiting signature. One at a time.</p>
      </header>

      <div className="rule-masthead mt-6" />

      <ProofRoom />
    </main>
  )
}
