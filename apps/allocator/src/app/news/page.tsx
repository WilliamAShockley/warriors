import Link from 'next/link'
import { newsItems } from '@/lib/data'

export default function NewsPage() {
  return (
    <main className="pt-14">
      <header>
        <p className="eyebrow">News</p>
        <h1 className="mt-2 font-serif text-[32px] font-semibold leading-none tracking-tight">
          The Wire
        </h1>
        <p className="dek mt-2">Matched to your theses. Nothing you didn’t ask for.</p>
      </header>

      <div className="rule-masthead mt-6" />

      <ul>
        {newsItems.map((n) => (
          <li key={n.headline} className="rule py-6 first:border-t-0">
            <div className="flex items-baseline justify-between gap-4">
              <p className="eyebrow">{n.source}</p>
              <p className="eyebrow shrink-0 text-faint">{n.age}</p>
            </div>
            <h2 className="mt-2 font-serif text-[19px] font-medium leading-snug tracking-tight">
              {n.headline}
            </h2>
            <p className="mt-1.5 font-serif text-[14px] italic leading-relaxed text-stone">
              {n.dek}
            </p>
            {n.thesis && n.chip && (
              <Link
                href={`/research/${n.thesis}`}
                className="eyebrow mt-3 inline-block text-faint underline decoration-hairline underline-offset-4"
              >
                Thesis · {n.chip}
              </Link>
            )}
          </li>
        ))}
      </ul>

      <p className="eyebrow pb-6 pt-6 text-center text-faint">End of the wire</p>
    </main>
  )
}
