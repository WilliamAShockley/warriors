'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { Ledger, ProofRecord } from '@/lib/review'

// The Proofs: one page on the desk at a time. The arrow signs it — approval
// executes the attached action (an email actually sends) and the next proof
// slides in. Hold sends it to the back of the queue; Spike kills it.
// The learning layer: amend the draft inline, leave notes the desk studies,
// and highlight any line to ask where the language came from.

const KIND_LABEL: Record<string, string> = {
  email: 'An Email, Drafted',
  post: 'A Post, Drafted',
  analysis: 'An Analysis, Prepared',
}

const SOURCE_LABEL: Record<string, string> = {
  research: 'From the research',
  thread: 'From the thread',
  voice: 'Your own voice',
  unsupported: 'Unsupported — check it before it runs',
}

type Provenance = { source: string; explanation: string }

// ————— The Redline: tracked changes, computed client-side as the pen moves.
// The diff itself lives in lib/redline — the Record draws with the same pen.

import { redlineDiff, changeKey, type Change } from '@/lib/redline'

// Each entry slides in as it is detected — the point is that the reader
// SEES the system register the change.
function RedlineEntry({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const f = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(f)
  }, [])
  return (
    <li
      className={clsx(
        'rule py-3.5 transition-all duration-300 ease-editorial first:border-t-0',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
      )}
    >
      {children}
    </li>
  )
}

// The storefront: a screenshot of the recipient company's site, via the
// keyless mShots service. It serves a placeholder while the shot renders,
// so the image quietly re-fetches a few times before settling.
function SiteShot({ url }: { url: string }) {
  const [tick, setTick] = useState(0)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setTick(0)
    setFailed(false)
  }, [url])
  useEffect(() => {
    if (failed || tick >= 4) return
    const t = setTimeout(() => setTick((n) => n + 1), 6000)
    return () => clearTimeout(t)
  }, [tick, failed])
  if (failed) {
    return (
      <p className="dek mt-3 text-[13px]">
        The site would not sit for its portrait —{' '}
        <a href={url} target="_blank" rel="noreferrer" className="underline decoration-hairline underline-offset-4">
          visit it directly
        </a>
        .
      </p>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://s0.wp.com/mshots/v1/${encodeURIComponent(url)}?w=1200&vpw=1280&vph=800${tick ? `&refresh=${tick}` : ''}`}
      alt={`Screenshot of ${url}`}
      onError={() => setFailed(true)}
      className="mt-3 w-full border border-hairline"
    />
  )
}

// Render a paragraph with the highlighted passage marked bold and yellow.
function Para({ text, highlight }: { text: string; highlight: string | null }) {
  if (!highlight) return <p className="body-copy whitespace-pre-line">{text}</p>
  const at = text.indexOf(highlight)
  if (at === -1) return <p className="body-copy whitespace-pre-line">{text}</p>
  return (
    <p className="body-copy whitespace-pre-line">
      {text.slice(0, at)}
      <mark className="bg-[#f7e27b] px-0.5 font-semibold text-ink">{highlight}</mark>
      {text.slice(at + highlight.length)}
    </p>
  )
}

