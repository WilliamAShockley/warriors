'use client'

import { useEffect, useState } from 'react'

// Dez's Context: the standing notes behind every cold email. Filed by hand
// here in Settings; the drafting pass reads the whole shelf before it
// writes a word.

type Note = { id: string; text: string; filedOn: string }

export default function ContextShelf() {
  const [notes, setNotes] = useState<Note[]>([])
  const [live, setLive] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState('')
  const [filing, setFiling] = useState(false)
  const [experiment, setExperiment] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/context')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setNotes(data.notes ?? [])
          setLive(Boolean(data.live))
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (typeof data?.contextExperiment === 'boolean') setExperiment(data.contextExperiment)
      })
      .catch(() => {})
  }, [])

  const toggleExperiment = () => {
    if (experiment === null || !live) return
    const next = !experiment
    setExperiment(next)
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contextExperiment: next }),
    }).catch(() => {})
  }

  const add = async () => {
    const text = draft.trim()
    if (!text || filing) return
    setFiling(true)
    try {
      const res = await fetch('/api/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()
      if (data?.note) {
        setNotes((prev) => [...prev, data.note])
        setDraft('')
      }
    } catch {}
    setFiling(false)
  }

  const remove = async (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id))
    fetch('/api/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, remove: true }),
    }).catch(() => {})
  }

  return (
    <section className="pt-10">
      <p className="eyebrow text-oxblood">Context</p>
      <h2 className="mt-2 font-serif text-[22px] font-semibold leading-tight tracking-tight">
        Dez&rsquo;s Context
      </h2>
      <p className="dek mt-2">
        How you think about these businesses — filed in your own words. The desk reads every note
        here before drafting any cold email.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        className="mt-5 border border-hairline focus-within:border-ink"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="e.g. In vertical SaaS I care about payments attach before headcount — the wedge is the workflow, the business is the ledger…"
          className="w-full resize-none bg-transparent p-4 font-serif text-[15px] leading-relaxed text-ink placeholder:italic placeholder:text-faint focus:outline-none"
        />
        <div className="flex items-center justify-between border-t border-hairline px-4 py-2.5">
          <span className="eyebrow text-faint">
            {live ? 'Reads into every cold draft' : 'Connect the backend to file context'}
          </span>
          <button
            type="submit"
            disabled={!draft.trim() || filing || !live}
            className="eyebrow-ink underline decoration-hairline underline-offset-4 disabled:opacity-40"
          >
            {filing ? 'Filing' : 'File It'}
          </button>
        </div>
      </form>

      {/* The experiment switch: cold drafts arrive as an A/B pair while on */}
      {experiment !== null && (
        <div className="mt-4 flex items-baseline justify-between gap-4 border-l border-oxblood pl-4">
          <div>
            <p className="eyebrow-ink">The Experiment</p>
            <p className="dek mt-1 text-[13px]">
              {experiment
                ? 'On — every cold email drafts both ways, decided side by side in The Experiment.'
                : 'Off — cold emails draft once, with your context, straight to the tray.'}
            </p>
          </div>
          <button
            onClick={toggleExperiment}
            className="eyebrow-ink shrink-0 underline decoration-hairline underline-offset-4"
          >
            {experiment ? 'Turn It Off' : 'Turn It On'}
          </button>
        </div>
      )}

      {loaded && notes.length === 0 && (
        <p className="dek pt-6 text-center text-[13px]">
          Nothing on the shelf yet — the first note above starts it.
        </p>
      )}

      {notes.length > 0 && (
        <ul className="mt-2">
          {notes.map((n) => (
            <li key={n.id} className="rule first:border-t-0">
              <div className="flex items-start justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="whitespace-pre-line font-serif text-[15px] leading-relaxed text-ink">
                    {n.text}
                  </p>
                  <p className="eyebrow mt-2 text-faint">Filed {n.filedOn}</p>
                </div>
                <button
                  onClick={() => remove(n.id)}
                  title="Take it down"
                  className="eyebrow shrink-0 pt-1 text-faint underline decoration-hairline underline-offset-4 hover:text-oxblood"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {notes.length > 0 && <div className="rule mt-1" />}
    </section>
  )
}
