import ProofRoom from '@/components/ProofRoom'

export default function ReviewPage() {
  return (
    <main className="pt-14">
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
