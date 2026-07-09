'use client'

import { useEffect, useState } from 'react'
import type { MarginRecord } from '@/lib/margin'

export default function Margin() {
  const [entries, setEntries] = useState<MarginRecord[]>([])
  const [draft, setDraft] = useState('')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    fetch('/api/margin')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.entries) setEntries(data.entries)
      })
      .catch(() => {})
  }, [])

  const file = async () => {
    const text = draft.trim()
    if (!text || working) return
    setDraft('')
    setWorking(true)
    try {
      const res = await fetch('/api/margin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()
      if (data?.entry) {
        setEntries((prev) => [data.entry, ...prev])
      } else {
        setEntries((prev) => [{ id: `local-${prev.length}`, text, reply: null, when: 'Just now' }, ...prev])
      }
    } catch {
      setEntries((prev) => [{ id: `local-${prev.length}`, text, reply: null, when: 'Just now' }, ...prev])
    }
    setWorking(false)
  }

  return (
    <section className="pt-10">
      <p className="eyebrow text-oxblood">The Margin</p>
      <p className="dek mt-1.5">
        Think aloud — whatever is on your mind. The desk replies in the margin, and
        yesterday’s entries return each morning for recital.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          file()
        }}
        className="mt-5 border border-hairline focus-within:border-ink"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="What did you notice today?"
          className="w-full resize-none bg-transparent p-4 font-serif text-[15px] leading-relaxed text-ink placeholder:italic placeholder:text-faint focus:outline-none"
        />
        <div className="flex items-center justify-between border-t border-hairline px-4 py-2.5">
          <span className="eyebrow text-faint">Dictation works — use the keyboard mic</span>
          <button type="submit" className="eyebrow-ink underline decoration-hairline underline-offset-4">
            File It
          </button>
        </div>
      </form>

      {working && <p className="dek mt-5 animate-pulse">The desk is considering it…</p>}

      <ul className="mt-2">
        {entries.map((e) => (
          <li key={e.id} className="rule py-6 first:border-t-0">
            <p className="eyebrow text-faint">{e.when}</p>
            <p className="body-copy mt-2">{e.text}</p>
            {e.reply && (
              <div className="mt-4 border-l border-oxblood pl-4">
                <p className="eyebrow-ink">The Desk</p>
                <p className="mt-1.5 font-serif text-[14px] italic leading-relaxed text-stone">
                  {e.reply}
                </p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
