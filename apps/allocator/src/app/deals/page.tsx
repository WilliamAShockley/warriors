import Link from 'next/link'
import { deals, contacts, thesisBySlug } from '@/lib/data'

export default function DealsPage() {
  const live = deals.filter((d) => d.status === 'live')

  return (
    <main className="pt-14">
      <header>
        <p className="eyebrow">Pipeline</p>
        <h1 className="mt-2 font-serif text-[32px] font-semibold leading-none tracking-tight">
          Live Deals
        </h1>
        <p className="dek mt-2">Capital in motion. Handle with care.</p>
      </header>

      <div className="rule-masthead mt-6" />

      <ul>
        {live.map((d) => {
          const t = thesisBySlug(d.thesis)
          const people = contacts.filter((c) => c.dealIds.includes(d.id))
          return (
            <li key={d.id} className="rule py-7 first:border-t-0">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-serif text-[22px] font-medium leading-snug tracking-tight">
                  {d.name}
                </h2>
                {t && (
                  <Link href={`/research/${t.slug}`} className="eyebrow shrink-0 text-faint underline decoration-hairline underline-offset-4">
                    {t.chip}
                  </Link>
                )}
              </div>
              <p className="mt-1.5 font-serif text-[14px] italic leading-relaxed text-stone">
                {d.oneLiner}
              </p>
              <p className="eyebrow mt-3">{d.stage}</p>

              <p className="eyebrow-ink mt-5">The Next Step</p>
              <p className="dek mt-1.5 border-l border-oxblood pl-4 text-[14px]">{d.next}</p>

              {people.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {people.map((c) => (
                    <Link
                      key={c.id}
                      href={`/book/${c.id}`}
                      className="border border-hairline px-2.5 py-1 font-sans text-[9px] font-medium uppercase tracking-[0.14em] text-stone transition-colors duration-300 ease-editorial hover:border-ink hover:text-ink"
                    >
                      {c.name}
                    </Link>
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </main>
  )
}
