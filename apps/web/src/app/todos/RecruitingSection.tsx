'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, Trash2, ChevronDown, ChevronRight, ExternalLink,
  Link as LinkIcon, X, Mail, Linkedin,
} from 'lucide-react'

interface RecruitLink {
  id: string
  recruitId: string
  url: string
  label: string | null
  createdAt: string
}

interface Recruit {
  id: string
  name: string
  role: string | null
  company: string | null
  email: string | null
  linkedin: string | null
  status: string
  notes: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  links: RecruitLink[]
}

const STATUSES = [
  { value: 'prospect', label: 'Prospect', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  { value: 'reached_out', label: 'Reached Out', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  { value: 'in_conversation', label: 'In Conversation', bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  { value: 'interviewing', label: 'Interviewing', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  { value: 'offer', label: 'Offer Out', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  { value: 'joined', label: 'Joined', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  { value: 'passed', label: 'Passed', bg: 'bg-[#F0EFE9]', text: 'text-[#888884]', border: 'border-[#E8E7E3]' },
]

function statusMeta(value: string) {
  return STATUSES.find(s => s.value === value) || STATUSES[0]
}

export default function RecruitingSection() {
  const [recruits, setRecruits] = useState<Recruit[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState<Record<string, string>>({})
  const [newLinkLabel, setNewLinkLabel] = useState<Record<string, string>>({})
  const newInputRef = useRef<HTMLInputElement>(null)
  const notesTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({})

  const fetchRecruits = useCallback(async () => {
    try {
      const res = await fetch('/api/recruits')
      if (res.ok) setRecruits(await res.json())
    } catch (e) {
      console.error('Failed to fetch recruits:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRecruits()
  }, [fetchRecruits])

  useEffect(() => {
    if (showNew) newInputRef.current?.focus()
  }, [showNew])

  useEffect(() => {
    const timeouts = notesTimeoutRef.current
    return () => {
      Object.values(timeouts).forEach(clearTimeout)
    }
  }, [])

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const createRecruit = async () => {
    const trimmed = newName.trim()
    if (!trimmed) return

    setNewName('')
    setShowNew(false)

    try {
      const res = await fetch('/api/recruits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (res.ok) {
        const recruit = await res.json()
        setRecruits(prev => [...prev, recruit])
        setExpandedIds(prev => new Set(prev).add(recruit.id))
      }
    } catch (e) {
      console.error('Failed to create recruit:', e)
    }
  }

  // Optimistic local update only (used while typing).
  const setLocal = (id: string, data: Partial<Recruit>) => {
    setRecruits(prev => prev.map(r => r.id === id ? { ...r, ...data } : r))
  }

  // Persist a change to the server.
  const saveRecruit = async (id: string, data: Partial<Recruit>) => {
    setLocal(id, data)
    try {
      await fetch(`/api/recruits/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    } catch (e) {
      console.error('Failed to update recruit:', e)
      fetchRecruits()
    }
  }

  const deleteRecruit = async (id: string) => {
    setRecruits(prev => prev.filter(r => r.id !== id))
    try {
      await fetch(`/api/recruits/${id}`, { method: 'DELETE' })
    } catch (e) {
      console.error('Failed to delete recruit:', e)
      fetchRecruits()
    }
  }

  const handleNotesChange = (id: string, notes: string) => {
    setLocal(id, { notes })
    if (notesTimeoutRef.current[id]) clearTimeout(notesTimeoutRef.current[id])
    notesTimeoutRef.current[id] = setTimeout(() => {
      fetch(`/api/recruits/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      }).catch(console.error)
    }, 800)
  }

  const addLink = async (id: string) => {
    const url = (newLinkUrl[id] || '').trim()
    if (!url) return
    const label = (newLinkLabel[id] || '').trim() || null

    setNewLinkUrl(prev => ({ ...prev, [id]: '' }))
    setNewLinkLabel(prev => ({ ...prev, [id]: '' }))

    try {
      const res = await fetch(`/api/recruits/${id}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, label }),
      })
      if (res.ok) {
        const link = await res.json()
        setRecruits(prev => prev.map(r =>
          r.id === id ? { ...r, links: [...r.links, link] } : r
        ))
      }
    } catch (e) {
      console.error('Failed to add link:', e)
    }
  }

  const deleteLink = async (recruitId: string, linkId: string) => {
    setRecruits(prev => prev.map(r =>
      r.id === recruitId ? { ...r, links: r.links.filter(l => l.id !== linkId) } : r
    ))
    try {
      await fetch(`/api/recruits/${recruitId}/links/${linkId}`, { method: 'DELETE' })
    } catch (e) {
      console.error('Failed to delete link:', e)
      fetchRecruits()
    }
  }

  const fieldClass =
    'w-full bg-[#F7F6F3] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#C8C7C3] outline-none border border-transparent focus:border-[#C8C7C3] transition-colors'
  const labelClass = 'text-xs font-medium text-[#888884] uppercase tracking-wide block mb-2'

  if (loading) {
    return <div className="text-center py-16 text-sm text-[#888884]">Loading...</div>
  }

  const activeCount = recruits.filter(r => r.status !== 'passed' && r.status !== 'joined').length
  const joinedCount = recruits.filter(r => r.status === 'joined').length

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-[#1A1A1A]">Recruiting</h2>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] text-white text-sm font-medium rounded-xl hover:bg-[#333] transition-colors"
        >
          <Plus size={14} />
          New Recruit
        </button>
      </div>
      <p className="text-sm text-[#888884] mb-6">
        People to bring into Nazare
        {recruits.length > 0 && (
          <> · {activeCount} in pipeline{joinedCount > 0 ? ` · ${joinedCount} joined` : ''}</>
        )}
      </p>

      {showNew && (
        <div className="flex items-center gap-3 mb-4">
          <input
            ref={newInputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createRecruit()
              if (e.key === 'Escape') { setShowNew(false); setNewName('') }
            }}
            placeholder="Name..."
            className="flex-1 bg-white rounded-xl border border-[#E8E7E3] px-4 py-3 text-sm text-[#1A1A1A] placeholder:text-[#C8C7C3] outline-none focus:border-[#C8C7C3] transition-colors"
          />
          <button
            onClick={createRecruit}
            disabled={!newName.trim()}
            className="px-4 py-3 bg-[#1A1A1A] text-white text-sm font-medium rounded-xl hover:bg-[#333] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Add
          </button>
          <button
            onClick={() => { setShowNew(false); setNewName('') }}
            className="p-3 text-[#888884] hover:text-[#1A1A1A] transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {recruits.length === 0 && !showNew ? (
        <div className="text-center py-16">
          <p className="text-sm text-[#888884]">No recruits yet. Add someone you want to bring on.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recruits.map(recruit => {
            const meta = statusMeta(recruit.status)
            const isExpanded = expandedIds.has(recruit.id)
            const subtitle = [recruit.role, recruit.company].filter(Boolean).join(' · ')

            return (
              <div key={recruit.id} className="bg-white rounded-2xl border border-[#E8E7E3] overflow-hidden">
                {/* Collapsed header */}
                <button
                  onClick={() => toggleExpanded(recruit.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-[#FAFAF8] transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown size={16} className="text-[#888884] flex-shrink-0" />
                  ) : (
                    <ChevronRight size={16} className="text-[#888884] flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-[#1A1A1A] truncate block">{recruit.name}</span>
                    {subtitle && <span className="text-xs text-[#888884] truncate block">{subtitle}</span>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${meta.bg} ${meta.text} ${meta.border}`}>
                    {meta.label}
                  </span>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-[#E8E7E3] px-5 py-4 space-y-5">
                    {/* Name */}
                    <div>
                      <label className={labelClass}>Name</label>
                      <input
                        type="text"
                        value={recruit.name}
                        onChange={(e) => setLocal(recruit.id, { name: e.target.value })}
                        onBlur={(e) => {
                          const v = e.target.value.trim()
                          if (v && v !== recruit.name) saveRecruit(recruit.id, { name: v })
                          else if (!v) fetchRecruits()
                        }}
                        className={fieldClass}
                      />
                    </div>

                    {/* Role + Company */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Role at Nazare</label>
                        <input
                          type="text"
                          value={recruit.role || ''}
                          onChange={(e) => setLocal(recruit.id, { role: e.target.value })}
                          onBlur={(e) => saveRecruit(recruit.id, { role: e.target.value.trim() || null })}
                          placeholder="e.g. Founding Engineer"
                          className={fieldClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Current Company</label>
                        <input
                          type="text"
                          value={recruit.company || ''}
                          onChange={(e) => setLocal(recruit.id, { company: e.target.value })}
                          onBlur={(e) => saveRecruit(recruit.id, { company: e.target.value.trim() || null })}
                          placeholder="Where they are now"
                          className={fieldClass}
                        />
                      </div>
                    </div>

                    {/* Email + LinkedIn */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Email</label>
                        <div className="flex items-center gap-2">
                          <Mail size={14} className="text-[#C8C7C3] flex-shrink-0" />
                          <input
                            type="email"
                            value={recruit.email || ''}
                            onChange={(e) => setLocal(recruit.id, { email: e.target.value })}
                            onBlur={(e) => saveRecruit(recruit.id, { email: e.target.value.trim() || null })}
                            placeholder="name@email.com"
                            className={fieldClass}
                          />
                        </div>
                      </div>
                      <div>
                        <label className={labelClass}>LinkedIn</label>
                        <div className="flex items-center gap-2">
                          <Linkedin size={14} className="text-[#C8C7C3] flex-shrink-0" />
                          <input
                            type="text"
                            value={recruit.linkedin || ''}
                            onChange={(e) => setLocal(recruit.id, { linkedin: e.target.value })}
                            onBlur={(e) => saveRecruit(recruit.id, { linkedin: e.target.value.trim() || null })}
                            placeholder="linkedin.com/in/..."
                            className={fieldClass}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Status */}
                    <div>
                      <label className={labelClass}>Pipeline</label>
                      <div className="flex gap-2 flex-wrap">
                        {STATUSES.map(s => (
                          <button
                            key={s.value}
                            onClick={() => saveRecruit(recruit.id, { status: s.value })}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                              recruit.status === s.value
                                ? `${s.bg} ${s.text} ${s.border} font-medium`
                                : 'bg-white text-[#888884] border-[#E8E7E3] hover:border-[#C8C7C3]'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <label className={labelClass}>Notes</label>
                      <textarea
                        value={recruit.notes || ''}
                        onChange={(e) => handleNotesChange(recruit.id, e.target.value)}
                        placeholder="Why they'd be great, where things stand, next steps..."
                        rows={3}
                        className={`${fieldClass} resize-none`}
                      />
                    </div>

                    {/* Links */}
                    <div>
                      <label className={labelClass}>Links</label>
                      {recruit.links.length > 0 && (
                        <div className="space-y-1 mb-2">
                          {recruit.links.map(link => (
                            <div
                              key={link.id}
                              className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#F7F6F3] transition-colors"
                            >
                              <ExternalLink size={14} className="text-[#888884] flex-shrink-0" />
                              <a
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 text-sm text-blue-600 hover:text-blue-800 truncate"
                              >
                                {link.label || link.url}
                              </a>
                              <button
                                onClick={() => deleteLink(recruit.id, link.id)}
                                className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-[#C8C7C3] hover:text-red-400 transition-all"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <LinkIcon size={14} className="text-[#C8C7C3] flex-shrink-0" />
                        <input
                          type="text"
                          value={newLinkLabel[recruit.id] || ''}
                          onChange={(e) => setNewLinkLabel(prev => ({ ...prev, [recruit.id]: e.target.value }))}
                          placeholder="Label (optional)"
                          className="w-28 bg-[#F7F6F3] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#C8C7C3] outline-none border border-transparent focus:border-[#C8C7C3] transition-colors"
                        />
                        <input
                          type="text"
                          value={newLinkUrl[recruit.id] || ''}
                          onChange={(e) => setNewLinkUrl(prev => ({ ...prev, [recruit.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addLink(recruit.id)
                          }}
                          placeholder="https://..."
                          className="flex-1 bg-[#F7F6F3] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#C8C7C3] outline-none border border-transparent focus:border-[#C8C7C3] transition-colors"
                        />
                        <button
                          onClick={() => addLink(recruit.id)}
                          disabled={!(newLinkUrl[recruit.id] || '').trim()}
                          className="p-2 text-[#888884] hover:text-[#1A1A1A] transition-colors disabled:opacity-30"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Delete */}
                    <div className="pt-2 border-t border-[#E8E7E3]">
                      <button
                        onClick={() => deleteRecruit(recruit.id)}
                        className="flex items-center gap-2 text-xs text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={12} />
                        Remove recruit
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
