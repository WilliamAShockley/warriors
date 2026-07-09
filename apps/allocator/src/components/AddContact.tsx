'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import clsx from 'clsx'
import { segments } from '@/lib/data'

export default function AddContact() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [firm, setFirm] = useState('')
  const [segment, setSegment] = useState<string>(segments[0])
  const [context, setContext] = useState('')
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')

  const file = async () => {
    if (!name.trim() || working) return
    setWorking(true)
    setNote('')
    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role, firm, segment, context }),
      })
      const data = await res.json()
      if (data?.ok) {
        setName('')
        setRole('')
        setFirm('')
        setContext('')
        setOpen(false)
        router.refresh()
      } else {
        setNote('Filed nowhere — the prototype needs its database connected to keep a contact.')
      }
    } catch {
      setNote('Could not file it. Try again.')
    }
    setWorking(false)
  }

  if (!open) {
    return (
      <div className="pt-5 text-center">
        <button
          onClick={() => setOpen(true)}
          className="eyebrow-ink underline decoration-hairline underline-offset-4"
        >
          + Add to the Book
        </button>
      </div>
    )
  }

  const field =
    'w-full border-b border-hairline bg-transparent pb-2 font-serif text-[16px] text-ink placeholder:italic placeholder:text-faint focus:border-ink focus:outline-none'

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        file()
      }}
      className="mt-6 border border-hairline p-5"
    >
      <p className="eyebrow text-oxblood">New Entry</p>
      <div className="mt-5 space-y-5">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus className={field} />
        <div className="flex gap-4">
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" className={field} />
          <input value={firm} onChange={(e) => setFirm(e.target.value)} placeholder="Firm" className={field} />
        </div>
        <input
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="One line of context — why they matter"
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
        <button type="button" onClick={() => setOpen(false)} className="eyebrow text-faint underline decoration-hairline underline-offset-4">
          Never Mind
        </button>
        <button type="submit" disabled={working || !name.trim()} className="eyebrow-ink underline decoration-hairline underline-offset-4 disabled:opacity-40">
          {working ? 'Filing' : 'File the Entry'}
        </button>
      </div>
    </form>
  )
}
