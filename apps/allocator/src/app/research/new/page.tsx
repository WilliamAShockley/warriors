import Link from 'next/link'
import ThesisInterview from '@/components/ThesisInterview'

export default function NewThesisPage() {
  return (
    <main className="pt-14">
      <Link href="/research" className="eyebrow underline decoration-hairline underline-offset-4">
        ← The Desk
      </Link>

      <header className="pt-6">
        <p className="eyebrow text-oxblood">Intake</p>
        <h1 className="mt-2 font-serif text-[30px] font-semibold leading-[1.1] tracking-tight">
          Begin a Thesis
        </h1>
        <p className="dek mt-3">
          A few questions, then the desk drafts the charter — the standing instruction
          that will drive what gets read, tracked, and surfaced for you.
        </p>
      </header>

      <div className="rule-masthead mt-6" />

      <ThesisInterview />
    </main>
  )
}
