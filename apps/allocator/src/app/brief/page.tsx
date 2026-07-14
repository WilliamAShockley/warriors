import Link from 'next/link'
import { getBrief } from '@/lib/brief'
import { openTodosPreview } from '@/lib/todos'

export const dynamic = 'force-dynamic'

function todayLine() {
  const now = new Date()
  const date = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now)
  return date
}

export default async function BriefPage() {
  const [{ lead, items, schedule, recall }, docket] = await Promise.all([
    getBrief(),
    openTodosPreview(5),
  ])

  return (
    <main className="pt-14">
      {/* Masthead */}
      <header className="text-center">
        <p className="eyebrow">{todayLine()} · Private Circulation</p>
        <h1 className="mt-3 font-serif text-[40px] font-semibold leading-none tracking-tight">
          The Allocator
        </h1>
        <p className="dek mt-2">The morning brief, prepared for one reader.</p>
      </header>

      <div className="rule-masthead mt-6" />

      {/* Lead story */}
      <article className="pt-8">
        <p className="eyebrow text-oxblood">{lead.eyebrow}</p>
        <h2 className="mt-3 font-serif text-[30px] font-medium leading-[1.12] tracking-tight">
          {lead.headline}
        </h2>
        <p className="dek mt-4">{lead.dek}</p>
        <div className="mt-5 space-y-4">
          {lead.body.map((para, i) => (
            <p key={i} className="body-copy">
              {para}
            </p>
          ))}
        </div>
        <p className="eyebrow mt-5">{lead.source}</p>
      </article>

      {/* Tomorrow's schedule — times and titles verbatim from the calendar */}
      {schedule && schedule.length > 0 && (
        <>
          <div className="rule mt-9" />
          <section className="pt-8">
            <p className="eyebrow-ink">Tomorrow</p>
            <ul className="mt-2">
              {/* Meetings verbatim — title, time, people, place. No editorial. */}
              {schedule.map((s) => (
                <li key={s.eventId} className="rule py-5 first:border-t-0">
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="font-serif text-[17px] font-medium leading-snug tracking-tight">
                      {s.title}
                    </h3>
                    <p className="eyebrow shrink-0 text-faint">{s.time}</p>
                  </div>
                  {(s.attendees.length > 0 || s.location) && (
                    <p className="eyebrow mt-1.5">
                      {[s.attendees.join(' · '), s.location].filter(Boolean).join(' — ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {/* Worth Reciting — yesterday's margin, returned as recall cues */}
      {recall.length > 0 && (
        <>
          <div className="rule mt-9" />
          <section className="pt-8">
            <p className="eyebrow text-oxblood">Worth Reciting</p>
            <p className="dek mt-1.5 text-[13px]">
              From yesterday’s margin. Say each aloud before reading on.
            </p>
            <ul className="mt-2">
              {recall.map((r) => (
                <li key={r.cue} className="rule py-5 first:border-t-0">
                  <p className="font-serif text-[17px] font-medium leading-snug tracking-tight">
                    {r.cue}
                  </p>
                  <p className="eyebrow mt-2 text-faint">{r.source}</p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {/* On the Docket — open commitments, verbatim */}
      {docket.length > 0 && (
        <>
          <div className="rule mt-9" />
          <section className="pt-8">
            <p className="eyebrow-ink">On the Docket</p>
            <ul className="mt-2">
              {docket.map((t) => (
                <li key={t.text} className="rule flex items-baseline justify-between gap-4 py-3.5 first:border-t-0">
                  <span className="font-serif text-[15px] leading-snug">{t.text}</span>
                  <span className="eyebrow shrink-0 text-faint">{t.group}</span>
                </li>
              ))}
            </ul>
            <Link href="/todos" className="eyebrow mt-4 inline-block text-faint underline decoration-hairline underline-offset-4">
              The full docket →
            </Link>
          </section>
        </>
      )}

      <div className="rule mt-9" />

      {/* The digest */}
      <section className="pt-8">
        <p className="eyebrow-ink">Below the Fold</p>
        <ul className="mt-2">
          {items.map((item) => {
            const inner = (
              <div className="py-6">
                <p className="eyebrow">{item.eyebrow}</p>
                <h3 className="mt-2 font-serif text-[19px] font-medium leading-snug tracking-tight">
                  {item.headline}
                </h3>
                <p className="mt-1.5 font-serif text-[14px] italic leading-relaxed text-stone">
                  {item.dek}
                </p>
                <p className="eyebrow mt-3 text-faint">{item.source}</p>
              </div>
            )
            return (
              <li key={item.headline} className="rule first:border-t-0">
                {item.href ? <Link href={item.href}>{inner}</Link> : inner}
              </li>
            )
          })}
        </ul>
      </section>

      <div className="rule mt-2" />

      {/* Sign-off — a paper you finish */}
      <footer className="pb-6 pt-10 text-center">
        <p className="font-serif text-[15px] italic text-stone">
          That is everything that matters this morning.
        </p>
        <p className="eyebrow mt-3">The next edition arrives tomorrow</p>
      </footer>
    </main>
  )
}
