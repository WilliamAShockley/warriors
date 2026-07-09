import Link from 'next/link'
import { notFound } from 'next/navigation'
import { theses, thesisBySlug, deals } from '@/lib/data'
import { getDbThesis } from '@/lib/theses'
import DeepDive from '@/components/DeepDive'
import RetireThesis from '@/components/RetireThesis'

export function generateStaticParams() {
  return theses.map((t) => ({ slug: t.slug }))
}

export default async function ThesisPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const thesis = thesisBySlug(slug)

  // Reader-established theses live in the database, with their own layout.
  if (!thesis) {
    const own = await getDbThesis(slug)
    if (!own) notFound()
    return (
      <main className="pt-14">
        <Link href="/research" className="eyebrow underline decoration-hairline underline-offset-4">
          ← The Desk
        </Link>

        <header className="pt-6">
          <p className="eyebrow text-oxblood">Thesis</p>
          <h1 className="mt-2 font-serif text-[28px] font-semibold leading-[1.15] tracking-tight">
            {own.name}
          </h1>
          <p className="dek mt-3">{own.stance}</p>
          <p className="eyebrow mt-4 text-faint">Established {own.createdAt}</p>
        </header>

        <div className="rule mt-7" />

        <section className="pt-7">
          <p className="eyebrow-ink">The View, As Filed</p>
          <div className="mt-4 space-y-4">
            {own.summary.split('\n\n').map((p, i) => (
              <p key={i} className="body-copy">
                {p}
              </p>
            ))}
          </div>
        </section>

        <section className="pt-8">
          <p className="eyebrow-ink">The Research Charter</p>
          <div className="mt-4 border border-hairline p-5">
            <p className="font-serif text-[14px] italic leading-relaxed text-stone">{own.charter}</p>
          </div>
          <p className="eyebrow mt-4 text-faint">
            The standing instruction — developments will file against it as the desk reads
          </p>
        </section>

        <RetireThesis slug={own.slug} />
      </main>
    )
  }

  const linkedDeals = deals.filter((d) => d.thesis === thesis.slug)

  return (
    <main className="pt-14">
      <Link href="/research" className="eyebrow underline decoration-hairline underline-offset-4">
        ← The Desk
      </Link>

      <header className="pt-6">
        <p className="eyebrow text-oxblood">Thesis</p>
        <h1 className="mt-2 font-serif text-[28px] font-semibold leading-[1.15] tracking-tight">
          {thesis.name}
        </h1>
        <p className="dek mt-3">{thesis.stance}</p>
      </header>

      <div className="rule mt-7" />

      <section className="pt-7">
        <div className="flex items-baseline justify-between">
          <p className="eyebrow-ink">The Analyst’s Summary</p>
          <p className="eyebrow text-faint">Updated {thesis.updated}</p>
        </div>
        <div className="mt-4 space-y-4">
          {thesis.summary.map((para, i) => (
            <p key={i} className="body-copy">
              {para}
            </p>
          ))}
        </div>
      </section>

      <div className="rule mt-8" />

      <section className="pt-7">
        <p className="eyebrow-ink">Developments</p>
        <ul className="mt-2">
          {thesis.developments.map((d) => (
            <li key={d.title} className="rule py-5 first:border-t-0">
              <div className="flex items-baseline justify-between gap-4">
                <p className="eyebrow text-faint">{d.source}</p>
                <p className="eyebrow text-faint">{d.date}</p>
              </div>
              <h3 className="mt-2 font-serif text-[17px] font-medium leading-snug">{d.title}</h3>
              <p className="mt-1.5 font-serif text-[14px] italic leading-relaxed text-stone">{d.note}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="rule" />

      {/* Memo in progress */}
      <section className="pt-7">
        <p className="eyebrow-ink">{thesis.memo.state}</p>
        <div className="mt-4 border border-hairline p-5">
          <h3 className="font-serif text-[20px] font-medium leading-snug tracking-tight">
            {thesis.memo.title}
          </h3>
          <p className="eyebrow mt-2 text-faint">{thesis.memo.updated}</p>
          <p className="body-copy mt-4">{thesis.memo.excerpt}</p>
          <p className="eyebrow-ink mt-5 underline decoration-hairline underline-offset-4">
            Continue in the memo
          </p>
        </div>
      </section>

      {linkedDeals.length > 0 && (
        <section className="pt-8">
          <p className="eyebrow-ink">In the Pipeline</p>
          <ul className="mt-2">
            {linkedDeals.map((d) => (
              <li key={d.id} className="rule py-4 first:border-t-0">
                <h3 className="font-serif text-[16px] font-medium">{d.name}</h3>
                <p className="mt-1 font-serif text-[14px] italic text-stone">{d.oneLiner}</p>
                <p className="eyebrow mt-2 text-faint">{d.stage}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="pt-8">
        <p className="eyebrow-ink">Key Sources</p>
        <ul className="mt-2">
          {thesis.sources.map((s) => (
            <li key={s.name} className="rule flex items-baseline justify-between gap-4 py-3.5 first:border-t-0">
              <span className="font-serif text-[15px]">{s.name}</span>
              <span className="eyebrow text-right text-faint">{s.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <DeepDive thesisName={thesis.name} />
    </main>
  )
}
