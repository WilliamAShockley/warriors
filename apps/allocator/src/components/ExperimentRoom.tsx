'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import { redlineDiff, changeKey } from '@/lib/redline'

// The Experiment: one A/B pair on the desk at a time — the same cold
// email drafted WITH Dez's Context and WITHOUT it, side by side. Either
// arm amends inline (edits tracked against its staged original), the
// reader picks the better one (tracked forever on the tally), and the
// chosen draft can sign and send right here — the same machinery as the
// proof room, delivery watch and all.

type Arm = { label: string; subject?: string; body: string }

type Entry = {
  id: string
  title: string
  summary: string | null
  filedOn: string
  todo: { id: string; text: string } | null
  to: string | null
  company: string | null
  arms: Arm[]
  live: Arm[]
  selected: number
  chosen: number | null
  stp: { id: string; label: string; pass: boolean; detail: string }[] | null
  grounding: string | null
  dossier: string | null
  websiteUrl: string | null
  linkedinUrl: string | null
}

type Score = {
  decided: number
  withWins: number
  withoutWins: number
  editedBeforeChoosing: number
}

export default function ExperimentRoom() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [score, setScore] = useState<Score | null>(null)
  const [live, setLive] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')

  // Inline amendment, one arm at a time.
  const [editingArm, setEditingArm] = useState<number | null>(null)
  const [draftBody, setDraftBody] = useState('')
  const [draftSubject, setDraftSubject] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch('/api/experiment')
      const data = await res.json()
      setEntries(data?.entries ?? [])
      setScore(data?.score ?? null)
      setLive(Boolean(data?.live))
    } catch {
      setEntries([])
    }
    setLoaded(true)
    setEditingArm(null)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const entry = entries[0] ?? null

  const updateEntry = (next: Entry) => {
    setEntries((prev) => prev.map((e) => (e.id === next.id ? next : e)))
  }

  const beginEdit = (arm: number) => {
    if (!entry) return
    setEditingArm(arm)
    setDraftBody(entry.live[arm]?.body ?? '')
    setDraftSubject(entry.live[arm]?.subject ?? '')
  }

  const saveEdit = async () => {
    if (!entry || editingArm === null || saving || !draftBody.trim()) return
    setSaving(true)
    setNote('')
    try {
      const res = await fetch('/api/experiment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, arm: editingArm, body: draftBody, subject: draftSubject }),
      })
      const data = await res.json()
      if (data?.ok && data?.entry) {
        updateEntry(data.entry)
        setEditingArm(null)
      } else {
        setNote(data?.error ?? 'The amendment did not take. Try again.')
      }
    } catch {
      setNote('Could not reach the desk. Try again.')
    }
    setSaving(false)
  }

  const act = async (action: 'pick' | 'send' | 'spike', arm?: number) => {
    if (!entry || working) return
    setWorking(true)
    setNote('')
    try {
      const res = await fetch('/api/experiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, action, ...(arm !== undefined ? { arm } : {}) }),
      })
      const data = await res.json()
      if (action === 'pick' && data?.ok && data?.entry) {
        updateEntry(data.entry)
      } else if (action === 'send' && data?.ok) {
        await fetchAll()
      } else if (action === 'spike' && data?.ok) {
        await fetchAll()
      } else {
        setNote(data?.error ?? 'That did not take. Try again.')
      }
    } catch {
      setNote('Could not reach the desk. Try again.')
    }
    setWorking(false)
  }

  if (!loaded) return null

  const scoreLine = score && score.decided > 0 && (
    <p className="eyebrow mt-4 text-faint">
      The score · with context {score.withWins} — {score.withoutWins} without
      {score.editedBeforeChoosing > 0 ? ` · ${score.editedBeforeChoosing} edited before choosing` : ''}
    </p>
  )

  if (!entry) {
    return (
      <div className="pt-20 text-center">
        <p className="font-serif text-[19px] font-medium leading-snug tracking-tight">
          No pair on the desk.
        </p>
        <p className="dek mt-3">
          {live
            ? 'Cold email drafts arrive here in pairs as the desk produces them — with your context, and without.'
            : 'Connect the backend and cold drafts arrive here in pairs.'}
        </p>
        <div className="flex justify-center">{scoreLine}</div>
        <p className="pt-6">
          <Link href="/review" className="eyebrow-ink underline decoration-hairline underline-offset-4">
            To the tray →
          </Link>
        </p>
      </div>
    )
  }

  // The delta between the two live arms — what your context changed.
  const delta = entry.live.length >= 2 ? redlineDiff(entry.live[1].body, entry.live[0].body) : []
  const edited = (i: number) =>
    entry.live[i] &&
    entry.arms[i] &&
    (entry.live[i].body !== entry.arms[i].body ||
      (entry.live[i].subject ?? '') !== (entry.arms[i].subject ?? ''))

  const field =
    'w-full border-b border-hairline bg-transparent pb-1.5 font-serif text-[14px] text-ink placeholder:italic placeholder:text-faint focus:border-ink focus:outline-none'

  return (
    <div>
      <header className="pt-7">
        <div className="flex items-baseline justify-between gap-4">
          <p className="eyebrow text-oxblood">On the Desk</p>
          <p className="eyebrow text-faint">
            {entries.length} pair{entries.length === 1 ? '' : 's'} waiting · filed {entry.filedOn}
          </p>
        </div>
        {scoreLine}
        {entry.todo && (
          <Link href="/todos" className="mt-3.5 block border-l border-oxblood pl-4">
            <p className="eyebrow">From the Docket</p>
            <p className="mt-1 font-serif text-[15px] italic leading-snug text-stone">
              {entry.todo.text}
            </p>
          </Link>
        )}
        <h2 className="mt-3.5 font-serif text-[24px] font-medium leading-[1.15] tracking-tight">
          {entry.title}
        </h2>
        {entry.summary && <p className="dek mt-2">{entry.summary}</p>}
        <p className="eyebrow mt-2 text-faint">
          To · {entry.to ?? '— (goes out over LinkedIn)'}
        </p>
      </header>

      {/* The two arms, side by side on a desk wide enough */}
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {entry.live.map((arm, i) => {
          const isChosen = entry.chosen === i
          const isEditing = editingArm === i
          return (
            <div
              key={i}
              className={clsx('border p-5', isChosen ? 'border-ink' : 'border-hairline')}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className={clsx('eyebrow', i === 0 ? 'text-oxblood' : 'text-faint')}>
                  {arm.label}
                </p>
                <p className="eyebrow text-faint">
                  {isChosen ? 'chosen' : edited(i) ? 'amended' : ''}
                </p>
              </div>

              {isEditing ? (
                <div className="mt-3 space-y-3">
                  <input
                    value={draftSubject}
                    onChange={(e) => setDraftSubject(e.target.value)}
                    placeholder="Subject"
                    className={field}
                  />
                  <textarea
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    rows={Math.min(18, Math.max(8, draftBody.split('\n').length + 2))}
                    className="w-full resize-none bg-transparent font-serif text-[14px] leading-relaxed text-ink focus:outline-none"
                  />
                  <div className="flex items-center justify-between border-t border-hairline pt-3">
                    <button
                      onClick={() => setEditingArm(null)}
                      className="eyebrow text-faint underline decoration-hairline underline-offset-4"
                    >
                      Never Mind
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={saving || !draftBody.trim()}
                      className="eyebrow-ink underline decoration-hairline underline-offset-4 disabled:opacity-40"
                    >
                      {saving ? 'Filing' : 'File the Amendment'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="eyebrow mt-3">Subject · {arm.subject ?? entry.title}</p>
                  <div className="mt-3 space-y-3 border-t border-hairline pt-3">
                    {arm.body.split('\n\n').map((para, j) => (
                      <p key={j} className="whitespace-pre-line font-serif text-[14px] leading-relaxed text-ink">
                        {para}
                      </p>
                    ))}
                  </div>
                  {edited(i) && (
                    <p className="eyebrow mt-3 text-faint">
                      Amended — the edits count against this arm's staged original
                    </p>
                  )}
                  <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
                    <button
                      onClick={() => beginEdit(i)}
                      disabled={working}
                      className="eyebrow text-faint underline decoration-hairline underline-offset-4 disabled:opacity-40"
                    >
                      Amend
                    </button>
                    <div className="flex items-center gap-4">
                      {!isChosen && (
                        <button
                          onClick={() => act('pick', i)}
                          disabled={working}
                          title="Record the verdict; the draft goes on deck for signing"
                          className="eyebrow-ink underline decoration-hairline underline-offset-4 disabled:opacity-40"
                        >
                          Choose
                        </button>
                      )}
                      <button
                        onClick={() => act('send', i)}
                        disabled={working || Boolean(editingArm !== null) || !entry.to}
                        title={
                          entry.to
                            ? 'Record the verdict AND sign — the email actually sends'
                            : 'No email address — sign it from the proof room over LinkedIn'
                        }
                        className={clsx(
                          'eyebrow underline decoration-hairline underline-offset-4 disabled:opacity-40',
                          isChosen ? 'text-oxblood' : 'text-ink'
                        )}
                      >
                        {working ? 'Working' : isChosen ? 'Sign & Send →' : 'Choose & Send →'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {note && <p className="dek mt-4 text-oxblood">{note}</p>}

      {/* The Delta — what your context changed, live arm against live arm */}
      <div className="mt-7">
        <div className="flex items-baseline justify-between gap-4">
          <p className="eyebrow text-oxblood">The Delta</p>
          <p className="eyebrow text-faint">
            {delta.length === 0
              ? 'the two drafts read identically'
              : `${delta.length} difference${delta.length === 1 ? '' : 's'} · without → with`}
          </p>
        </div>
        {delta.length > 0 && (
          <ul className="mt-1">
            {delta.map((c) => (
              <li key={changeKey(c)} className="rule py-3 first:border-t-0">
                {c.kind === 'struck' && (
                  <>
                    <p className="eyebrow text-faint">Only without context</p>
                    <p className="mt-1 font-serif text-[14px] leading-relaxed text-stone">{c.a}</p>
                  </>
                )}
                {c.kind === 'added' && (
                  <>
                    <p className="eyebrow text-oxblood">Only with context</p>
                    <p className="mt-1 font-serif text-[14px] leading-relaxed text-ink">{c.b}</p>
                  </>
                )}
                {c.kind === 'reworded' && (
                  <>
                    <p className="eyebrow">Differs</p>
                    <p className="mt-1 font-serif text-[14px] leading-relaxed text-stone">{c.a}</p>
                    <p className="mt-1 font-serif text-[14px] leading-relaxed text-ink">{c.b}</p>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* The checks, as they stand for the draft on deck */}
      {entry.stp && entry.stp.length > 0 && (
        <div className="mt-6">
          <p className="eyebrow text-oxblood">The Checks</p>
          <ul className="mt-1">
            {entry.stp.map((c) => (
              <li key={c.id} className="rule py-2.5 first:border-t-0">
                <p className={clsx('eyebrow', c.pass ? 'text-faint' : 'text-oxblood')}>
                  {c.pass ? '✓' : '✗'} {c.label}
                </p>
                <p className="mt-1 font-serif text-[13.5px] italic leading-snug text-stone">{c.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between pb-10 pt-7">
        <button
          onClick={() => act('spike')}
          disabled={working}
          title="Kill the pair — no verdict files, nothing sends"
          className="eyebrow text-faint underline decoration-hairline underline-offset-4 disabled:opacity-40"
        >
          Spike the Pair
        </button>
        <Link href="/review" className="eyebrow text-faint underline decoration-hairline underline-offset-4">
          The full proof room →
        </Link>
      </div>
    </div>
  )
}
