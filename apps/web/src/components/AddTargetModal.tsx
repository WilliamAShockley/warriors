'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { STAGES } from '@/lib/utils'

type Props = {
  onClose: () => void
  onCreated: () => void
}

export default function AddTargetModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    name: '',
    company: '',
    email: '',
    linkedin: '',
    stage: 'intro_sent',
    status: 'yellow',
    notes: '',
  })
  const [loading, setLoading] = useState(false)

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.company) return
    setLoading(true)
    await fetch('/api/targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    onCreated()
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#E8E7E3]">
          <h2 className="font-semibold text-[#1A1A1A]">Add Target</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
            <X size={16} className="text-[#888884]" />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#888884] block mb-1">Name *</label>
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                required
                className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] transition-colors"
                placeholder="Colton Swingle"
              />
            </div>
            <div>
              <label className="text-xs text-[#888884] block mb-1">Company *</label>
              <input
                value={form.company}
                onChange={(e) => set('company', e.target.value)}
                required
                className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] transition-colors"
                placeholder="Antioch"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#888884] block mb-1">Email</label>
              <input
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                type="email"
                className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] transition-colors"
                placeholder="colton@antioch.com"
              />
            </div>
            <div>
              <label className="text-xs text-[#888884] block mb-1">LinkedIn</label>
              <input
                value={form.linkedin}
                onChange={(e) => set('linkedin', e.target.value)}
                className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] transition-colors"
                placeholder="linkedin.com/in/..."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#888884] block mb-1">Stage</label>
              <select
                value={form.stage}
                onChange={(e) => set('stage', e.target.value)}
                className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] bg-white transition-colors"
              >
                {Object.entries(STAGES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#888884] block mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
                className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] bg-white transition-colors"
              >
                <option value="green">Recent</option>
                <option value="yellow">Nudge</option>
                <option value="red">Needs Attention</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-[#888884] block mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] transition-colors resize-none"
              placeholder="Context, thesis fit, how you met..."
            />
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
              disabled={loading || !form.name || !form.company}
              className="flex-1 text-sm py-2 rounded-lg bg-[#1A1A1A] text-white hover:bg-[#333] disabled:opacity-40 transition-colors"
            >
              {loading ? 'Adding...' : 'Add Target'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
