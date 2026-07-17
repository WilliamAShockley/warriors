'use client'

import Link from 'next/link'
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

  const resetLearningState = (p: ProofRecord | null) => {
    setEditing(false)
    setHighlight(null)
    setProvenance(null)
    setTracing(false)
    setCommentary(p?.commentary ?? '')
    savedCommentary.current = p?.commentary ?? ''
    setCommentarySaved('idle')
  }

  const fetchNext = useCallback(async () => {
    try {
      const res = await fetch('/api/review')
      const data = await res.json()
      const p = data?.proof ?? null
      setProof(p)
      setTotal(data?.total ?? 0)
      setLive(Boolean(data?.live))
      setTheLedger(data?.ledger ?? null)
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
          The tray is clear.
        </p>
        <p className="dek mt-3">
          Nothing awaits your signature. Drafted work files here as the desk produces it.
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
      </header>

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
        </div>
        <button
          onClick={() => act('approve')}
          disabled={working || editing}
          aria-label={
            proof.actionType === 'send_email' ? 'Approve — sends the email — and next' : 'Approve and next'
          }
          className="flex h-14 w-14 items-center justify-center rounded-full border border-ink font-serif text-[22px] leading-none text-ink transition-colors duration-300 ease-editorial hover:bg-ink hover:text-paper disabled:opacity-40"
        >
          {working ? '·' : '→'}
        </button>
      </div>

      <p className="eyebrow pb-10 text-center text-faint">
        {proof.actionType === 'send_email'
          ? `The arrow signs it — the email sends${proof.todo ? ', its to-do clears' : ''}, the next proof follows`
          : `The arrow signs it — approved to the record${proof.todo ? ', its to-do clears' : ''}, the next proof follows`}
      </p>
    </div>
  )
}
