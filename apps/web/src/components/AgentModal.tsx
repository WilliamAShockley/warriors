'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

const TRIGGER_TYPES = [
  { value: 'manual', label: 'Manual' },
  { value: 'continuous', label: 'Continuous (every cron tick)' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'event', label: 'Event-triggered' },
]

const INTERVALS = [
  { value: 86400, label: 'Daily' },
  { value: 604800, label: 'Weekly' },
  { value: 2592000, label: 'Monthly' },
]

const EVENT_TYPES = [
  { value: 'target.created', label: 'Target created' },
  { value: 'stage.changed', label: 'Stage changed' },
  { value: 'activity.logged', label: 'Activity logged' },
]

const SCOPES = [
  { value: 'global', label: 'Global (runs once)' },
  { value: 'target', label: 'Target (runs per target)' },
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

type Agent = {
  id?: string
  name: string
  description: string
  prompt: string
  triggerType: string
  intervalSeconds: number | null
  eventType: string | null
  scope: string
  model: string
  enabled: boolean
}

type Props = {
  agent?: Agent
  onClose: () => void
  onSaved: () => void
}

export default function AgentModal({ agent, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Agent>({
    name: agent?.name ?? '',
    description: agent?.description ?? '',
    prompt: agent?.prompt ?? '',
    triggerType: agent?.triggerType ?? 'manual',
    intervalSeconds: agent?.intervalSeconds ?? null,
    eventType: agent?.eventType ?? null,
    scope: agent?.scope ?? 'global',
    model: agent?.model ?? 'claude-opus-4-6',
    enabled: agent?.enabled ?? true,
  })
  const [loading, setLoading] = useState(false)

  function set<K extends keyof Agent>(key: K, value: Agent[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function insertVariable(variable: string) {
    set('prompt', form.prompt + variable)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.prompt) return
    setLoading(true)

    if (agent?.id) {
      await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
    } else {
      await fetch('/api/agents', {
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
          <h2 className="font-semibold text-[#1A1A1A]">{agent?.id ? 'Edit Agent' : 'New Agent'}</h2>
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
              placeholder="Daily Outreach Reminder"
            />
          </div>

          <div>
            <label className="text-xs text-[#888884] block mb-1">Description</label>
            <input
              value={form.description}
              onChange={e => set('description', e.target.value)}
              className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] transition-colors"
              placeholder="Suggests a follow-up message for warm targets"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#888884] block mb-1">Trigger</label>
              <select
                value={form.triggerType}
                onChange={e => set('triggerType', e.target.value)}
                className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] bg-white transition-colors"
              >
                {TRIGGER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#888884] block mb-1">Scope</label>
              <select
                value={form.scope}
                onChange={e => set('scope', e.target.value)}
                className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] bg-white transition-colors"
              >
                {SCOPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {form.triggerType === 'scheduled' && (
            <div>
              <label className="text-xs text-[#888884] block mb-1">Interval</label>
              <select
                value={form.intervalSeconds ?? 86400}
                onChange={e => set('intervalSeconds', Number(e.target.value))}
                className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] bg-white transition-colors"
              >
                {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
              </select>
            </div>
          )}

          {form.triggerType === 'event' && (
            <div>
              <label className="text-xs text-[#888884] block mb-1">Event Type</label>
              <select
                value={form.eventType ?? 'target.created'}
                onChange={e => set('eventType', e.target.value)}
                className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] bg-white transition-colors"
              >
                {EVENT_TYPES.map(ev => <option key={ev.value} value={ev.value}>{ev.label}</option>)}
              </select>
            </div>
          )}

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
              placeholder="You are a VC analyst. Review {{name}} at {{company}} (stage: {{stage}}) and suggest a next action..."
            />
            <p className="text-xs text-[#B0AFAB] mt-1">Click a variable to insert it. Variables are replaced with live data when the agent runs.</p>
          </div>

          <div className="flex items-center gap-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={form.enabled}
                onChange={e => set('enabled', e.target.checked)}
              />
              <div className="w-9 h-5 bg-[#E8E7E3] peer-checked:bg-[#1A1A1A] rounded-full transition-colors peer-focus:outline-none" />
              <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4 shadow-sm" />
            </label>
            <span className="text-sm text-[#888884]">Enabled</span>
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
              {loading ? 'Saving...' : agent?.id ? 'Save Changes' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
