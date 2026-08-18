'use client'

import { useEffect, useState } from 'react'

type Company = {
  id: string
  name: string
  founderFirstName: string | null
  founderFullName: string | null
  context: string | null
  websiteUrl: string | null
  founderEmail: string | null
  linkedinUrl: string | null
  enrichedOn: string | null
}

// While the desk researches a just-filed entry, the line cycles through
// these — half status report, half company. The reader watches the work.
const RESEARCHING_PHRASES = [
  'Loading the context…',
  'Doing the research…',
  'Doing your bidding…',
  'AI agents are so fun…',
  'Reading the trade press…',
  'Checking the filings…',
  'Asking around town…',
  'Thumbing the rolodex…',
  'Ringing the switchboard…',
  'The desk is on it…',
]

// The Register: the context table, editable in place. Tap an entry to open
// its fields; the worker and the nightly pass write here too.
export default function Register() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [live, setLive] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')

  // Entries filed this session whose research is still in flight, and
  // entries whose context just landed (for the arrival flourish).
  const [researching, setResearching] = useState<Record<string, boolean>>({})
  const [arrived, setArrived] = useState<Record<string, boolean>>({})
  const [tick, setTick] = useState(0)

  // The add form
  const [newName, setNewName] = useState('')
  const [newFounder, setNewFounder] = useState('')
  const [newContext, setNewContext] = useState('')

  const refetch = () =>
    fetch('/api/context')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return
        setLive(Boolean(data.live))
        setCompanies(data.companies ?? [])
      })
      .catch(() => {})

  useEffect(() => {
    refetch().finally(() => setLoaded(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // While research is in flight: rotate the phrases and poll the desk.
  // A hard stop after three minutes returns the entry to its quiet state
  // (the nightly pass retries anything the file-time check missed).
  const researchingCount = Object.keys(researching).length
  useEffect(() => {
    if (researchingCount === 0) return
    const spinner = setInterval(() => setTick((t) => t + 1), 2200)
    const poll = setInterval(refetch, 6000)
    const giveUp = setTimeout(() => setResearching({}), 180_000)
    return () => {
      clearInterval(spinner)
      clearInterval(poll)
      clearTimeout(giveUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [researchingCount])

  // The moment an in-flight entry comes back enriched, retire its loading
  // state and flash the arrival.
  useEffect(() => {
    const done = companies.filter((c) => researching[c.id] && c.enrichedOn)
    if (done.length === 0) return
    setResearching((prev) => {
      const next = { ...prev }
      for (const c of done) delete next[c.id]
      return next
    })
    setArrived((prev) => ({ ...prev, ...Object.fromEntries(done.map((c) => [c.id, true])) }))
    for (const c of done) {
      setTimeout(
        () =>
          setArrived((prev) => {
            const next = { ...prev }
            delete next[c.id]
            return next
          }),
        6000
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies])

  const add = async () => {
    const name = newName.trim()
    if (!name) return
    setNote('')
    try {
      const res = await fetch('/api/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, founderFirstName: newFounder.trim(), context: newContext.trim() }),
      })
      const data = await res.json()
      if (data?.ok && data?.company) {
        setCompanies((prev) => [data.company, ...prev.filter((c) => c.id !== data.company.id)])
        setNewName('')
        setNewFounder('')
        setNewContext('')
        if (live && !data.company.enrichedOn) {
          setResearching((prev) => ({ ...prev, [data.company.id]: true }))
        }
      } else {
        setNote(data?.error ?? 'That did not take.')
      }
    } catch {
      setNote('Could not reach the desk.')
    }
  }

  const open = (c: Company) => {
    setOpenId(c.id)
    setDraft({
      name: c.name,
      founderFirstName: c.founderFirstName ?? '',
      founderFullName: c.founderFullName ?? '',
      context: c.context ?? '',
      websiteUrl: c.websiteUrl ?? '',
      founderEmail: c.founderEmail ?? '',
      linkedinUrl: c.linkedinUrl ?? '',
    })
  }

  const save = async (id: string) => {
    setNote('')
    try {
      const res = await fetch('/api/context', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...draft }),
      })
      const data = await res.json()
      if (data?.ok && data?.company) {
        setCompanies((prev) => prev.map((c) => (c.id === id ? data.company : c)))
        setOpenId(null)
      } else {
        setNote(data?.error ?? 'That did not take.')
      }
    } catch {
      setNote('Could not reach the desk.')
    }
  }

  // Research It Now: synchronous, honest — a failure surfaces its reason.
  const [researchingNow, setResearchingNow] = useState(false)
  const researchNow = async (id: string) => {
    if (researchingNow) return
    setResearchingNow(true)
    setNote('')
    try {
      const res = await fetch('/api/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enrich: true }),
      })
      const data = await res.json()
      if (data?.ok && data?.company) {
        setCompanies((prev) => prev.map((c) => (c.id === id ? data.company : c)))
        setOpenId(null)
        setArrived((prev) => ({ ...prev, [id]: true }))
        setTimeout(
          () =>
            setArrived((prev) => {
              const next = { ...prev }
              delete next[id]
              return next
            }),
          6000
        )
      } else {
        setNote(`The research failed: ${data?.error ?? 'no reason given'}`)
      }
    } catch {
      setNote('Could not reach the desk.')
    }
    setResearchingNow(false)
  }

  const strike = async (id: string) => {
    if (!window.confirm('Strike this entry from the Register?')) return
    try {
      const res = await fetch('/api/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, remove: true }),
      })
      const data = await res.json()
      if (data?.ok) setCompanies((prev) => prev.filter((c) => c.id !== id))
    } catch {}
  }

  const field =
    'w-full border-b border-hairline bg-transparent pb-1.5 font-serif text-[15px] text-ink placeholder:italic placeholder:text-faint focus:border-ink focus:outline-none'

  return (
    <>
      {/* File a company */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        className="mt-7 border border-hairline p-4 focus-within:border-ink"
      >
        <div className="flex gap-4">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Company" className={field} />
          <input
            value={newFounder}
            onChange={(e) => setNewFounder(e.target.value)}
            placeholder="Founder’s first name"
            className={field}
          />
        </div>
        <textarea
          value={newContext}
          onChange={(e) => setNewContext(e.target.value)}
          rows={2}
          placeholder="Context — what it does, stage, the hook…"
          className="mt-3 w-full resize-none bg-transparent font-serif text-[15px] leading-relaxed text-ink placeholder:italic placeholder:text-faint focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2.5">
          <span className="eyebrow text-faint">Files, then researches itself — context arrives in a minute</span>
          <button
            type="submit"
            disabled={!newName.trim()}
            className="eyebrow-ink underline decoration-hairline underline-offset-4 disabled:opacity-40"
          >
            File It
          </button>
        </div>
      </form>

      {note && <p className="dek mt-4 text-[13px] text-oxblood">{note}</p>}

      {loaded && companies.length === 0 && (
        <p className="dek pt-10 text-center">
          {live
            ? 'Nothing on the Register yet. It fills itself as the desk researches — or file the first entry above.'
            : 'The mocked edition keeps no Register — connect the backend.'}
        </p>
      )}

      <ul className="mt-2 md:grid md:grid-cols-2 md:gap-x-10">
        {companies.map((c, i) => (
          <li key={c.id} className="rule first:border-t-0 md:[&:nth-child(2)]:border-t-0">
            {openId === c.id ? (
              <div className="py-5">
                <p className="eyebrow text-oxblood">Amending the Entry</p>
                <div className="mt-4 space-y-4">
                  <div className="flex gap-4">
                    <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Company" className={field} />
                    <input value={draft.founderFirstName} onChange={(e) => setDraft((d) => ({ ...d, founderFirstName: e.target.value }))} placeholder="Founder’s first name" className={field} />
                  </div>
                  <input value={draft.founderFullName} onChange={(e) => setDraft((d) => ({ ...d, founderFullName: e.target.value }))} placeholder="Founder’s full name" className={field} />
                  <textarea
                    value={draft.context}
                    onChange={(e) => setDraft((d) => ({ ...d, context: e.target.value }))}
                    rows={4}
                    placeholder="Context"
                    className="w-full resize-y border border-hairline bg-transparent p-3 font-serif text-[14px] leading-relaxed text-ink focus:border-ink focus:outline-none"
                  />
                  <div className="flex gap-4">
                    <input value={draft.websiteUrl} onChange={(e) => setDraft((d) => ({ ...d, websiteUrl: e.target.value }))} placeholder="https:// site" className={field} />
                    <input value={draft.founderEmail} onChange={(e) => setDraft((d) => ({ ...d, founderEmail: e.target.value }))} placeholder="Founder’s email" className={field} />
                  </div>
                  <input value={draft.linkedinUrl} onChange={(e) => setDraft((d) => ({ ...d, linkedinUrl: e.target.value }))} placeholder="LinkedIn URL" className={field} />
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
                  <div className="flex gap-5">
                    <button onClick={() => setOpenId(null)} className="eyebrow text-faint underline decoration-hairline underline-offset-4">
                      Never Mind
                    </button>
                    <button onClick={() => strike(c.id)} className="eyebrow text-faint underline decoration-hairline underline-offset-4 hover:text-oxblood">
                      Strike
                    </button>
                  </div>
                  <div className="flex gap-5">
                    <button
                      onClick={() => researchNow(c.id)}
                      disabled={researchingNow}
                      title="Run the web check now — takes up to a minute; a failure reports its reason"
                      className="eyebrow text-oxblood underline decoration-hairline underline-offset-4 disabled:opacity-40"
                    >
                      {researchingNow ? 'Researching…' : 'Research It Now'}
                    </button>
                    <button onClick={() => save(c.id)} className="eyebrow-ink underline decoration-hairline underline-offset-4">
                      File the Amendment
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button onClick={() => open(c)} className="block w-full py-5 text-left">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-serif text-[19px] font-medium leading-snug tracking-tight">{c.name}</h3>
                  <p className="eyebrow shrink-0">
                    {researching[c.id] ? (
                      <span className="animate-pulse text-oxblood">researching…</span>
                    ) : arrived[c.id] ? (
                      <span className="text-oxblood">fresh off the wire</span>
                    ) : (
                      <span className="text-faint">
                        {c.enrichedOn ? `refreshed ${c.enrichedOn}` : 'not yet refreshed'}
                      </span>
                    )}
                  </p>
                </div>
                {(c.founderFirstName || c.founderFullName) && (
                  <p className="eyebrow mt-1.5">
                    {c.founderFullName ?? c.founderFirstName}
                    {c.founderEmail ? ` · ${c.founderEmail}` : ''}
                  </p>
                )}
                {researching[c.id] && !c.context ? (
                  <p className="mt-2 animate-pulse font-serif text-[14px] italic leading-relaxed text-stone">
                    {RESEARCHING_PHRASES[(tick + i) % RESEARCHING_PHRASES.length]}
                  </p>
                ) : (
                  c.context && (
                    <p
                      className={
                        arrived[c.id]
                          ? 'mt-2 font-serif text-[14px] italic leading-relaxed text-ink transition-colors duration-1000'
                          : 'mt-2 font-serif text-[14px] italic leading-relaxed text-stone transition-colors duration-1000'
                      }
                    >
                      {c.context}
                    </p>
                  )
                )}
              </button>
            )}
          </li>
        ))}
      </ul>
      {companies.length > 0 && <div className="rule mt-1" />}
    </>
  )
}
