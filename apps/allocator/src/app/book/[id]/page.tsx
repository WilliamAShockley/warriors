import Link from 'next/link'
import { notFound } from 'next/navigation'
import { contacts, contactById, dealById, notesByIds } from '@/lib/data'
import { getDbContact } from '@/lib/book'

export function generateStaticParams() {
  return contacts.map((c) => ({ id: c.id }))
}

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const contact = contactById(id)

  // Reader-added contacts live in the database with a leaner card.
  if (!contact) {
    const own = await getDbContact(id)
    if (!own) notFound()
    return (
      <main className="pt-14">
        <Link href="/book" className="eyebrow underline decoration-hairline underline-offset-4">
          ← The Book
        </Link>

        <header className="pt-6">
          <p className="eyebrow text-oxblood">{own.segment}</p>
          <h1 className="mt-2 font-serif text-[30px] font-semibold leading-[1.1] tracking-tight">
            {own.name}
          </h1>
          <p className="eyebrow mt-3">
            {own.role} · {own.firm}
          </p>
          <p className="eyebrow mt-1.5 text-faint">
            {own.location ? `${own.location} · ` : ''}Filed {own.addedOn}
          </p>
        </header>

        <div className="rule mt-7" />

        <section className="pt-7">
          <p className="eyebrow-ink">The Relationship</p>
          <p className="body-copy mt-3">{own.relationship ?? own.context}</p>
        </section>

        {own.followUp && (
          <section className="pt-7">
            <p className="eyebrow-ink">Worth Remembering</p>
            <p className="dek mt-2 border-l border-oxblood pl-4">{own.followUp}</p>
          </section>
        )}

        <p className="dek pb-6 pt-10 text-center text-faint">
          Notes and deals will gather here as they are filed.
        </p>
      </main>
    )
  }

  const linkedDeals = contact.dealIds.map((d) => dealById(d)).filter(Boolean)
  const linkedNotes = notesByIds(contact.noteIds)

  return (
    <main className="pt-14">
      <Link href="/book" className="eyebrow underline decoration-hairline underline-offset-4">
        ← The Book
      </Link>

      <header className="pt-6">
        <p className="eyebrow text-oxblood">{contact.segment}</p>
        <h1 className="mt-2 font-serif text-[30px] font-semibold leading-[1.1] tracking-tight">
          {contact.name}
        </h1>
        <p className="eyebrow mt-3">
          {contact.role} · {contact.firm}
        </p>
        <p className="eyebrow mt-1.5 text-faint">
          {contact.location} · Last touch {contact.lastTouch}
        </p>
      </header>

      <div className="rule mt-7" />

      <section className="pt-7">
        <p className="eyebrow-ink">The Relationship</p>
        <p className="body-copy mt-3">{contact.relationship}</p>
      </section>

      {contact.followUp && (
        <section className="pt-7">
          <p className="eyebrow-ink">Worth Remembering</p>
          <p className="dek mt-2 border-l border-oxblood pl-4">{contact.followUp}</p>
        </section>
      )}

      {contact.introPath && (
        <section className="pt-7">
          <p className="eyebrow-ink">The Path In</p>
          <p className="body-copy mt-2">{contact.introPath}</p>
        </section>
      )}

      {linkedDeals.length > 0 && (
        <>
          <div className="rule mt-8" />
          <section className="pt-7">
            <p className="eyebrow-ink">Linked Deals</p>
            <ul className="mt-1">
              {linkedDeals.map((d) => (
                <li key={d!.id} className="rule py-4 first:border-t-0">
                  <Link href={`/research/${d!.thesis}`} className="block">
                    <h3 className="font-serif text-[16px] font-medium">{d!.name}</h3>
                    <p className="mt-1 font-serif text-[14px] italic text-stone">{d!.oneLiner}</p>
                    <p className="eyebrow mt-2 text-faint">{d!.stage}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {linkedNotes.length > 0 && (
        <>
          <div className="rule mt-6" />
          <section className="pb-6 pt-7">
            <p className="eyebrow-ink">From Your Notes</p>
            <ul className="mt-1">
              {linkedNotes.map((n) => (
                <li key={n.id} className="rule py-5 first:border-t-0">
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="font-serif text-[16px] font-medium leading-snug">{n.title}</h3>
                    <p className="eyebrow shrink-0 text-faint">{n.date}</p>
                  </div>
                  <p className="mt-2 font-serif text-[14px] leading-relaxed text-stone">{n.body}</p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  )
}
