'use client'

import { useEffect, useState } from 'react'
import type { ContactNoteRecord } from '@/lib/book'

// Notes on a person: a dated running record kept on the contact's page.
// Filed from here, read newest first, and handed to the desk whenever a
// task names this person. Client-fetched so the statically cached contact
// pages never serve stale notes.
export default function ContactNotes({ contactId }: { contactId: string }) {
  const [notes, setNotes] = useState<ContactNoteRecord[]>([])
  const [live, setLive] = useState(false)
  const [draft, setDraft] = useState('')
  const [filing, setFiling] = useState(false)

  useEffect(() => {
    fetch(`/api/book/notes?contactId=${encodeURIComponent(contactId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.live) {
          setNotes(data.notes)
          setLive(true)
        }
      })
      .catch(() => {})
  }, [contactId])

  const file = async () => {
    const body = draft.trim()
    if (!body || filing) return
    setFiling(true)
    if (live) {
      try {
        const res = await fetch('/api/book/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactId, body }),
        })
        const data = await res.json()
        if (data?.note) {
          setNotes((prev) => [data.note, ...prev])
          setDraft('')
          setFiling(false)
          return
        }
      } catch {}
    }
    // Mock mode (or a failed write): the note still lands, session-only.
    setNotes((prev) => [
      {
        id: `local-${prev.length}-${body.length}`,
        body,
        filedOn: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' }).format(new Date()),
      },
      ...prev,
    ])
    setDraft('')
    setFiling(false)
  }

  return (
    <>
      <div className="rule mt-8" />
      <section className="pb-6 pt-7">
        <p className="eyebrow-ink">The Notes</p>
        <p className="dek mt-1.5 text-[13px]">
          A dated record on this person — the desk reads it before drafting anything in their name.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            file()
          }}
          className="mt-4 border border-hairline focus-within:border-ink"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="What is worth keeping on this person…"
            className="w-full resize-none bg-transparent p-4 font-serif text-[15px] leading-relaxed text-ink placeholder:italic placeholder:text-faint focus:outline-none"
          />
          <div className="flex items-center justify-between border-t border-hairline px-4 py-2.5">
            <span className="eyebrow text-faint">Files under today&rsquo;s date</span>
            <button
              type="submit"
              disabled={filing || !draft.trim()}
              className="eyebrow-ink underline decoration-hairline underline-offset-4 disabled:opacity-40"
            >
              {filing ? 'Filing' : 'File the Note'}
            </button>
          </div>
        </form>

        {notes.length > 0 && (
          <ul className="mt-2">
            {notes.map((n) => (
              <li key={n.id} className="rule py-5 first:border-t-0">
                <p className="eyebrow text-faint">{n.filedOn}</p>
                <p className="mt-2 whitespace-pre-line font-serif text-[15px] leading-relaxed text-ink">
                  {n.body}
                </p>
              </li>
            ))}
          </ul>
        )}
        {notes.length === 0 && (
          <p className="dek mt-6 text-center text-[13px]">
            Nothing on record yet. The first note starts the file.
          </p>
        )}
      </section>
    </>
  )
}
