'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import clsx from 'clsx'
import { segments } from '@/lib/data'
import type { BookRecord } from '@/lib/book'

// Amend a reader-added entry after the fact — every field is revisable.
export default function EditContact({ contact }: { contact: BookRecord }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(contact.name)
  const [role, setRole] = useState(contact.role === '—' ? '' : contact.role)
  const [firm, setFirm] = useState(contact.firm)
  const [segment, setSegment] = useState<string>(contact.segment)
  const [location, setLocation] = useState(contact.location ?? '')
  const [context, setContext] = useState(contact.context)
  const [relationship, setRelationship] = useState(contact.relationship ?? '')
  const [followUp, setFollowUp] = useState(contact.followUp ?? '')
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')

  const save = async () => {
    if (!name.trim() || working) return
    setWorking(true)
    setNote('')
    try {
      const res = await fetch('/api/book', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: contact.id,
          name,
          role,
          firm,
          segment,
          location,
          context,
          relationship,
          followUp,
        }),
      })
      const data = await res.json()
      if (data?.ok) {
        setOpen(false)
        router.refresh()
      } else {
        setNote('The amendment did not take. Try again.')
      }
    } catch {
      setNote('Could not reach the desk. Try again.')
    }
    setWorking(false)
  }

  if (!open) {
    return (
      <p className="pt-7">
        <button
          onClick={() => setOpen(true)}
          className="eyebrow-ink underline decoration-hairline underline-offset-4"
        >
          Amend the Entry
        </button>
      </p>
    )
  }

  const field =
    'w-full border-b border-hairline bg-transparent pb-2 font-serif text-[16px] text-ink placeholder:italic placeholder:text-faint focus:border-ink focus:outline-none'

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      className="mt-7 border border-hairline p-5"
    >
      <p className="eyebrow text-oxblood">Amending the Entry</p>
      <div className="mt-5 space-y-5">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={field} />
        <div className="flex gap-4">
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" className={field} />
          <input value={firm} onChange={(e) => setFirm(e.target.value)} placeholder="Firm" className={field} />
        </div>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Location"
          className={field}
        />
        <input
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="One line of context — why they matter"
          className={field}
        />
        <textarea
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
          rows={3}
          placeholder="The relationship — history, judgement, how they came in"
          className={clsx(field, 'resize-none leading-relaxed')}
        />
        <input
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
          placeholder="Worth remembering — the open item"
          className={field}
        />
        <div className="flex flex-wrap gap-3">
          {segments.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSegment(s)}
              className={clsx(
                'font-sans text-[9px] font-medium uppercase tracking-[0.14em] transition-colors duration-300 ease-editorial',
                segment === s ? 'text-ink underline decoration-hairline underline-offset-4' : 'text-faint'
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      {note && <p className="dek mt-4 text-oxblood">{note}</p>}
      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="eyebrow text-faint underline decoration-hairline underline-offset-4"
        >
          Never Mind
        </button>
        <button
          type="submit"
          disabled={working || !name.trim()}
          className="eyebrow-ink underline decoration-hairline underline-offset-4 disabled:opacity-40"
        >
          {working ? 'Filing' : 'File the Amendment'}
        </button>
      </div>
    </form>
  )
}
