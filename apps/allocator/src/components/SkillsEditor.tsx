'use client'

import { useEffect, useState } from 'react'

type SkillView = {
  id: string
  label: string
  description: string
  whenToUse: string
  prompt: string
  defaultPrompt: string
  isCustom: boolean
}

type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

export default function SkillsEditor() {
  const [skills, setSkills] = useState<SkillView[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [state, setState] = useState<Record<string, SaveState>>({})
  const [live, setLive] = useState(true)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/skills')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return
        setLive(Boolean(data.live))
        setSkills(data.skills ?? [])
        setDrafts(Object.fromEntries((data.skills ?? []).map((s: SkillView) => [s.id, s.prompt])))
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const setOne = (id: string, s: SaveState) => setState((prev) => ({ ...prev, [id]: s }))

  const save = async (id: string) => {
    const prompt = (drafts[id] ?? '').trim()
    if (!prompt) return
    setOne(id, 'saving')
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, prompt }),
      })
      const data = await res.json()
      setOne(id, data?.ok ? 'saved' : 'failed')
      if (data?.ok) {
        setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, prompt, isCustom: true } : s)))
      }
    } catch {
      setOne(id, 'failed')
    }
  }

  const reset = async (id: string) => {
    setOne(id, 'saving')
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, reset: true }),
      })
      const data = await res.json()
      if (data?.ok) {
        const def = skills.find((s) => s.id === id)?.defaultPrompt ?? ''
        setDrafts((prev) => ({ ...prev, [id]: def }))
        setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, prompt: def, isCustom: false } : s)))
        setOne(id, 'saved')
      } else {
        setOne(id, 'failed')
      }
    } catch {
      setOne(id, 'failed')
    }
  }

  if (loaded && skills.length === 0) return null

  return (
    <section className="pt-12">
      <p className="eyebrow-ink">Apollo Skills</p>
      <p className="dek mt-1.5 text-[13px]">
        The system prompts behind Apollo’s drafting playbooks. Edit one and the next draft follows it.
      </p>

      {skills.map((skill) => {
        const s = state[skill.id] ?? 'idle'
        const dirty = (drafts[skill.id] ?? '') !== skill.prompt
        return (
          <div key={skill.id} className="pt-8">
            <div className="flex items-baseline justify-between gap-3">
              <label className="font-serif text-[18px] text-ink" htmlFor={`skill-${skill.id}`}>
                {skill.label}
              </label>
              <span className="eyebrow shrink-0 text-faint">
                {skill.isCustom ? 'Edited' : 'Default'}
              </span>
            </div>
            <p className="dek mt-1.5 text-[13px]">{skill.description}</p>

            <textarea
              id={`skill-${skill.id}`}
              value={drafts[skill.id] ?? ''}
              onChange={(e) => {
                setDrafts((prev) => ({ ...prev, [skill.id]: e.target.value }))
                setOne(skill.id, 'idle')
              }}
              spellCheck={false}
              rows={16}
              className="mt-4 w-full resize-y border border-hairline bg-transparent p-3 font-mono text-[12px] leading-relaxed text-ink focus:border-ink focus:outline-none"
            />

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => save(skill.id)}
                disabled={s === 'saving' || !dirty || !(drafts[skill.id] ?? '').trim()}
                className="flex-1 border border-ink py-3 font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-ink transition-colors duration-300 ease-editorial hover:bg-ink hover:text-paper disabled:opacity-40"
              >
                {s === 'saving' ? 'One moment' : 'Save the Prompt'}
              </button>
              <button
                type="button"
                onClick={() => reset(skill.id)}
                disabled={s === 'saving' || !skill.isCustom}
                className="shrink-0 px-4 py-3 font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-faint underline decoration-hairline underline-offset-4 transition-colors hover:text-ink disabled:opacity-40 disabled:no-underline"
              >
                Restore Default
              </button>
            </div>

            {s === 'saved' && (
              <p className="dek mt-3 text-[13px]">Set down. The next draft carries it.</p>
            )}
            {s === 'failed' && (
              <p className="dek mt-3 text-[13px] text-oxblood">
                That did not take{live ? '.' : ' — the backend is not connected.'}
              </p>
            )}
          </div>
        )
      })}
    </section>
  )
}
