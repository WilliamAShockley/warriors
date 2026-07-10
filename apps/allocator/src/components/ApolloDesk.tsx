'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

type DeskTask = {
  id: string
  ask: string
  status: 'received' | 'working' | 'done' | 'failed'
  verdict: string | null
}

function statusLabel(t: DeskTask): string {
  if (t.status === 'working' || t.status === 'received') return 'Working'
  if (t.status === 'failed') return 'Failed'
  return t.verdict === 'needs-work' ? 'Needs another pass' : 'Filed'
}

export default function ApolloDesk() {
  const [draft, setDraft] = useState('')
  const [tasks, setTasks] = useState<DeskTask[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/apollo')
      if (!res.ok) return
      const data = await res.json()
      setTasks((data.tasks ?? []).slice(0, 3))
      return (data.tasks ?? []).some(
        (t: DeskTask) => t.status === 'working' || t.status === 'received'
      )
    } catch {
      return false
    }
  }, [])

  // Poll while anything is working.
  useEffect(() => {
    refresh()
    timer.current = setInterval(async () => {
      const busy = await refresh()
      if (!busy && timer.current) {
        clearInterval(timer.current)
        timer.current = null
      }
    }, 4000)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [refresh])

  const handOff = () => {
    const ask = draft.trim()
    if (!ask) return
    setDraft('')
    setNotice(null)

    // Fire the run; don't block on it — the run takes minutes and progress
    // lands in the database. An early response only matters in mock mode.
    fetch('/api/apollo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ask }),
      signal: AbortSignal.timeout(8000),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.live === false) {
          setNotice('Apollo reports for duty once the backend is connected.')
        }
      })
      .catch(() => {})

    // Start (or restart) polling so the new task appears as it files.
    setTimeout(refresh, 800)
    if (!timer.current) {
      timer.current = setInterval(async () => {
        const busy = await refresh()
        if (!busy && timer.current) {
          clearInterval(timer.current)
          timer.current = null
        }
      }, 4000)
    }
  }

  return (
    <section>
      <p className="eyebrow text-oxblood">Apollo Agent</p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          handOff()
        }}
        className="mt-3 flex items-baseline gap-4 border-b border-ink pb-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Hand Apollo a task…"
          className="w-full bg-transparent font-serif text-[17px] italic text-ink placeholder:text-faint focus:outline-none"
        />
        <button type="submit" className="eyebrow-ink shrink-0 underline decoration-hairline underline-offset-4">
          Send
        </button>
      </form>

      {notice && <p className="dek mt-3 text-[13px]">{notice}</p>}

      {tasks.length > 0 && (
        <ul className="mt-4">
          {tasks.map((t) => {
            const label = statusLabel(t)
            return (
              <li key={t.id}>
                <Link href={`/apollo/${t.id}`} className="flex items-baseline gap-3 py-1.5">
                  <span
                    className={clsx(
                      'eyebrow shrink-0',
                      label === 'Working' ? 'animate-pulse text-oxblood' : 'text-faint'
                    )}
                  >
                    {label}
                  </span>
                  <span className="truncate font-serif text-[15px] leading-snug text-ink">
                    {t.ask}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
