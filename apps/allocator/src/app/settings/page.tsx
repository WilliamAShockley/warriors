import Link from 'next/link'
import ColophonForm from '@/components/ColophonForm'
import SkillsEditor from '@/components/SkillsEditor'
import CirculationList from '@/components/CirculationList'

export default function SettingsPage() {
  return (
    <main className="pt-14">
      <Link href="/" className="eyebrow underline decoration-hairline underline-offset-4">
        ← Apollo
      </Link>

      <header className="pt-6">
        <p className="eyebrow">Account</p>
        <h1 className="mt-2 font-serif text-[32px] font-semibold leading-none tracking-tight">
          Settings
        </h1>
        <p className="dek mt-2">The particulars of this edition — and the desk&rsquo;s playbooks.</p>
      </header>

      <div className="rule-masthead mt-6" />

      <ColophonForm />

      <div className="rule mt-12" />

      <SkillsEditor />

      <CirculationList />

      <p className="pb-8 pt-12 text-center">
        <a
          href="/api/auth/logout"
          className="eyebrow text-faint underline decoration-hairline underline-offset-4"
        >
          Sign Out
        </a>
      </p>
    </main>
  )
}
