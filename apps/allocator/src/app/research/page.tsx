import Link from 'next/link'
import { theses } from '@/lib/data'
import { listDbTheses } from '@/lib/theses'

export const dynamic = 'force-dynamic'

export default async function ResearchPage() {
  const { live, theses: dbTheses } = await listDbTheses()

  return (
    <main className="pt-14">
      <header>
        <p className="eyebrow">Research</p>
        <h1 className="mt-2 font-serif text-[32px] font-semibold leading-none tracking-tight">
          The Desk
        </h1>
        <p className="dek mt-2">
          {live
            ? dbTheses.length === 0
              ? 'A clean slate, awaiting a view worth holding.'
              : `${dbTheses.length} thesis${dbTheses.length === 1 ? '' : 'es'} under active study.`
            : 'Five theses under active synthesis.'}
        </p>
      </header>

      {/* Thesis chips + begin */}
      <div className="-mx-6 mt-7 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-2 pb-1">
          {(live ? dbTheses : theses).map((t) => (
            <Link
              key={t.slug}
              href={`/research/${t.slug}`}
              className="whitespace-nowrap border border-hairline px-3.5 py-2 font-sans text-[10px] font-medium uppercase tracking-[0.16em] text-ink transition-colors duration-300 ease-editorial hover:border-ink"
            >
              {t.chip}
            </Link>
          ))}
          <Link
            href="/research/new"
            className="whitespace-nowrap border border-ink px-3.5 py-2 font-sans text-[10px] font-medium uppercase tracking-[0.16em] text-ink transition-colors duration-300 ease-editorial hover:bg-ink hover:text-paper"
          >
            + Begin a Thesis
          </Link>
        </div>
      </div>

      <div className="rule mt-7" />

      {live ? (
        dbTheses.length === 0 ? (
          <div className="pt-16 text-center">
            <p className="font-serif text-[19px] font-medium leading-snug tracking-tight">
              Nothing under study yet.
            </p>
            <p className="dek mt-3">
              A thesis begins with a short interview — the desk asks, you answer,
              and a research charter comes out the other side.
            </p>
            <Link
              href="/research/new"
              className="mt-8 inline-block border border-ink px-8 py-3.5 font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-ink transition-colors duration-300 ease-editorial hover:bg-ink hover:text-paper"
            >
              Begin the First
            </Link>
          </div>
        ) : (
          <section className="pt-7">
            <p className="eyebrow-ink">Standing Theses</p>
            <ul className="mt-2">
              {dbTheses.map((t) => (
                <li key={t.slug} className="rule first:border-t-0">
                  <Link href={`/research/${t.slug}`} className="block py-6">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="eyebrow">{t.chip}</p>
                      <p className="eyebrow shrink-0 text-faint">Est. {t.createdAt}</p>
                    </div>
                    <h3 className="mt-2 font-serif text-[19px] font-medium leading-snug tracking-tight">
                      {t.name}
                    </h3>
                    <p className="mt-1.5 font-serif text-[14px] italic leading-relaxed text-stone">
                      {t.stance}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      ) : (
        <>
          {/* Mock mode: the seeded synthesized feed */}
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
        </>
      )}
    </main>
  )
}