export default function ProofRoom() {
  // Arriving from the Docket: ?todo=<id> puts that item's proof on deck
  // first. Consumed once — every verdict thereafter walks the queue.
  const searchParams = useSearchParams()
  const todoFocus = useRef<string | null>(searchParams.get('todo'))

  const [proof, setProof] = useState<ProofRecord | null>(null)
  const [theLedger, setTheLedger] = useState<Ledger | null>(null)
  const [total, setTotal] = useState(0)
  const [live, setLive] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [working, setWorking] = useState(false)
  const [entering, setEntering] = useState(true)
  const [note, setNote] = useState('')

  // Inline amendment
  const [editing, setEditing] = useState(false)
  const [draftBody, setDraftBody] = useState('')
  const [draftTo, setDraftTo] = useState('')
  const [draftSubject, setDraftSubject] = useState('')
  const [saving, setSaving] = useState(false)

  // Commentary (notes to the desk)
  const [commentary, setCommentary] = useState('')
  const [commentarySaved, setCommentarySaved] = useState<'idle' | 'saving' | 'saved'>('idle')
  const savedCommentary = useRef('')

  // Highlight → provenance
  const [highlight, setHighlight] = useState<string | null>(null)
  const [provenance, setProvenance] = useState<Provenance | null>(null)
  const [tracing, setTracing] = useState(false)
  const galleyRef = useRef<HTMLDivElement>(null)

  // The Redline: live tracked changes against the draft as originally staged.
  const [redline, setRedline] = useState<Change[]>([])
  const baselineAction = useRef<{ to?: string; subject?: string } | null>(null)

  // LinkedIn handoff: copy the draft, open their profile, confirm sent.
  const [linkedinFlow, setLinkedinFlow] = useState<'idle' | 'opened'>('idle')

  // Redirect: the targeting was wrong — spike this draft and re-run the
  // search with the reader's correction as binding instruction.
  const [redirecting, setRedirecting] = useState(false)
  const [correction, setCorrection] = useState('')
  const [redoNote, setRedoNote] = useState('')
  const redoPolls = useRef(0)

  const resetLearningState = (p: ProofRecord | null) => {
    setEditing(false)
    setLinkedinFlow('idle')
    setRedirecting(false)
    setCorrection('')
    setHighlight(null)
    setProvenance(null)
    setTracing(false)
    setCommentary(p?.commentary ?? '')
    savedCommentary.current = p?.commentary ?? ''
    setCommentarySaved('idle')
  }

  const fetchNext = useCallback(async () => {
    const focus = todoFocus.current
    todoFocus.current = null
    try {
      const res = await fetch(focus ? `/api/review?todo=${encodeURIComponent(focus)}` : '/api/review')
      const data = await res.json()
      const p = data?.proof ?? null
      setProof(p)
      setTotal(data?.total ?? 0)
      setLive(Boolean(data?.live))
      setTheLedger(data?.ledger ?? null)
      baselineAction.current = p?.action ? { to: p.action.to, subject: p.action.subject } : null
      setRedline([])
      resetLearningState(p)
    } catch {
      setProof(null)
      setTotal(0)
    }
    setLoaded(true)
    setEntering(true)
    setTimeout(() => setEntering(false), 30)
  }, [])

  useEffect(() => {
    fetchNext()
  }, [fetchNext])

  // Notes to the desk save quietly on blur; they file with the verdict.
  const saveCommentary = useCallback(async () => {
    if (!proof || !live || commentary === savedCommentary.current) return
    setCommentarySaved('saving')
    try {
      await fetch('/api/review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: proof.id, commentary }),
      })
      savedCommentary.current = commentary
      setCommentarySaved('saved')
    } catch {
      setCommentarySaved('idle')
    }
  }, [proof, live, commentary])

  const act = useCallback(
    async (action: 'approve' | 'hold' | 'spike') => {
      if (!proof || working || editing) return
      setNote('')
      if (!live) {
        setWorking(true)
        setTimeout(() => {
          setProof(null)
          setTotal((t) => Math.max(0, t - 1))
          setWorking(false)
        }, 250)
        return
      }
      setWorking(true)
      try {
        await saveCommentary()
        const res = await fetch('/api/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, id: proof.id }),
        })
        const data = await res.json()
        if (action === 'approve' && !data?.ok) {
          setNote(data?.error ?? 'That did not take. Try again.')
          setWorking(false)
          return
        }
        await fetchNext()
      } catch {
        setNote('Could not reach the desk. Try again.')
      }
      setWorking(false)
    },
    [proof, working, editing, live, fetchNext, saveCommentary]
  )

  // The right arrow signs the proof from the keyboard too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowRight') act('approve')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [act])

  // The redline recomputes as the pen moves — debounced just enough to feel
  // instant without thrashing on every keystroke.
  useEffect(() => {
    if (!proof) return
    const t = setTimeout(() => {
      const baseBody = proof.originalBody ?? proof.body
      const curBody = editing ? draftBody : proof.body
      const changes = redlineDiff(baseBody, curBody)
      const curTo = editing ? draftTo : proof.action?.to
      const curSubject = editing ? draftSubject : proof.action?.subject
      const base = baselineAction.current
      if (base?.to && curTo && curTo !== base.to)
        changes.push({ kind: 'envelope', label: 'Recipient', a: base.to, b: curTo })
      if (base?.subject && curSubject && curSubject !== base.subject)
        changes.push({ kind: 'envelope', label: 'Subject', a: base.subject, b: curSubject })
      setRedline(changes)
    }, 350)
    return () => clearTimeout(t)
  }, [proof, editing, draftBody, draftTo, draftSubject])

  // Highlight a passage → mark it yellow and ask the desk where it came from.
  const onGalleySelect = useCallback(() => {
    if (editing || !proof) return
    const sel = window.getSelection()
    const text = sel?.toString().replace(/\s+/g, ' ').trim() ?? ''
    if (text.length < 4 || text.length > 600) return
    if (!galleyRef.current || !sel?.anchorNode || !galleyRef.current.contains(sel.anchorNode)) return
    setHighlight(text)
    setProvenance(null)
    if (!live) {
      setProvenance({
        source: 'voice',
        explanation: 'The mocked edition cannot trace provenance — connect the backend and the desk will answer.',
      })
      return
    }
    setTracing(true)
    fetch('/api/review/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: proof.id, selection: text }),
    })
      .then((r) => r.json())
      .then((data) => {
        setProvenance(
          data?.explanation
            ? { source: data.source, explanation: data.explanation }
            : { source: 'unsupported', explanation: data?.error ?? 'The desk could not trace it.' }
        )
      })
      .catch(() => setProvenance({ source: 'unsupported', explanation: 'The desk could not trace it. Try again.' }))
      .finally(() => setTracing(false))
  }, [editing, proof, live])

  // The LinkedIn handoff: the draft goes to the clipboard, their profile
  // opens, and the reader sends it himself — then files it as sent here.
  const openLinkedIn = async () => {
    if (!proof) return
    try {
      await navigator.clipboard.writeText(proof.body)
    } catch {}
    const name = proof.title.replace(/reaching out/i, '').replace(/<>.*$/, '').replace(/[-·]/g, ' ').trim()
    const url =
      proof.linkedinUrl ||
      `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(name || proof.title)}`
    window.open(url, '_blank', 'noopener')
    setLinkedinFlow('opened')
  }

  const confirmLinkedIn = async () => {
    if (!proof || working) return
    if (!live) {
      setProof(null)
      setTotal((t) => Math.max(0, t - 1))
      return
    }
    setWorking(true)
    setNote('')
    try {
      await saveCommentary()
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_linkedin', id: proof.id }),
      })
      const data = await res.json()
      if (data?.ok) await fetchNext()
      else setNote(data?.error ?? 'That did not take. Try again.')
    } catch {
      setNote('Could not reach the desk. Try again.')
    }
    setWorking(false)
  }

  // Spike & close out: the draft dies and its to-do clears with it —
  // the whole errand is done, nothing re-runs.
  const submitCloseOut = async () => {
    if (!proof || working) return
    if (!live) {
      setProof(null)
      setTotal((t) => Math.max(0, t - 1))
      return
    }
    setWorking(true)
    setNote('')
    try {
      await saveCommentary()
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'spike_close', id: proof.id }),
      })
      const data = await res.json()
      if (data?.ok) await fetchNext()
      else setNote(data?.error ?? 'That did not take. Try again.')
    } catch {
      setNote('Could not reach the desk. Try again.')
    }
    setWorking(false)
  }

  const submitRedirect = async () => {
    if (!proof || !correction.trim() || working) return
    setWorking(true)
    setNote('')
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'redo', id: proof.id, correction: correction.trim() }),
      })
      const data = await res.json()
      if (data?.ok) {
        setRedoNote('Redirected. The desk is re-running the search — the corrected proof files here in a minute or two.')
        redoPolls.current = 0
        await fetchNext()
      } else {
        setNote(data?.error ?? 'The redirect did not take. Try again.')
      }
    } catch {
      setNote('Could not reach the desk. Try again.')
    }
    setWorking(false)
  }

  // While a redirect is in flight, watch the tray for the corrected proof.
  useEffect(() => {
    if (!redoNote) return
    const t = setInterval(async () => {
      redoPolls.current += 1
      if (redoPolls.current > 20) {
        setRedoNote('')
        clearInterval(t)
        return
      }
      await fetchNext()
    }, 12_000)
    return () => clearInterval(t)
  }, [redoNote, fetchNext])

  useEffect(() => {
    if (proof && redoNote) setRedoNote('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proof?.id])

  const beginEdit = () => {
    if (!proof) return
    setDraftBody(proof.body)
    setDraftTo(proof.action?.to ?? '')
    setDraftSubject(proof.action?.subject ?? proof.title)
    setHighlight(null)
    setProvenance(null)
    setEditing(true)
  }

  const saveEdit = async () => {
    if (!proof || saving || !draftBody.trim()) return
    if (!live) {
      setProof({ ...proof, body: draftBody, action: proof.action ? { ...proof.action, to: draftTo, subject: draftSubject } : null })
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, string> = { id: proof.id, body: draftBody }
      if (proof.kind === 'email') {
        payload.to = draftTo
        payload.subject = draftSubject
      }
      const res = await fetch('/api/review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data?.ok && data?.proof) {
        setProof(data.proof)
        setEditing(false)
      } else {
        setNote(data?.error ?? 'The amendment did not take. Try again.')
      }
    } catch {
      setNote('Could not reach the desk. Try again.')
    }
    setSaving(false)
  }

  // Multi-draft proofs: put one of the staged options on deck. Choosing
  // among the desk's own offerings is not an amendment.
  const [switching, setSwitching] = useState(false)
  const chooseVariant = async (index: number) => {
    if (!proof || switching || editing || index === proof.selectedVariant) return
    if (!live) {
      const v = proof.variants?.[index]
      if (!v) return
      setProof({
        ...proof,
        body: v.body,
        selectedVariant: index,
        action: proof.action ? { ...proof.action, subject: v.subject ?? proof.action.subject } : null,
      })
      return
    }
    setSwitching(true)
    setNote('')
    try {
      const res = await fetch('/api/review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: proof.id, selectVariant: index }),
      })
      const data = await res.json()
      if (data?.ok && data?.proof) {
        setProof(data.proof)
        baselineAction.current = data.proof.action
          ? { to: data.proof.action.to, subject: data.proof.action.subject }
          : null
        setRedline([])
      } else {
        setNote(data?.error ?? 'That did not take. Try again.')
      }
    } catch {
      setNote('Could not reach the desk. Try again.')
    }
    setSwitching(false)
  }

  if (!loaded) return null

  const ledgerLine =
    theLedger && theLedger.signed > 0 ? (
      <p className="eyebrow mt-4 text-faint">
        Straight through · {theLedger.straight} of 100 · streak {theLedger.streak}
        {theLedger.trailing30 !== null ? ` · last 30: ${theLedger.trailing30}%` : ''}
      </p>
    ) : null

  if (!proof) {
    return (
      <div className="pt-20 text-center">
        <p className="font-serif text-[19px] font-medium leading-snug tracking-tight">
          {redoNote ? 'Redirected.' : 'The tray is clear.'}
        </p>
        <p className={clsx('dek mt-3', redoNote && 'animate-pulse')}>
          {redoNote || 'Nothing awaits your signature. Drafted work files here as the desk produces it.'}
        </p>
        <div className="flex justify-center">{ledgerLine}</div>
      </div>
    )
  }

  const field =
    'w-full border-b border-hairline bg-transparent pb-1.5 font-serif text-[15px] text-ink placeholder:italic placeholder:text-faint focus:border-ink focus:outline-none'

  return (
    <div
      className={clsx(
        'transition-all duration-300 ease-editorial',
        entering ? 'translate-x-3 opacity-0' : 'translate-x-0 opacity-100'
      )}
    >
      {/* The proof on deck — headed by the Docket item it serves */}
      <header className="pt-7">
        <div className="flex items-baseline justify-between gap-4">
          <p className="eyebrow text-oxblood">{KIND_LABEL[proof.kind] ?? 'On Review'}</p>
          <p className="eyebrow text-faint">
            {total} in the tray · filed {proof.filedOn}
          </p>
        </div>
        {ledgerLine}
        {proof.todo && (
          <Link href="/todos" className="mt-3.5 block border-l border-oxblood pl-4">
            <p className="eyebrow">From the Docket</p>
            <p className="mt-1 font-serif text-[15px] italic leading-snug text-stone">
              {proof.todo.text}
            </p>
          </Link>
        )}
        <h2 className="mt-3.5 font-serif text-[26px] font-medium leading-[1.15] tracking-tight">
          {proof.title}
        </h2>
        {proof.summary && <p className="dek mt-2.5">{proof.summary}</p>}

        {/* The straight-through checks, as run at staging. All green is
            what a future auto-send would stand behind; a red line is a
            reason to read closely, not a bar to signing. */}
        {proof.stp && proof.stp.length > 0 && (
          <div className="mt-4 border border-hairline px-4 py-3">
            <div className="flex items-baseline justify-between gap-4">
              <p className="eyebrow text-oxblood">The Checks</p>
              <p className="eyebrow text-faint">
                {proof.stp.filter((c) => c.pass).length} of {proof.stp.length} passed
              </p>
            </div>
            <ul className="mt-2 space-y-1.5">
              {proof.stp.map((c) => (
                <li key={c.id}>
                  <p className={clsx('eyebrow', c.pass ? 'text-faint' : 'text-oxblood')}>
                    {c.pass ? '✓' : '✗'} {c.label}
                  </p>
                  <p className="mt-0.5 font-serif text-[13px] italic leading-snug text-stone">
                    {c.detail}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </header>

      {/* The Drafts — every staged option; tap one to put it on deck */}
      {proof.variants && proof.variants.length > 1 && (
        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-4">
            <p className="eyebrow text-oxblood">The Drafts</p>
            <p className="eyebrow text-faint">
              {proof.variants.length} on offer · the desk recommends the first
            </p>
          </div>
          <ul className="mt-1">
            {proof.variants.map((v, i) => {
              const onDeck = i === proof.selectedVariant
              return (
                <li key={i} className="rule first:border-t-0">
                  <button
                    onClick={() => chooseVariant(i)}
                    disabled={switching || editing}
                    className="block w-full py-3.5 text-left disabled:opacity-60"
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <p className={onDeck ? 'eyebrow-ink' : 'eyebrow text-faint'}>
                        {i + 1} · {v.label}
                        {i === 0 ? ' · recommended' : ''}
                      </p>
                      <p className={onDeck ? 'eyebrow shrink-0 text-oxblood' : 'eyebrow shrink-0 text-faint'}>
                        {onDeck ? 'on deck' : switching ? '…' : 'put on deck'}
                      </p>
                    </div>
                    <p
                      className={
                        onDeck
                          ? 'mt-1.5 font-serif text-[14px] italic leading-relaxed text-ink'
                          : 'mt-1.5 font-serif text-[14px] italic leading-relaxed text-stone'
                      }
                    >
                      {v.body.replace(/\s+/g, ' ').slice(0, 150)}…
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="eyebrow mt-1 text-faint">
            The galley below shows the draft on deck — switching is not an amendment
          </p>
        </div>
      )}

      {/* The galley — read it, mark it, or amend it */}
      {!editing ? (
        <>
          <div ref={galleyRef} onMouseUp={onGalleySelect} onTouchEnd={onGalleySelect} className="mt-6 border border-hairline p-5">
            {proof.kind === 'email' && proof.action?.to && (
              <div className="border-b border-hairline pb-3.5">
                <p className="eyebrow">To · {proof.action.to}</p>
                <p className="eyebrow mt-1.5">Subject · {proof.action.subject ?? proof.title}</p>
              </div>
            )}
            <div className={clsx('space-y-4', proof.kind === 'email' && proof.action?.to && 'pt-4')}>
              {proof.body.split('\n\n').map((para, i) => (
                <Para key={i} text={para} highlight={highlight} />
              ))}
            </div>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <p className="eyebrow text-faint">Highlight any line to ask where it came from</p>
            <button
              onClick={beginEdit}
              className="eyebrow-ink underline decoration-hairline underline-offset-4"
            >
              Amend the Draft
            </button>
          </div>

          {/* The provenance — where the highlighted language came from */}
          {(tracing || provenance) && highlight && (
            <div className="mt-4 border-l border-oxblood pl-4">
              <div className="flex items-baseline justify-between gap-4">
                <p className="eyebrow-ink">The Provenance</p>
                <button
                  onClick={() => {
                    setHighlight(null)
                    setProvenance(null)
                  }}
                  className="eyebrow text-faint underline decoration-hairline underline-offset-4"
                >
                  Clear
                </button>
              </div>
              {tracing ? (
                <p className="dek mt-2 animate-pulse">The desk is tracing it…</p>
              ) : (
                provenance && (
                  <>
                    <p className={clsx('eyebrow mt-2', provenance.source === 'unsupported' ? 'text-oxblood' : 'text-faint')}>
                      {SOURCE_LABEL[provenance.source] ?? provenance.source}
                    </p>
                    <p className="mt-1.5 font-serif text-[14px] italic leading-relaxed text-stone">
                      {provenance.explanation}
                    </p>
                  </>
                )
              )}
            </div>
          )}
        </>
      ) : (
        <div className="mt-6 border border-ink p-5">
          <p className="eyebrow text-oxblood">Amending the Draft</p>
          <div className="mt-4 space-y-4">
            {proof.kind === 'email' && (
              <div className="flex gap-4">
                <input value={draftTo} onChange={(e) => setDraftTo(e.target.value)} placeholder="To" className={field} />
                <input value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} placeholder="Subject" className={field} />
              </div>
            )}
            <textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              rows={Math.min(18, Math.max(8, draftBody.split('\n').length + 2))}
              className="w-full resize-none bg-transparent font-serif text-[15px] leading-relaxed text-ink focus:outline-none"
            />
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3.5">
            <button
              onClick={() => setEditing(false)}
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
      )}

      {proof.sourceUrl && (
        <p className="mt-4">
          <a
            href={proof.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="eyebrow-ink underline decoration-hairline underline-offset-4"
          >
            Open the working file →
          </a>
        </p>
      )}

      {/* The Redline — every change marked as it happens; each files as feedback */}
      {(redline.length > 0 || editing) && (
        <div className="mt-7">
          <div className="flex items-baseline justify-between gap-4">
            <p className="eyebrow text-oxblood">The Redline</p>
            {redline.length > 0 && (
              <p className="eyebrow text-faint">
                {redline.length} change{redline.length === 1 ? '' : 's'} marked
              </p>
            )}
          </div>
          {redline.length === 0 ? (
            <p className="dek mt-2 text-[13px]">No changes yet — the redline follows your pen.</p>
          ) : (
            <>
              <ul className="mt-1">
                {redline.map((c) => (
                  <RedlineEntry key={changeKey(c)}>
                    {c.kind === 'struck' && (
                      <>
                        <p className="eyebrow text-oxblood">Struck</p>
                        <p className="mt-1 font-serif text-[14px] leading-relaxed text-stone line-through decoration-hairline">
                          {c.a}
                        </p>
                      </>
                    )}
                    {c.kind === 'added' && (
                      <>
                        <p className="eyebrow">Added</p>
                        <p className="mt-1 font-serif text-[14px] leading-relaxed text-ink">{c.b}</p>
                      </>
                    )}
                    {c.kind === 'reworded' && (
                      <>
                        <p className="eyebrow">Reworded</p>
                        <p className="mt-1 font-serif text-[14px] leading-relaxed text-stone line-through decoration-hairline">
                          {c.a}
                        </p>
                        <p className="mt-1 font-serif text-[14px] leading-relaxed text-ink">{c.b}</p>
                      </>
                    )}
                    {c.kind === 'envelope' && (
                      <>
                        <p className="eyebrow">{c.label}</p>
                        <p className="mt-1 font-serif text-[14px] leading-relaxed">
                          <span className="text-stone line-through decoration-hairline">{c.a}</span>
                          <span className="text-faint"> → </span>
                          <span className="text-ink">{c.b}</span>
                        </p>
                      </>
                    )}
                  </RedlineEntry>
                ))}
              </ul>
              <p className="eyebrow mt-2 text-faint">The desk reads every mark as feedback</p>
            </>
          )}
        </div>
      )}

      {/* Notes to the desk — commentary the desk studies after the verdict */}
      <div className="mt-7">
        <div className="flex items-baseline justify-between gap-4">
          <p className="eyebrow-ink">Notes to the Desk</p>
          {commentarySaved === 'saved' && <p className="eyebrow text-faint">Noted</p>}
          {commentarySaved === 'saving' && <p className="eyebrow text-faint">Filing…</p>}
        </div>
        <textarea
          value={commentary}
          onChange={(e) => {
            setCommentary(e.target.value)
            setCommentarySaved('idle')
          }}
          onBlur={saveCommentary}
          rows={2}
          placeholder="What should the desk learn from this draft? Files with your verdict."
          className="mt-2 w-full resize-none border-b border-hairline bg-transparent pb-2 font-serif text-[14px] italic leading-relaxed text-ink placeholder:text-faint focus:border-ink focus:outline-none"
        />
      </div>

      {note && <p className="dek mt-5 text-oxblood">{note}</p>}

      {/* Redirect the desk — the targeting was wrong; correct it and re-run */}
      {redirecting && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submitRedirect()
          }}
          className="mt-6 border border-oxblood/60 p-5"
        >
          <p className="eyebrow text-oxblood">Redirect the Desk</p>
          <p className="dek mt-1.5 text-[13px]">
            Wrong company or wrong person? Say what the search got wrong — this draft is spiked
            and the desk re-runs from your correction. Or close the whole errand out: the draft
            is spiked and its to-do clears with it.
          </p>
          <textarea
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            rows={3}
            autoFocus
            placeholder={'e.g. Not Nebra Labs — I meant Nebex, the company behind the product NEBRA EXCHANGE.'}
            className="mt-3 w-full resize-none border-b border-hairline bg-transparent pb-2 font-serif text-[15px] leading-relaxed text-ink placeholder:italic placeholder:text-faint focus:border-ink focus:outline-none"
          />
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setRedirecting(false)}
              className="eyebrow text-faint underline decoration-hairline underline-offset-4"
            >
              Never Mind
            </button>
            <div className="flex items-center gap-5">
              <button
                type="button"
                onClick={submitCloseOut}
                disabled={working}
                title="Kill the draft AND clear its to-do — the errand is done, nothing re-runs"
                className="eyebrow text-faint underline decoration-hairline underline-offset-4 transition-colors hover:text-oxblood disabled:opacity-40"
              >
                {working ? 'Closing' : 'Spike & Close Out'}
              </button>
              <button
                type="submit"
                disabled={working || !correction.trim()}
                className="eyebrow-ink underline decoration-hairline underline-offset-4 disabled:opacity-40"
              >
                {working ? 'Redirecting' : 'Spike & Re-run'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* The verdict line: quiet outs on the left, the signature on the right */}
      <div className="flex items-center justify-between pb-6 pt-8">
        <div className="flex gap-5">
          <button
            onClick={() => act('hold')}
            className="eyebrow text-faint underline decoration-hairline underline-offset-4"
            title="Not now — back of the queue"
          >
            Hold
          </button>
          <button
            onClick={() => act('spike')}
            className="eyebrow text-faint underline decoration-hairline underline-offset-4"
            title="Kill it — never runs"
          >
            Spike
          </button>
          {live && !redirecting && (
            <button
              onClick={() => setRedirecting(true)}
              className="eyebrow text-faint underline decoration-hairline underline-offset-4"
              title="Wrong target — correct the search and re-run"
            >
              Redirect
            </button>
          )}
        </div>
        <div className="flex flex-col items-center gap-2.5">
          <button
            onClick={() => act('approve')}
            disabled={working || editing || (proof.kind === 'email' && !proof.action?.to)}
            aria-label={
              proof.actionType === 'send_email' ? 'Approve — sends the email — and next' : 'Approve and next'
            }
            title={
              proof.kind === 'email' && !proof.action?.to
                ? 'No email address — this one goes out over LinkedIn'
                : undefined
            }
            className="flex h-14 w-14 items-center justify-center rounded-full border border-ink font-serif text-[22px] leading-none text-ink transition-colors duration-300 ease-editorial hover:bg-ink hover:text-paper disabled:opacity-40"
          >
            {working ? '·' : '→'}
          </button>
          {proof.kind === 'email' && (
            <button
              onClick={openLinkedIn}
              disabled={working || editing}
              aria-label="Send over LinkedIn instead — copies the draft and opens their profile"
              title="Send over LinkedIn — copies the draft and opens their profile"
              className={clsx(
                'flex h-10 w-10 items-center justify-center rounded-full border font-serif text-[14px] italic leading-none transition-colors duration-300 ease-editorial disabled:opacity-40',
                !proof.action?.to
                  ? 'border-ink text-ink hover:bg-ink hover:text-paper'
                  : 'border-stone/60 text-stone hover:border-ink hover:text-ink'
              )}
            >
              in
            </button>
          )}
        </div>
      </div>

      {linkedinFlow === 'opened' && proof.kind === 'email' && (
        <div className="mb-2 border-l border-oxblood pl-4 pb-2">
          <p className="eyebrow-ink">Over LinkedIn</p>
          <p className="dek mt-1 text-[13px]">
            The draft is on your clipboard and their {proof.linkedinUrl ? 'profile' : 'search'} is open —
            paste it into a message there. Sent it?
          </p>
          <button
            onClick={confirmLinkedIn}
            disabled={working}
            className="eyebrow-ink mt-2 underline decoration-hairline underline-offset-4 disabled:opacity-40"
          >
            {working ? 'Filing' : 'File it as sent'}
          </button>
        </div>
      )}

      <p className="eyebrow pb-10 text-center text-faint">
        {proof.kind === 'email' && !proof.action?.to
          ? 'No email address was found — the in badge sends it over LinkedIn'
          : proof.actionType === 'send_email'
            ? `The arrow signs it — the email sends${proof.todo ? ', its to-do clears' : ''}, the next proof follows`
            : `The arrow signs it — approved to the record${proof.todo ? ', its to-do clears' : ''}, the next proof follows`}
      </p>

      {/* The Dossier — who you are writing to, at the foot of the page */}
      {proof.dossier && (
        <section className="border-t border-hairline pb-2 pt-7">
          <p className="eyebrow text-oxblood">The Dossier</p>
          <p className="dek mt-1.5 text-[13px]">
            Who you are writing to — assembled by the desk from the research behind this draft.
          </p>
          <div className="mt-4 space-y-3.5">
            {proof.dossier.split(/\n\n+/).map((line, i) => (
              <p key={i} className="whitespace-pre-line font-serif text-[15px] leading-relaxed text-ink">
                {line}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* The Storefront — their site, photographed below the dossier */}
      {proof.websiteUrl && (
        <section className={clsx('pb-12', proof.dossier ? 'pt-7' : 'border-t border-hairline pt-7')}>
          <div className="flex items-baseline justify-between gap-4">
            <p className="eyebrow-ink">The Storefront</p>
            <a
              href={proof.websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="eyebrow text-faint underline decoration-hairline underline-offset-4"
            >
              Visit the site →
            </a>
          </div>
          <SiteShot url={proof.websiteUrl} />
        </section>
      )}
    </div>
  )
}
