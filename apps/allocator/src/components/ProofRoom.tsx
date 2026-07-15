'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import type { ProofRecord } from '@/lib/review'

// The Proofs: one page on the desk at a time. The arrow signs it — approval
// executes the attached action (an email actually sends) and the next proof
// slides in. Hold sends it to the back of the queue; Spike kills it.

const KIND_LABEL: Record<string, string> = {
  email: 'An Email, Drafted',
  post: 'A Post, Drafted',
  analysis: 'An Analysis, Prepared',
}

export default function ProofRoom() {
  const [proof, setProof] = useState<ProofRecord | null>(null)
  const [total, setTotal] = useState(0)
  const [live, setLive] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [working, setWorking] = useState(false)
  const [entering, setEntering] = useState(true)
  const [note, setNote] = useState('')

  const fetchNext = useCallback(async () => {
    try {
      const res = await fetch('/api/review')
      const data = await res.json()
      setProof(data?.proof ?? null)
      setTotal(data?.total ?? 0)
      setLive(Boolean(data?.live))
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

  const act = useCallback(
    async (action: 'approve' | 'hold' | 'spike') => {
      if (!proof || working) return
      setNote('')
      if (!live) {
        // Mock mode: the motion without the consequence.
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
    [proof, working, live, fetchNext]
  )

  // The right arrow signs the proof from the keyboard too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && !(e.target instanceof HTMLInputElement)) act('approve')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [act])

  if (!loaded) return null

  if (!proof) {
    return (
      <div className="pt-20 text-center">
        <p className="font-serif text-[19px] font-medium leading-snug tracking-tight">
          The tray is clear.
        </p>
        <p className="dek mt-3">
          Nothing awaits your signature. Drafted work files here as the desk produces it.
        </p>
      </div>
    )
  }

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

      {/* The galley */}
      <div className="mt-6 border border-hairline p-5">
        {proof.kind === 'email' && proof.action?.to && (
          <div className="border-b border-hairline pb-3.5">
            <p className="eyebrow">To · {proof.action.to}</p>
            <p className="eyebrow mt-1.5">Subject · {proof.action.subject ?? proof.title}</p>
          </div>
        )}
        <div className={clsx('space-y-4', proof.kind === 'email' && proof.action?.to && 'pt-4')}>
          {proof.body.split('\n\n').map((para, i) => (
            <p key={i} className="body-copy whitespace-pre-line">
              {para}
            </p>
          ))}
        </div>
      </div>

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

      {note && <p className="dek mt-5 text-oxblood">{note}</p>}

      {/* The verdict line: quiet outs on the left, the signature on the right */}
      <div className="flex items-center justify-between pb-6 pt-9">
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
          disabled={working}
          aria-label={
            proof.actionType === 'send_email' ? 'Approve — sends the email — and next' : 'Approve and next'
          }
          className="flex h-14 w-14 items-center justify-center rounded-full border border-ink font-serif text-[22px] leading-none text-ink transition-colors duration-300 ease-editorial hover:bg-ink hover:text-paper disabled:opacity-40"
        >
          {working ? '·' : '→'}
        </button>
      </div>

      <p className="eyebrow pb-6 text-center text-faint">
        {proof.actionType === 'send_email'
          ? `The arrow signs it — the email sends${proof.todo ? ', its to-do clears' : ''}, the next proof follows`
          : `The arrow signs it — approved to the record${proof.todo ? ', its to-do clears' : ''}, the next proof follows`}
      </p>
    </div>
  )
}
