import Link from 'next/link'
import ApolloDesk from '@/components/ApolloDesk'
import Greeting from '@/components/Greeting'
import { deals, theses, newsItems } from '@/lib/data'
import { countOpenTodos } from '@/lib/todos'
import { listDbTheses } from '@/lib/theses'
import { countPendingProofs } from '@/lib/review'
import { getReaderName } from '@/lib/settings'

export const dynamic = 'force-dynamic'

function todayLine() {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
}

export default async function HomePage() {
  const prospects = deals.filter((d) => d.status === 'prospect')
  const live = deals.filter((d) => d.status === 'live')
  const [openTodos, dbTheses, pendingProofs, readerName] = await Promise.all([
    countOpenTodos(),
    listDbTheses(),
    countPendingProofs(),
    getReaderName(),
  ])
  const thesisCount = dbTheses.live ? dbTheses.theses.length : theses.length

  const menu = [
    { label: 'To Do’s', href: '/todos', note: `${openTodos} open` },
    { label: 'Review', href: '/review', note: `${pendingProofs} in the tray` },
    { label: 'Prospects', href: '/prospects', note: `${prospects.length} names` },
    { label: 'Live Deals', href: '/deals', note: `${live.length} in motion` },
    { label: 'Research', href: '/research', note: `${thesisCount} thes${thesisCount === 1 ? 'is' : 'es'}` },
    { label: 'News', href: '/news', note: `${newsItems.length} on the wire` },
  ]

  return (
    <main>
      {/* The cover — a full viewport: greeting up top, contents at 60–80% */}
      <div className="relative h-[calc(100dvh-3.5rem)]">
        <header className="pt-16">
          <p className="eyebrow">{todayLine()}</p>
          <div className="mt-4">
            <Greeting name={readerName} />
          </div>
          <Link href="/brief" className="dek mt-4 inline-block underline decoration-hairline underline-offset-4">
            The morning brief is ready. →
          </Link>
        </header>

        {/* The contents — begins just under three-fifths down */}
        <nav className="absolute inset-x-0 top-[57%] flex h-[25%] min-h-[15.5rem] flex-col justify-between">
          {menu.map((item) => (
            <Link key={item.href} href={item.href} className="group flex items-baseline gap-3">
              <span className="font-serif text-[24px] font-medium leading-none tracking-tight">
                {item.label}
              </span>
              <span className="eyebrow text-faint transition-colors duration-300 ease-editorial group-hover:text-stone">
                {item.note}
              </span>
            </Link>
          ))}
        </nav>
      </div>

      {/* Below the fold — the desk. Scroll down to hand Apollo a task. */}
      <section className="pb-4 pt-2">
        <div className="rule mb-8" />
        <ApolloDesk />
      </section>

      <p className="pb-8">
        <Link href="/settings" className="eyebrow text-faint underline decoration-hairline underline-offset-4">
          The Colophon
        </Link>
      </p>
    </main>
  )
}
