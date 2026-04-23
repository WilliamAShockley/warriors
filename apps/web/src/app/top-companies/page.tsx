'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, GripVertical, Star, X, Plus, Search } from 'lucide-react'
import { STAGES, cn } from '@/lib/utils'

type Target = {
  id: string
  name: string
  company: string
  stage: string
  status: string
  aiNextStep: string | null
  starred: boolean
  starRank: number | null
}

const STATUS_DOT: Record<string, string> = {
  green: 'bg-emerald-400',
  yellow: 'bg-green-300',
  red: 'bg-red-400',
}

const EMPTY_FORM = {
  name: '',
  company: '',
  email: '',
  linkedin: '',
  stage: 'intro_sent',
  status: 'yellow',
  notes: '',
}

export default function TopCompaniesPage() {
  const router = useRouter()
  const [items, setItems] = useState<Target[]>([])
  const [allTargets, setAllTargets] = useState<Target[]>([])
  const [loading, setLoading] = useState(true)

  // Picker state
  const [showPicker, setShowPicker] = useState(false)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'search' | 'create'>('search')
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const dragIdx = useRef<number | null>(null)

  async function load() {
    const [topRes, allRes] = await Promise.all([
      fetch('/api/top-companies'),
      fetch('/api/targets'),
    ])
    setItems(await topRes.json())
    setAllTargets(await allRes.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (showPicker && view === 'search') setTimeout(() => searchRef.current?.focus(), 50)
  }, [showPicker, view])

  function openPicker() {
    setView('search')
    setSearch('')
    setForm(EMPTY_FORM)
    setShowPicker(true)
  }

  function closePicker() {
    setShowPicker(false)
    setSearch('')
    setView('search')
    setForm(EMPTY_FORM)
  }

  async function saveOrder(ordered: Target[]) {
    await fetch('/api/top-companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ordered.map(t => t.id) }),
    })
  }

  async function addExisting(target: Target) {
    const maxRank = items.reduce((m, t) => Math.max(m, t.starRank ?? -1), -1)
    await fetch(`/api/targets/${target.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred: true, starRank: maxRank + 1 }),
    })
    const updated = { ...target, starred: true, starRank: maxRank + 1 }
    const next = [...items, updated]
    setItems(next)
    setAllTargets(prev => prev.map(t => t.id === target.id ? updated : t))
    closePicker()
    saveOrder(next)
  }

  async function createAndAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.company) return
    setSaving(true)
    const maxRank = items.reduce((m, t) => Math.max(m, t.starRank ?? -1), -1)
    const res = await fetch('/api/targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, starred: true, starRank: maxRank + 1 }),
    })
    const newTarget = await res.json()
    const next = [...items, newTarget]
    setItems(next)
    setAllTargets(prev => [...prev, newTarget])
    setSaving(false)
    closePicker()
    saveOrder(next)
  }

  async function unstar(id: string) {
    await fetch(`/api/targets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred: false, starRank: null }),
    })
    const next = items.filter(t => t.id !== id)
    setItems(next)
    setAllTargets(prev => prev.map(t => t.id === id ? { ...t, starred: false, starRank: null } : t))
    saveOrder(next)
  }

  function onDragStart(i: number) { dragIdx.current = i }

  function onDragEnter(i: number) {
    if (dragIdx.current === null || dragIdx.current === i) return
    const next = [...items]
    const [moved] = next.splice(dragIdx.current, 1)
    next.splice(i, 0, moved)
    dragIdx.current = i
    setItems(next)
  }

  function onDragEnd() {
    dragIdx.current = null
    saveOrder(items)
  }

  const unstarred = allTargets.filter(t => !t.starred && (
    search === '' || `${t.name} ${t.company}`.toLowerCase().includes(search.toLowerCase())
  ))

  const atMax = items.length >= 10

  return (
    <div className="min-h-screen bg-[#F7F6F3]">
      <div className="flex items-center gap-3 px-8 pt-10 pb-4">
        <button onClick={() => router.push('/')} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
          <ArrowLeft size={16} className="text-[#888884]" />
        </button>
        <h1 className="text-lg font-semibold text-[#1A1A1A]">Top Companies</h1>
        <span className="text-sm text-[#888884]">{items.length}/10</span>
        {!atMax && (
          <button
            onClick={openPicker}
            className="ml-auto flex items-center gap-1.5 text-xs bg-[#1A1A1A] text-white px-3 py-1.5 rounded-lg hover:bg-[#333] transition-colors"
          >
            <Plus size={12} />
            Add Company
          </button>
        )}
      </div>

      <div className="border-b border-[#E8E7E3] mx-8" />

      <div className="max-w-2xl px-8 py-6 space-y-3">

        {/* Picker panel */}
        {showPicker && (
          <div className="bg-white border border-[#E8E7E3] rounded-2xl overflow-hidden shadow-sm">
            {/* Header tabs */}
            <div className="flex items-center border-b border-[#E8E7E3]">
              <button
                onClick={() => setView('search')}
                className={cn(
                  'flex-1 text-xs py-3 font-medium transition-colors',
                  view === 'search' ? 'text-[#1A1A1A] border-b-2 border-[#1A1A1A] -mb-px' : 'text-[#888884] hover:text-[#1A1A1A]'
                )}
              >
                Existing Target
              </button>
              <button
                onClick={() => setView('create')}
                className={cn(
                  'flex-1 text-xs py-3 font-medium transition-colors',
                  view === 'create' ? 'text-[#1A1A1A] border-b-2 border-[#1A1A1A] -mb-px' : 'text-[#888884] hover:text-[#1A1A1A]'
                )}
              >
                New Company
              </button>
              <button onClick={closePicker} className="px-3">
                <X size={13} className="text-[#888884]" />
              </button>
            </div>

            {view === 'search' ? (
              <>
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[#E8E7E3]">
                  <Search size={13} className="text-[#888884] flex-shrink-0" />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search targets..."
                    className="flex-1 text-sm bg-transparent outline-none text-[#1A1A1A] placeholder:text-[#C8C7C3]"
                  />
                </div>
                {unstarred.length === 0 ? (
                  <div className="px-4 py-5 text-center space-y-2">
                    <p className="text-sm text-[#B0AFAB]">
                      {search ? `No targets matching "${search}"` : 'All targets are already in Top Companies'}
                    </p>
                    <button
                      onClick={() => { setForm(f => ({ ...f, company: search })); setView('create') }}
                      className="text-xs text-[#1A1A1A] underline"
                    >
                      Create a new company instead
                    </button>
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto">
                    {unstarred.map(target => (
                      <button
                        key={target.id}
                        onClick={() => addExisting(target)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F7F6F3] transition-colors text-left border-b border-[#E8E7E3] last:border-0"
                      >
                        <div className={cn('w-2 h-2 rounded-full flex-shrink-0', STATUS_DOT[target.status] ?? 'bg-gray-300')} />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-[#1A1A1A]">{target.company}</span>
                          <span className="text-xs text-[#888884] ml-2">{target.name}</span>
                        </div>
                        <span className="text-xs text-[#888884] bg-[#F0EFE9] px-1.5 py-0.5 rounded-full flex-shrink-0">
                          {STAGES[target.stage] ?? target.stage}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <form onSubmit={createAndAdd} className="px-5 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-[#888884] block mb-1">Company *</label>
                    <input
                      autoFocus
                      value={form.company}
                      onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                      required
                      className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] transition-colors"
                      placeholder="Antioch"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#888884] block mb-1">Founder *</label>
                    <input
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      required
                      className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] transition-colors"
                      placeholder="Colton Swingle"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-[#888884] block mb-1">Email</label>
                    <input
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      type="email"
                      className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] transition-colors"
                      placeholder="colton@antioch.com"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#888884] block mb-1">Stage</label>
                    <select
                      value={form.stage}
                      onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}
                      className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] bg-white transition-colors"
                    >
                      {Object.entries(STAGES).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-[#888884] block mb-1">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] transition-colors resize-none"
                    placeholder="Thesis fit, how you met..."
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closePicker}
                    className="flex-1 text-sm py-2 rounded-lg border border-[#E8E7E3] text-[#888884] hover:border-[#C8C7C3] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !form.name || !form.company}
                    className="flex-1 text-sm py-2 rounded-lg bg-[#1A1A1A] text-white hover:bg-[#333] disabled:opacity-40 transition-colors"
                  >
                    {saving ? 'Adding...' : 'Add to Top Companies'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Ranked list */}
        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm text-[#888884]">Loading...</div>
        ) : items.length === 0 && !showPicker ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
            <Star size={28} className="text-[#C8C7C3]" />
            <p className="text-sm text-[#888884]">No companies added yet.</p>
            <button
              onClick={openPicker}
              className="text-xs bg-[#1A1A1A] text-white px-3 py-1.5 rounded-lg hover:bg-[#333] transition-colors"
            >
              Add your first company
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((target, i) => (
              <div
                key={target.id}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragEnter={() => onDragEnter(i)}
                onDragEnd={onDragEnd}
                onDragOver={e => e.preventDefault()}
                className="group bg-white border border-[#E8E7E3] rounded-xl px-4 py-3 flex items-center gap-3 cursor-grab active:cursor-grabbing active:shadow-md active:scale-[1.01] transition-all select-none"
              >
                <div className="w-5 text-center flex-shrink-0">
                  <span className="text-xs font-semibold text-[#B0AFAB]">{i + 1}</span>
                </div>
                <GripVertical size={14} className="text-[#C8C7C3] flex-shrink-0" />
                <div className={cn('w-2 h-2 rounded-full flex-shrink-0', STATUS_DOT[target.status] ?? 'bg-gray-300')} />
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => router.push(`/targets/${target.id}`)}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-sm text-[#1A1A1A]">{target.company}</span>
                    <span className="text-xs text-[#888884]">{target.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-[#888884] bg-[#F0EFE9] px-1.5 py-0.5 rounded-full flex-shrink-0">
                      {STAGES[target.stage] ?? target.stage}
                    </span>
                    {target.aiNextStep && (
                      <span className="text-xs text-[#888884] truncate italic">{target.aiNextStep}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => unstar(target.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 transition-all flex-shrink-0"
                  title="Remove from Top Companies"
                >
                  <X size={13} className="text-[#888884]" />
                </button>
              </div>
            ))}
          </div>
        )}

        {items.length > 0 && (
          <p className="text-xs text-[#B0AFAB] text-center">Drag to reorder · hover to remove</p>
        )}
      </div>
    </div>
  )
}
