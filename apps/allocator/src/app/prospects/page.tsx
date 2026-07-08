import Link from 'next/link'
import { deals, thesisBySlug } from '@/lib/data'

export default function ProspectsPage() {
  const prospects = deals.filter((d) => d.status === 'prospect')

  return (
    <main className="pt-14">
      <header>
        <p className="eyebrow">Pipeline</p>
        <h1 className="mt-2 font-serif text-[32px] font-semibold leading-none tracking-tight">
          Prospects
        </h1>
        <p className="dek mt-2">Names worth a first look. Nothing signed, nothing owed.</p>
      </header>

      <div className="rule-masthead mt-6" />

      <ul>
        {prospects.map((d) => {
          const t = thesisBySlug(d.thesis)
          return (
            <li key={d.id} className="rule py-7 first:border-t-0">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-serif text-[21px] font-medium leading-snug tracking-tight">
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
              <p className="dek mt-3 border-l border-oxblood pl-4 text-[14px]">{d.next}</p>
            </li>
          )
        })}
      </ul>

      <p className="eyebrow pb-6 pt-6 text-center text-faint">
        Prospects graduate to Live Deals when paper moves
      </p>
    </main>
  )
}
