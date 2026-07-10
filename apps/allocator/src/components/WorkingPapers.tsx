'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import clsx from 'clsx'

type Step = { t: string; kind: 'tool' | 'search' | 'write' | 'note'; name: string; detail: string }
type Briefing = { title: string; dateline: string; sections: { label: string; body: string }[] }
type Task = {
  id: string
  ask: string
  status: 'received' | 'working' | 'done' | 'failed'
  planNote: string | null
  steps: Step[]
  result: Briefing | null
  verdict: string | null
  feedbackNote: string | null
}

export default function WorkingPapers({ id }: { id: string }) {
  const [task, setTask] = useState<Task | null>(null)
  const [missing, setMissing] = useState(false)
  const [note, setNote] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    let stopped = false
    const load = async () => {
      try {
        const res = await fetch(`/api/apollo/${id}`)
        if (res.status === 404) {
          setMissing(true)
          return false
        }
        if (!res.ok) return true
        const data: Task = await res.json()
        if (!stopped) setTask(data)
        return data.status === 'working' || data.status === 'received'
      } catch {
        return true
      }
    }
    load().then((busy) => {
      if (!busy) return
      const timer = setInterval(async () => {
        const stillBusy = await load()
        if (!stillBusy) clearInterval(timer)
      }, 3000)
    })
    return () => {
      stopped = true
    }
  }, [id])

  const sendVerdict = async (verdict: 'good' | 'needs-work') => {
    setSent(true)
    try {
      await fetch(`/api/apollo/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict, note: note.trim() || null }),
      })
      setTask((prev) => (prev ? { ...prev, verdict } : prev))
    } catch {}
  }

  if (missing) {
    return <p className="dek pt-10">Nothing filed under that reference.</p>
  }
  if (!task) {
    return <p className="dek pt-10 animate-pulse">Pulling the working papers…</p>
  }

  const working = task.status === 'working' || task.status === 'received'

  return (
    <>
      <header className="pt-6">
        <p className="eyebrow text-oxblood">Working Papers</p>
        <h1 className="mt-2 font-serif text-[24px] font-medium leading-[1.2] tracking-tight">
          {task.ask}
        </h1>
        {task.planNote && <p className="dek mt-3">{task.planNote}</p>}
        <p className={clsx('eyebrow mt-3', working && 'animate-pulse text-oxblood')}>
          {working ? 'Apollo is working' : task.status === 'failed' ? 'The run failed' : 'Filed'}
        </p>
      </header>

      {task.steps.length > 0 && (
        <>
          <div className="rule mt-6" />
          <section className="pt-6">
            <p className="eyebrow-ink">The Steps</p>
            <ul className="mt-1">
              {task.steps.map((s, i) => (
                <li key={i} className="rule flex items-baseline gap-4 py-3 first:border-t-0">
                  <span className="eyebrow shrink-0 text-faint">{s.t}</span>
                  <span className="min-w-0">
                    <span className={clsx('eyebrow', s.kind === 'write' ? 'text-oxblood' : 'text-stone')}>
                      {s.name}
                    </span>
                    <span className="mt-0.5 block truncate font-serif text-[14px] italic text-stone">
                      {s.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {task.result && (
        <>
          <div className="rule mt-6" />
          <article className="pt-7">
            <h2 className="font-serif text-[24px] font-medium leading-tight tracking-tight">
              {task.result.title}
            </h2>
            <p className="eyebrow mt-2">{task.result.dateline}</p>
            <div className="mt-5 space-y-5">
              {task.result.sections.map((s) => (
                <section key={s.label}>
                  <p className="eyebrow-ink mb-1.5">{s.label}</p>
                  <p className="body-copy">{s.body}</p>
                </section>
              ))}
            </div>
          </article>
        </>
      )}

      {/* The verdict — the reward signal Apollo learns from */}
      {!working && !task.verdict && task.id !== 'example' && (
        <section className="pb-6 pt-9">
          <div className="rule mb-6" />
          <p className="eyebrow-ink">The Verdict</p>
          <p className="dek mt-1.5 text-[13px]">Apollo learns from this. Be honest.</p>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional — one line on what to keep or change"
            className="mt-4 w-full border-b border-hairline bg-transparent pb-2 font-serif text-[15px] italic text-ink placeholder:text-faint focus:outline-none"
          />
          <div className="mt-5 flex gap-3">
            <button
              onClick={() => sendVerdict('good')}
              disabled={sent}
              className="flex-1 border border-ink py-3 font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-ink transition-colors duration-300 ease-editorial hover:bg-ink hover:text-paper disabled:opacity-40"
            >
              Good Work
            </button>
            <button
              onClick={() => sendVerdict('needs-work')}
              disabled={sent}
              className="flex-1 border border-hairline py-3 font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-stone transition-colors duration-300 ease-editorial hover:border-ink hover:text-ink disabled:opacity-40"
            >
              Needs Another Pass
            </button>
          </div>
        </section>
      )}

      {task.verdict && (
        <p className="eyebrow pb-6 pt-8 text-center text-faint">
          Verdict filed · {task.verdict === 'good' ? 'good work' : 'needs another pass'} · Apollo takes the lesson
        </p>
      )}
    </>
  )
}
