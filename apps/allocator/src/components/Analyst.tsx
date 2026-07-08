'use client'

import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { askAnalyst, suggestedQueries, type Briefing } from '@/lib/analyst'

type Exchange = { query: string; briefing: Briefing }

export default function Analyst({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [working, setWorking] = useState(false)
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 350)
  }, [open])

  const submit = (q: string) => {
    const trimmed = q.trim()
    if (!trimmed || working) return
    setQuery('')
    setWorking(true)
    // A considered pause — the desk does not answer instantly.
    setTimeout(() => {
      setExchanges((prev) => [...prev, { query: trimmed, briefing: askAnalyst(trimmed) }])
      setWorking(false)
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 60)
    }, 900)
  }

  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 bg-paper transition-all duration-500 ease-editorial',
        open ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      )}
    >
      <div className="mx-auto flex h-full max-w-[430px] flex-col px-6">
        <header className="flex items-baseline justify-between pt-14">
          <div>
            <p className="eyebrow">The Analyst</p>
            <p className="dek mt-1">Answers from your own record.</p>
          </div>
          <button
            onClick={onClose}
            className="eyebrow-ink underline decoration-hairline underline-offset-4"
          >
            Done
          </button>
        </header>

        <div className="rule mt-5" />

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto py-6">
          {exchanges.length === 0 && !working && (
            <div className="pt-2">
              <p className="eyebrow mb-4">You might ask</p>
              <ul>
                {suggestedQueries.map((s) => (
                  <li key={s} className="rule first:border-t-0">
                    <button
                      onClick={() => submit(s)}
                      className="w-full py-3.5 text-left font-serif text-[16px] leading-snug text-ink"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {exchanges.map((ex, i) => (
            <article key={i} className={clsx(i > 0 && 'rule mt-8 pt-8')}>
              <p className="eyebrow">You asked</p>
              <p className="dek mt-1">{ex.query}</p>
              <h2 className="mt-5 font-serif text-[24px] font-medium leading-tight tracking-tight">
                {ex.briefing.title}
              </h2>
              <p className="eyebrow mt-2">{ex.briefing.dateline}</p>
              <div className="mt-5 space-y-5">
                {ex.briefing.sections.map((s) => (
                  <section key={s.label}>
                    <p className="eyebrow-ink mb-1.5">{s.label}</p>
                    <p className="body-copy">{s.body}</p>
                  </section>
                ))}
              </div>
            </article>
          ))}

          {working && (
            <p className="dek mt-8 animate-pulse">The desk is looking through the file…</p>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit(query)
          }}
          className="border-t border-ink pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4"
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask about a person, a company, a thesis…"
            className="w-full bg-transparent font-serif text-[16px] italic text-ink placeholder:text-faint focus:outline-none"
          />
        </form>
      </div>
    </div>
  )
}
