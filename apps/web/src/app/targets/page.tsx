'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Search, Star, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { STAGES, getEffectiveStatus } from '@/lib/utils'
import AddTargetModal from '@/components/AddTargetModal'

type Target = {
  id: string
  name: string
  company: string
  websiteUrl: string | null
  founderName: string | null
  stage: string
  status: string
  lastContacted: string | null
  updatedAt: string
  aiNextStep: string | null
  starred: boolean
  starRank: number | null
  createdAt: string
  activities: { id: string; type: string; description: string; date: string }[]
}

function extractName(founderOutput: string): string {
  const matches = founderOutput.match(/\*\*([^*]+)\*\*/g)
  if (matches) {
    const names = matches.map(m => m.replace(/\*\*/g, '')).filter(m => m.includes(' '))
    if (names.length > 0) return names[0]
  }
  return founderOutput.split('\n')[0].replace(/^#+\s*/, '').trim()
}

const STATUS_DOT: Record<string, string> = {
  green: 'bg-emerald-400',
  yellow: 'bg-amber-400',
  red: 'bg-red-400',
}

const STAGE_BADGE: Record<string, string> = {
  outreach: 'bg-amber-50 text-amber-700',
  follow_up: 'bg-amber-50 text-amber-700',
  passed: 'bg-red-50 text-red-600',
}

export default function TargetsPage() {
  const router = useRouter()
  const [targets, setTargets] = useState<Target[]>([])
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [loading, setLoading] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function toggleStar(e: React.MouseEvent, target: Target) {
    e.stopPropagation()
    const starred = !target.starred
    // If starring, count current starred to enforce max 10
    if (starred && targets.filter(t => t.starred).length >= 10) return
    // Assign rank = current max + 1 when starring
    const maxRank = targets.filter(t => t.starred).reduce((m, t) => Math.max(m, t.starRank ?? -1), -1)
    await fetch(`/api/targets/${target.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred, starRank: starred ? maxRank + 1 : null }),
    })
    setTargets(prev => prev.map(t => t.id === target.id ? { ...t, starred, starRank: starred ? maxRank + 1 : null } : t))
  }

  async function load() {
    const res = await fetch('/api/targets')
    const data = await res.json()
    setTargets(data)
    setLoading(false)
    // Poll every 8s while any target has a URL but no founder yet
    const needsPolling = data.some((t: Target) => t.websiteUrl && !t.founderName)
    if (needsPolling && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        const r = await fetch('/api/targets')
        const d = await r.json()
        setTargets(d)
        if (!d.some((t: Target) => t.websiteUrl && !t.founderName)) {
          clearInterval(pollRef.current!)
          pollRef.current = null
        }
      }, 8000)
    } else if (!needsPolling && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  useEffect(() => {
    load()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const filtered = targets.filter((t) =>
    t.stage !== 'passed' &&
    `${t.name} ${t.company}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-[#F7F6F3] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-8 pt-10 pb-4">
        <button
          onClick={() => router.push('/')}
          className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
        >
          <ArrowLeft size={16} className="text-[#888884]" />
        </button>
        <h1 className="text-lg font-semibold text-[#1A1A1A]">Targets</h1>
        <span className="text-sm text-[#888884]">{filtered.length}</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white border border-[#E8E7E3] rounded-lg px-3 py-1.5">
            <Search size={13} className="text-[#888884]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="text-sm bg-transparent outline-none w-40 text-[#1A1A1A] placeholder:text-[#C8C7C3]"
            />
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 bg-[#1A1A1A] text-white text-sm px-3 py-1.5 rounded-lg hover:bg-[#333] transition-colors"
          >
            <Plus size={13} />
            Add Target
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="border-b border-[#E8E7E3] mx-8" />

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm text-[#888884]">
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <p className="text-sm text-[#888884]">
              {search ? 'No results' : 'No targets yet — add your first one'}
            </p>
          </div>
        ) : (
          filtered.map((target) => {
            return (
              <div
                key={target.id}
                className="group w-full flex items-start gap-4 px-8 py-4 hover:bg-white/70 transition-colors border-b border-[#E8E7E3]"
              >
                {/* Status dot */}
                <div className="mt-1.5 flex-shrink-0">
                  <div className={`w-2 h-2 rounded-full ${STATUS_DOT[getEffectiveStatus(target.status, target.lastContacted, target.activities[0]?.date ?? null)] ?? 'bg-gray-300'}`} />
                </div>

                {/* Content */}
                <button
                  onClick={() => router.push(`/targets/${target.id}`)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="font-medium text-[#1A1A1A] text-sm">
                      {target.founderName ? extractName(target.founderName) : (target.name || '—')}
                    </span>
                    <span className="text-[#888884] text-sm">{target.company || target.websiteUrl || '—'}</span>
                    <span className="ml-auto text-xs text-[#B0AFAB] flex-shrink-0">
                      {formatDistanceToNow(new Date(target.updatedAt), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${STAGE_BADGE[target.stage] ?? 'bg-[#F0EFE9] text-[#888884]'}`}>
                      {STAGES[target.stage] ?? target.stage}
                    </span>
                    {target.websiteUrl && !target.founderName ? (
                      Date.now() - new Date(target.createdAt).getTime() > 5 * 60 * 1000 ? (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            await fetch(`/api/founder-search/target/${target.id}`, { method: 'POST' })
                            // Reset updatedAt to now so polling picks it up as "fresh"
                            setTargets(prev => prev.map(t => t.id === target.id ? { ...t, createdAt: new Date().toISOString() } : t))
                          }}
                          className="text-xs text-amber-600 hover:text-amber-800 italic transition-colors"
                        >
                          Search timed out — retry
                        </button>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-[#888884] italic">
                          <span className="w-2.5 h-2.5 rounded-full border-2 border-[#888884] border-t-transparent animate-spin inline-block flex-shrink-0" />
                          Searching for founder...
                        </span>
                      )
                    ) : (
                      <span className="text-sm text-[#888884] truncate italic">
                        {target.aiNextStep ?? '—'}
                      </span>
                    )}
                  </div>
                </button>

                {/* Star */}
                <button
                  onClick={(e) => toggleStar(e, target)}
                  className={`mt-1 p-1 rounded-md transition-all flex-shrink-0 ${
                    target.starred
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100'
                  }`}
                  title={target.starred ? 'Remove from Top Companies' : 'Add to Top Companies'}
                >
                  <Star
                    size={14}
                    className={target.starred ? 'fill-amber-400 text-amber-400' : 'text-[#C8C7C3]'}
                  />
                </button>

                {/* Delete */}
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    await fetch(`/api/targets/${target.id}`, { method: 'DELETE' })
                    setTargets(prev => prev.filter(t => t.id !== target.id))
                  }}
                  className="mt-1 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 hover:text-red-500"
                  title="Delete target"
                >
                  <Trash2 size={14} className="text-[#C8C7C3]" />
                </button>
              </div>
            )
          })
        )}
      </div>

      {showAdd && (
        <AddTargetModal
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); load() }}
        />
      )}
    </div>
  )
}
