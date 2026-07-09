import Link from 'next/link'
import { contacts, segments } from '@/lib/data'
import { listDbContacts } from '@/lib/book'
import AddContact from '@/components/AddContact'

export const dynamic = 'force-dynamic'

export default async function BookPage() {
  const dbContacts = await listDbContacts()

  return (
    <main className="pt-14">
      <header>
        <p className="eyebrow">The Book</p>
        <h1 className="mt-2 font-serif text-[32px] font-semibold leading-none tracking-tight">
          Relationships
        </h1>
        <p className="dek mt-2">Everyone who matters, and why.</p>
      </header>

      <AddContact />

      <div className="rule-masthead mt-6" />

      {segments.map((segment) => {
        const seeded = contacts.filter((c) => c.segment === segment)
        const added = dbContacts.filter((c) => c.segment === segment)
        if (seeded.length === 0 && added.length === 0) return null
        return (
          <section key={segment} className="pt-8">
            <p className="eyebrow-ink">{segment}</p>
            <ul className="mt-1">
              {seeded.map((c) => (
                <li key={c.id} className="rule first:border-t-0">
                  <Link href={`/book/${c.id}`} className="block py-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <h3 className="font-serif text-[19px] font-medium leading-snug tracking-tight">
                        {c.name}
                      </h3>
                      <p className="eyebrow shrink-0 text-faint">{c.lastTouch}</p>
                    </div>
                    <p className="eyebrow mt-1.5">
                      {c.role} · {c.firm}
                    </p>
                    <p className="mt-2 font-serif text-[14px] italic leading-relaxed text-stone">
                      {c.context}
                    </p>
                  </Link>
                </li>
              ))}
              {added.map((c) => (
                <li key={c.id} className="rule first:border-t-0">
                  <Link href={`/book/${c.id}`} className="block py-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <h3 className="font-serif text-[19px] font-medium leading-snug tracking-tight">
                        {c.name}
                      </h3>
                      <p className="eyebrow shrink-0 text-faint">{c.addedOn}</p>
                    </div>
                    <p className="eyebrow mt-1.5">
                      {c.role} · {c.firm}
                    </p>
                    <p className="mt-2 font-serif text-[14px] italic leading-relaxed text-stone">
                      {c.context}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="rule mt-1" />
          </section>
        )
      })}
    </main>
  )
}
