'use client'

import { useEffect, useState } from 'react'
import clsx from 'clsx'

// The follow-up cadence: every signed cold founder email is followed up
// over eight weekly touches (the cold email, then up to seven nudges) at
// randomized days and hours. This panel holds the mode switch and the
// ledger — who is mid-cadence, when the next touch lands, and a stop.

type Mode = 'off' | 'review' | 'auto'

type Entry = {
  id: string
  company: string | null
  to: string | null
  subject: string | null
  status: string
  stopReason: string | null
  touchesDone: number
  endsOn: string
  nextSendAt: string | null
  pendingProofId: string | null
  lastError: string | null
}

const MODES: { id: Mode; label: string; dek: string }[] = [
  { id: 'off', label: 'Off', dek: 'Nothing is drafted or sent.' },
  { id: 'review', label: 'Review', dek: 'Each nudge is drafted into The Proofs; your signature sends it.' },
  { id: 'auto', label: 'Auto', dek: 'Sent in-thread on its own, only when every check clears. Anything shakier goes to The Proofs.' },
]

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))

export default function FollowUpCadence() {
  const [mode, setMode] = useState<Mode | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [live, setLive] = useState(false)

  const load = () =>
    fetch('/api/followups')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return
        setMode(data.mode)
        setEntries(data.entries ?? [])
        setLive(Boolean(data.live))
      })
      .catch(() => {})

  useEffect(() => {
    load()
  }, [])

  const post = (body: Record<string, unknown>) =>
    fetch('/api/followups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {})

  if (!live || mode === null) return null

  const active = entries.filter((e) => e.status === 'active')

  return (
    <section className="pt-8">
      <p className="eyebrow-ink">The Follow-up Cadence</p>
      <p className="dek mt-1.5 text-[13px]">
        Every signed cold email to a founder is followed up for eight weeks - each nudge lands a
        random 3-7 days after the last, between 6 and 11 PM ET, never more than one a calendar week. A reply or a bounce ends it.
      </p>

      <div className="mt-4 flex gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => {
              setMode(m.id)
              post({ mode: m.id })
            }}
            className={clsx(
              'flex-1 border py-2.5 font-sans text-[10px] font-medium uppercase tracking-[0.18em] transition-colors duration-300 ease-editorial',
              mode === m.id ? 'border-ink bg-ink text-paper' : 'border-ink text-ink hover:bg-ink hover:text-paper'
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="dek mt-2 text-[13px]">{MODES.find((m) => m.id === mode)?.dek}</p>

      {entries.length > 0 && (
        <>
          <p className="eyebrow mt-6 text-faint">
            {active.length} in flight · {entries.length - active.length} finished
          </p>
          <ul className="mt-2">
            {entries.map((e) => (
              <li key={e.id} className="rule first:border-t-0">
                <div className="flex items-baseline justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-serif text-[16px] leading-snug text-ink">
                      {e.company ?? e.to ?? e.subject}
                    </p>
                    <p className="eyebrow mt-0.5 text-faint">
                      {e.touchesDone} follow-up{e.touchesDone === 1 ? '' : 's'} sent
                      {e.status === 'active'
                        ? e.pendingProofId
                          ? ' · awaiting your signature'
                          : e.nextSendAt
                            ? ` · next ${when(e.nextSendAt)}`
                            : ''
                        : ` · ${e.stopReason ?? e.status}`}
                    </p>
                    {e.lastError && <p className="eyebrow mt-0.5 text-oxblood">{e.lastError}</p>}
                  </div>
                  {e.status === 'active' ? (
                    <button
                      onClick={() => post({ id: e.id, action: 'stop' }).then(load)}
                      className="eyebrow-ink shrink-0 underline decoration-hairline underline-offset-4"
                    >
                      Stop
                    </button>
                  ) : e.status !== 'completed' ? (
                    <button
                      onClick={() => post({ id: e.id, action: 'resume' }).then(load)}
                      className="eyebrow-ink shrink-0 underline decoration-hairline underline-offset-4"
                    >
                      Resume
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
