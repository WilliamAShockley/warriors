import TheRecord from '@/components/TheRecord'

export default function RecordPage() {
  return (
    <main className="pt-14">
      <header>
        <p className="eyebrow">Review</p>
        <h1 className="mt-2 font-serif text-[32px] font-semibold leading-none tracking-tight">
          The Record
        </h1>
        <p className="dek mt-2">
          Every email reviewed — as drafted, as sent, and what changed in between.
        </p>
      </header>

      <div className="rule-masthead mt-6" />

      <TheRecord />
    </main>
  )
}
