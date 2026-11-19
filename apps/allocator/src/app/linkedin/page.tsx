import Link from 'next/link'
import Outreach from '@/components/linkedin/Outreach'

export const dynamic = 'force-dynamic'

export default function LinkedInPage() {
  return (
    <main className="pt-14">
      <header>
        <p className="eyebrow">Cold outreach</p>
        <h1 className="mt-2 font-serif text-[32px] font-semibold leading-none tracking-tight">LinkedIn</h1>
        <p className="dek mt-2">
          People worth meeting. Paste a profile, read the draft, send it. It goes as a Sales Navigator message, typed by the browser on your Mac; what went out, and when, stays on file here.
        </p>
        <p className="mt-3">
          <Link href="/book" className="eyebrow text-faint underline decoration-hairline underline-offset-4">
            The Book →
          </Link>
        </p>
      </header>

      <div className="rule-masthead mt-6" />

      <Outreach />
    </main>
  )
}
