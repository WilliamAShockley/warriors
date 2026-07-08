'use client'

import Link from 'next/link'
import { useState } from 'react'
import { notes as seedNotes, type Note, type NoteLink } from '@/lib/data'

const linkHref = (l: NoteLink) =>
  l.type === 'contact' ? `/book/${l.ref}` : l.type === 'thesis' ? `/research/${l.ref}` : '/research'

export default function NotesFile() {
  const [notes, setNotes] = useState<Note[]>(seedNotes)
  const [draft, setDraft] = useState('')

  const file = () => {
    const text = draft.trim()
    if (!text) return
    const [firstLine, ...rest] = text.split('\n')
    const filed: Note = {
      id: `local-${notes.length}`,
      date: 'Today',
      title: firstLine,
      body: rest.join(' ').trim() || firstLine,
      links: [],
    }
    setNotes([filed, ...notes])
    setDraft('')
  }

  return (
    <>
      {/* Capture */}
      <div className="mt-7 border border-hairline focus-within:border-ink">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="Capture a thought. First line becomes the title."
          className="w-full resize-none bg-transparent p-4 font-serif text-[15px] leading-relaxed text-ink placeholder:italic placeholder:text-faint focus:outline-none"
        />
        <div className="flex items-center justify-between border-t border-hairline px-4 py-2.5">
          <button className="eyebrow" title="Voice capture — coming to a later edition">
            Dictate
          </button>
          <button onClick={file} className="eyebrow-ink underline decoration-hairline underline-offset-4">
            File It
          </button>
        </div>
      </div>

      {/* The archive */}
      <section className="pt-8">
        <p className="eyebrow-ink">Filed</p>
        <ul className="mt-1">
          {notes.map((n) => (
            <li key={n.id} className="rule py-6 first:border-t-0">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="font-serif text-[18px] font-medium leading-snug tracking-tight">
                  {n.title}
                </h3>
                <p className="eyebrow shrink-0 text-faint">{n.date}</p>
              </div>
              <p className="mt-2 font-serif text-[14px] leading-relaxed text-stone">{n.body}</p>
              {n.links.length > 0 && (
                <div className="mt-3.5 flex flex-wrap gap-2">
                  {n.links.map((l) => (
                    <Link
                      key={`${l.type}-${l.ref}`}
                      href={linkHref(l)}
                      className="border border-hairline px-2.5 py-1 font-sans text-[9px] font-medium uppercase tracking-[0.14em] text-stone transition-colors duration-300 ease-editorial hover:border-ink hover:text-ink"
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
