import Link from 'next/link'
import ColophonForm from '@/components/ColophonForm'

export default function SettingsPage() {
  return (
    <main className="pt-14">
      <Link href="/" className="eyebrow underline decoration-hairline underline-offset-4">
        ← Apollo
      </Link>

      <header className="pt-6">
        <p className="eyebrow">Account</p>
        <h1 className="mt-2 font-serif text-[32px] font-semibold leading-none tracking-tight">
          The Colophon
        </h1>
        <p className="dek mt-2">The particulars of this edition.</p>
      </header>

      <div className="rule-masthead mt-6" />

      <ColophonForm />
    </main>
  )
}
