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
  authored?: boolean
}

type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

export default function SkillsEditor() {
  const [skills, setSkills] = useState<SkillView[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [state, setState] = useState<Record<string, SaveState>>({})
  const [live, setLive] = useState(true)
  const [loaded, setLoaded] = useState(false)

  // Authoring a new skill of the reader's own.
  const [newLabel, setNewLabel] = useState('')
  const [newWhen, setNewWhen] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [creating, setCreating] = useState<SaveState>('idle')

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

  const create = async () => {
    const label = newLabel.trim()
    const prompt = newPrompt.trim()
    if (!label || !prompt) return
    setCreating('saving')
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ create: true, label, whenToUse: newWhen.trim(), prompt }),
      })
      const data = await res.json()
      if (data?.ok && data?.skill) {
        const view: SkillView = {
          id: data.skill.id,
          label: data.skill.label,
          description: `Your own playbook. Apollo reaches for it ${data.skill.whenToUse || 'when you tell it to'}.`,
          whenToUse: data.skill.whenToUse,
          prompt: data.skill.systemPrompt,
          defaultPrompt: data.skill.systemPrompt,
          isCustom: true,
          authored: true,
        }
        setSkills((prev) => [...prev, view])
        setDrafts((prev) => ({ ...prev, [view.id]: view.prompt }))
        setNewLabel('')
        setNewWhen('')
        setNewPrompt('')
        setCreating('saved')
      } else {
        setCreating('failed')
      }
    } catch {
      setCreating('failed')
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Retire this skill? Apollo stops reaching for it immediately.')) return
    setOne(id, 'saving')
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, remove: true }),
      })
      const data = await res.json()
      if (data?.ok) {
        setSkills((prev) => prev.filter((s) => s.id !== id))
      } else {
        setOne(id, 'failed')
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
              <span className={skill.authored ? 'eyebrow shrink-0 text-oxblood' : 'eyebrow shrink-0 text-faint'}>
                {skill.authored ? 'Yours' : skill.isCustom ? 'Edited' : 'Default'}
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
              {skill.authored ? (
                <button
                  type="button"
                  onClick={() => remove(skill.id)}
                  disabled={s === 'saving'}
                  className="shrink-0 px-4 py-3 font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-faint underline decoration-hairline underline-offset-4 transition-colors hover:text-oxblood disabled:opacity-40 disabled:no-underline"
                >
                  Retire the Skill
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => reset(skill.id)}
                  disabled={s === 'saving' || !skill.isCustom}
                  className="shrink-0 px-4 py-3 font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-faint underline decoration-hairline underline-offset-4 transition-colors hover:text-ink disabled:opacity-40 disabled:no-underline"
                >
                  Restore Default
                </button>
              )}
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

      {/* Author a new skill — a playbook of the reader's own devising */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
        className="mt-12 border border-hairline p-5 focus-within:border-ink"
      >
        <p className="eyebrow text-oxblood">Author a New Skill</p>
        <p className="dek mt-1.5 text-[13px]">
          A playbook of your own. Say when it applies, and the desk reaches for it on its own —
          file a matching to-do and the draft arrives in The Proofs already in this voice.
        </p>

        <div className="mt-5 space-y-5">
          <div>
            <label className="eyebrow-ink" htmlFor="new-skill-label">
              The Name
            </label>
            <input
              id="new-skill-label"
              value={newLabel}
              onChange={(e) => {
                setNewLabel(e.target.value)
                setCreating('idle')
              }}
              placeholder="e.g. Podcast invite"
              className="mt-2 w-full border-b border-hairline bg-transparent pb-1.5 font-serif text-[16px] text-ink placeholder:italic placeholder:text-faint focus:border-ink focus:outline-none"
            />
          </div>
          <div>
            <label className="eyebrow-ink" htmlFor="new-skill-when">
              When the Desk Should Reach for It
            </label>
            <input
              id="new-skill-when"
              value={newWhen}
              onChange={(e) => {
                setNewWhen(e.target.value)
                setCreating('idle')
              }}
              placeholder="e.g. when a to-do asks to invite someone onto the podcast"
              className="mt-2 w-full border-b border-hairline bg-transparent pb-1.5 font-serif text-[15px] text-ink placeholder:italic placeholder:text-faint focus:border-ink focus:outline-none"
            />
          </div>
          <div>
            <label className="eyebrow-ink" htmlFor="new-skill-prompt">
              The Playbook
            </label>
            <p className="dek mt-1 text-[13px]">
              How the draft should read — tone, structure, the ask, what never to say. Write it as
              instructions to the writer.
            </p>
            <textarea
              id="new-skill-prompt"
              value={newPrompt}
              onChange={(e) => {
                setNewPrompt(e.target.value)
                setCreating('idle')
              }}
              spellCheck={false}
              rows={10}
              placeholder={
                'You are drafting a short, warm cold email inviting a guest onto my podcast…\n\n- Two short paragraphs at most\n- Name one specific thing of theirs the invitation hangs on\n- The ask: a 45-minute recorded conversation, remote\n- No flattery pile-ups, no exclamation marks'
              }
              className="mt-3 w-full resize-y border border-hairline bg-transparent p-3 font-mono text-[12px] leading-relaxed text-ink placeholder:text-faint focus:border-ink focus:outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={creating === 'saving' || !newLabel.trim() || !newPrompt.trim()}
          className="mt-6 w-full border border-ink py-3.5 font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-ink transition-colors duration-300 ease-editorial hover:bg-ink hover:text-paper disabled:opacity-40"
        >
          {creating === 'saving' ? 'One moment' : 'File the Skill'}
        </button>

        {creating === 'saved' && (
          <p className="dek mt-4 text-center text-[13px]">
            Filed. The desk knows it now — a matching to-do drafts with it automatically.
          </p>
        )}
        {creating === 'failed' && (
          <p className="dek mt-4 text-center text-[13px] text-oxblood">
            That did not take{live ? '.' : ' — the backend is not connected.'}
          </p>
        )}
      </form>
    </section>
  )
}
