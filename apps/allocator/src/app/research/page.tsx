import Link from 'next/link'
import { theses } from '@/lib/data'

export default function ResearchPage() {
  return (
    <main className="pt-14">
      <header>
        <p className="eyebrow">Research</p>
        <h1 className="mt-2 font-serif text-[32px] font-semibold leading-none tracking-tight">
          The Desk
        </h1>
        <p className="dek mt-2">Five theses under active synthesis.</p>
      </header>

      {/* Thesis chips */}
      <div className="-mx-6 mt-7 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-2 pb-1">
          {theses.map((t) => (
            <Link
              key={t.slug}
              href={`/research/${t.slug}`}
              className="whitespace-nowrap border border-hairline px-3.5 py-2 font-sans text-[10px] font-medium uppercase tracking-[0.16em] text-ink transition-colors duration-300 ease-editorial hover:border-ink"
            >
              {t.chip}
            </Link>
          ))}
        </div>
      </div>

      <div className="rule mt-7" />

      {/* Synthesized feed */}
      <section className="pt-7">
        <p className="eyebrow-ink">New on the Desk</p>
        <ul className="mt-2">
          {theses.map((t) => {
            const latest = t.developments[0]
            return (
              <li key={t.slug} className="rule first:border-t-0">
                <Link href={`/research/${t.slug}`} className="block py-6">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="eyebrow">{t.chip}</p>
                    <p className="eyebrow text-faint">{latest.date}</p>
                  </div>
                  <h3 className="mt-2 font-serif text-[19px] font-medium leading-snug tracking-tight">
                    {latest.title}
                  </h3>
                  <p className="mt-1.5 font-serif text-[14px] italic leading-relaxed text-stone">
                    {latest.note}
                  </p>
                  <p className="eyebrow mt-3 text-faint">
                    {t.memo.state} · {t.memo.title}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="rule" />

      {/* The archive */}
      <section className="pt-8">
        <p className="eyebrow-ink">Filed</p>
        <ul className="mt-2">
          {[
            { title: 'Deposit tokens and the two-tier future', meta: 'Tearsheet · 22 June · Stablecoin Treasury' },
            { title: 'What HLP’s drawdowns actually teach', meta: 'Tearsheet · 14 June · On-chain Perps' },
            { title: 'The credentialing bottleneck, quantified', meta: 'Tearsheet · 3 June · Behavioral Health' },
          ].map((f) => (
            <li key={f.title} className="rule py-5 first:border-t-0">
              <h3 className="font-serif text-[16px] font-medium leading-snug">{f.title}</h3>
              <p className="eyebrow mt-2 text-faint">{f.meta}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
