'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import type { InterviewTurn } from '@/lib/theses'

type DraftThesis = { name: string; chip: string; stance: string; summary: string; charter: string }

const OPENING = 'Name the theme — a line or a phrase is enough.'

export default function ThesisInterview() {
  const router = useRouter()
  const [turns, setTurns] = useState<InterviewTurn[]>([{ role: 'desk', text: OPENING }])
  const [input, setInput] = useState('')
  const [working, setWorking] = useState(false)
  const [thesis, setThesis] = useState<DraftThesis | null>(null)
  const [filing, setFiling] = useState(false)
  const [note, setNote] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const questionCount = turns.filter((t) => t.role === 'desk').length

  const answer = async () => {
    const text = input.trim()
    if (!text || working || thesis) return
    setInput('')
    const next: InterviewTurn[] = [...turns, { role: 'reader', text }]
    setTurns(next)
    setWorking(true)
    try {
      const res = await fetch('/api/theses/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turns: next }),
      })
      const data = await res.json()
      if (data?.done && data?.thesis) {
        setThesis(data.thesis)
      } else if (data?.question) {
        setTurns((prev) => [...prev, { role: 'desk', text: data.question }])
      } else {
        setNote('The desk lost its thread. Answer again, or start over.')
      }
    } catch {
      setNote('The desk is unreachable. Try again in a moment.')
    }
    setWorking(false)
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 80)
  }

  const file = async () => {
    if (!thesis || filing) return
    setFiling(true)
    try {
      const res = await fetch('/api/theses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thesis }),
      })
      const data = await res.json()
      if (data?.ok && data?.thesis?.slug) {
        router.push(`/research/${data.thesis.slug}`)
        return
      }
      setNote('Filed nowhere — the prototype needs its database connected to keep a thesis.')
    } catch {
      setNote('Could not file it. Try again.')
    }
    setFiling(false)
  }

  return (
    <div className="pt-6">
      {turns.map((t, i) =>
        t.role === 'desk' ? (
          <div key={i} className="pt-5">
            <p className="eyebrow-ink">
              The Desk {questionCount > 1 && i > 0 ? `· Question ${turns.slice(0, i + 1).filter((x) => x.role === 'desk').length}` : ''}
            </p>
            <p className="mt-2 font-serif text-[19px] font-medium leading-snug tracking-tight">
              {t.text}
            </p>
          </div>
        ) : (
          <p key={i} className="dek mt-4 border-l border-hairline pl-4">
            {t.text}
          </p>
        )
      )}

      {working && <p className="dek mt-6 animate-pulse">The desk is thinking about what to ask…</p>}
      {note && <p className="dek mt-6 text-oxblood">{note}</p>}

      {thesis && (
        <div className="mt-8 border border-hairline p-5">
          <p className="eyebrow text-oxblood">The Charter, Drafted</p>
          <h2 className="mt-3 font-serif text-[24px] font-medium leading-tight tracking-tight">
            {thesis.name}
          </h2>
          <p className="dek mt-3">{thesis.stance}</p>
          <div className="mt-4 space-y-3">
            {thesis.summary.split('\n\n').map((p, i) => (
              <p key={i} className="body-copy">
                {p}
              </p>
            ))}
          </div>
          <p className="eyebrow-ink mt-5">The Standing Instruction</p>
          <p className="mt-2 font-serif text-[14px] italic leading-relaxed text-stone">
            {thesis.charter}
          </p>
          <button
            onClick={file}
            disabled={filing}
            className="mt-6 w-full border border-ink py-3.5 font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-ink transition-colors duration-300 ease-editorial hover:bg-ink hover:text-paper disabled:opacity-40"
          >
            {filing ? 'Filing' : 'File the Thesis'}
          </button>
        </div>
      )}

      {!thesis && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            answer()
          }}
          className="mt-8 border-t border-ink pt-4"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Answer in your own words — dictation works."
            className="w-full resize-none bg-transparent font-serif text-[16px] italic leading-relaxed text-ink placeholder:text-faint focus:outline-none"
          />
          <div className="flex justify-end pb-2">
            <button type="submit" className="eyebrow-ink underline decoration-hairline underline-offset-4">
              Answer
            </button>
          </div>
        </form>
      )}

      <div ref={endRef} />
    </div>
  )
}
