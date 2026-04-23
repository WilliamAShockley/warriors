'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { ACTIVITY_TYPES } from '@/lib/utils'

type Props = {
  targetId: string
  onClose: () => void
  onCreated: () => void
}

export default function LogActivityModal({ targetId, onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    type: 'meeting',
    description: '',
    date: new Date().toISOString().split('T')[0],
  })
  const [loading, setLoading] = useState(false)

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.description) return
    setLoading(true)
    await fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, targetId }),
    })
    onCreated()
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#E8E7E3]">
          <h2 className="font-semibold text-[#1A1A1A]">Log Activity</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
            <X size={16} className="text-[#888884]" />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#888884] block mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => set('type', e.target.value)}
                className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] bg-white transition-colors capitalize"
              >
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t} value={t} className="capitalize">{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#888884] block mb-1">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => set('date', e.target.value)}
                className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-[#888884] block mb-1">Description *</label>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              required
              rows={3}
              className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] transition-colors resize-none"
              placeholder="Had intro call, discussed Series A thesis. Strong signal on enterprise motion..."
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
              disabled={loading || !form.description}
              className="flex-1 text-sm py-2 rounded-lg bg-[#1A1A1A] text-white hover:bg-[#333] disabled:opacity-40 transition-colors"
            >
              {loading ? 'Logging...' : 'Log Activity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
