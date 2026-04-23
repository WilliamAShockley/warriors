'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

const SECTIONS = [
  { value: 'targets', label: 'Targets' },
  { value: 'research', label: 'Research' },
  { value: 'news', label: 'News' },
  { value: 'global', label: 'Global' },
]

const MODELS = [
  { value: 'claude-opus-4-6', label: 'Claude Opus (best quality)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku (faster)' },
]

const VARIABLES = [
  { key: '{{name}}', desc: "Contact's name" },
  { key: '{{company}}', desc: 'Company name' },
  { key: '{{stage}}', desc: 'Deal stage' },
  { key: '{{notes}}', desc: 'Your notes' },
  { key: '{{last_contact}}', desc: 'Last contacted date' },
  { key: '{{activities}}', desc: 'Full activity log' },
  { key: '{{brief}}', desc: 'Research brief' },
  { key: '{{news}}', desc: 'Recent news headlines' },
]

type Skill = {
  id?: string
  name: string
  description: string
  prompt: string
  section: string
  model: string
}

type Props = {
  skill?: Skill
  onClose: () => void
  onSaved: () => void
}

export default function SkillModal({ skill, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Skill>({
    name: skill?.name ?? '',
    description: skill?.description ?? '',
    prompt: skill?.prompt ?? '',
    section: skill?.section ?? 'targets',
    model: skill?.model ?? 'claude-opus-4-6',
  })
  const [loading, setLoading] = useState(false)

  function set(key: keyof Skill, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function insertVariable(variable: string) {
    set('prompt', form.prompt + variable)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.prompt) return
    setLoading(true)

    if (skill?.id) {
      await fetch(`/api/skills/${skill.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
    } else {
      await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#E8E7E3] flex-shrink-0">
          <h2 className="font-semibold text-[#1A1A1A]">{skill?.id ? 'Edit Skill' : 'New Skill'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
            <X size={16} className="text-[#888884]" />
          </button>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="text-xs text-[#888884] block mb-1">Name *</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              required
              className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] transition-colors"
              placeholder="Meeting Prep"
            />
          </div>

          <div>
            <label className="text-xs text-[#888884] block mb-1">Description</label>
            <input
              value={form.description}
              onChange={e => set('description', e.target.value)}
              className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] transition-colors"
              placeholder="Generates a pre-read before a meeting"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#888884] block mb-1">Section</label>
              <select
                value={form.section}
                onChange={e => set('section', e.target.value)}
                className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] bg-white transition-colors"
              >
                {SECTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#888884] block mb-1">Model</label>
              <select
                value={form.model}
                onChange={e => set('model', e.target.value)}
                className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] bg-white transition-colors"
              >
                {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-[#888884]">Prompt *</label>
              <div className="flex items-center gap-1 flex-wrap justify-end">
                {VARIABLES.map(v => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    title={v.desc}
                    className="text-xs text-[#888884] bg-[#F0EFE9] hover:bg-[#E8E7E3] px-1.5 py-0.5 rounded font-mono transition-colors"
                  >
                    {v.key}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={form.prompt}
              onChange={e => set('prompt', e.target.value)}
              required
              rows={8}
              className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] transition-colors resize-none font-mono leading-relaxed"
              placeholder="You are a VC analyst. Write a meeting prep document for {{name}} at {{company}}...&#10;&#10;Activity log:&#10;{{activities}}&#10;&#10;Recent news:&#10;{{news}}"
            />
            <p className="text-xs text-[#B0AFAB] mt-1">Click a variable above to insert it. Variables are replaced with live data when the skill runs.</p>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-sm py-2 rounded-lg border border-[#E8E7E3] text-[#888884] hover:border-[#C8C7C3] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !form.name || !form.prompt}
              className="flex-1 text-sm py-2 rounded-lg bg-[#1A1A1A] text-white hover:bg-[#333] disabled:opacity-40 transition-colors"
            >
              {loading ? 'Saving...' : skill?.id ? 'Save Changes' : 'Create Skill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
