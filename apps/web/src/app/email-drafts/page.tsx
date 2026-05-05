'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Search, Pencil, Trash2, FileText, X, Copy, Check } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type EmailDraft = {
  id: string
  name: string
  subject: string
  body: string
  createdAt: string
  updatedAt: string
}

export default function EmailDraftsPage() {
  const router = useRouter()
  const [drafts, setDrafts] = useState<EmailDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingDraft, setEditingDraft] = useState<EmailDraft | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/email-drafts')
    const data = await res.json()
    setDrafts(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function deleteDraft(id: string) {
    if (!confirm('Delete this email draft?')) return
    await fetch(`/api/email-drafts/${id}`, { method: 'DELETE' })
    setDrafts((prev) => prev.filter((d) => d.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  function copyBody(draft: EmailDraft) {
    const text = `Subject: ${draft.subject}\n\n${draft.body}`
    navigator.clipboard.writeText(text)
    setCopiedId(draft.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const filtered = drafts.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.subject.toLowerCase().includes(search.toLowerCase()) ||
      d.body.toLowerCase().includes(search.toLowerCase())
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
        <h1 className="text-lg font-semibold text-[#1A1A1A]">Email Drafts</h1>
        <span className="text-sm text-[#888884]">{filtered.length}</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white border border-[#E8E7E3] rounded-lg px-3 py-1.5">
            <Search size={13} className="text-[#888884]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search drafts..."
              className="text-sm bg-transparent outline-none w-40 text-[#1A1A1A] placeholder:text-[#C8C7C3]"
            />
          </div>
          <button
            onClick={() => {
              setEditingDraft(null)
              setShowModal(true)
            }}
            className="flex items-center gap-1.5 bg-[#1A1A1A] text-white text-sm px-3 py-1.5 rounded-lg hover:bg-[#333] transition-colors"
          >
            <Plus size={13} />
            New Draft
          </button>
        </div>
      </div>

      <div className="border-b border-[#E8E7E3] mx-8" />

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm text-[#888884]">
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <FileText size={24} className="text-[#C8C7C3]" />
            <p className="text-sm text-[#888884]">
              {search ? 'No drafts match your search' : 'No email drafts yet — create your first one'}
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-8 py-4 space-y-3">
            {filtered.map((draft) => {
              const isExpanded = expandedId === draft.id
              return (
                <div
                  key={draft.id}
                  className="bg-white border border-[#E8E7E3] rounded-xl overflow-hidden transition-all"
                >
                  {/* Header row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : draft.id)}
                    className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-[#FAFAF8] transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[#F7F6F3] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <FileText size={14} className="text-[#888884]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm text-[#1A1A1A]">{draft.name}</span>
                        <span className="text-xs text-[#B0AFAB] flex-shrink-0">
                          {formatDistanceToNow(new Date(draft.updatedAt), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm text-[#888884] truncate">
                        <span className="text-[#B0AFAB]">Subject:</span> {draft.subject}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => copyBody(draft)}
                        className="p-1.5 rounded-lg hover:bg-[#F0EFE9] transition-colors"
                        title="Copy to clipboard"
                      >
                        {copiedId === draft.id ? (
                          <Check size={13} className="text-emerald-500" />
                        ) : (
                          <Copy size={13} className="text-[#B0AFAB]" />
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setEditingDraft(draft)
                          setShowModal(true)
                        }}
                        className="p-1.5 rounded-lg hover:bg-[#F0EFE9] transition-colors"
                        title="Edit"
                      >
                        <Pencil size={13} className="text-[#B0AFAB]" />
                      </button>
                      <button
                        onClick={() => deleteDraft(draft.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={13} className="text-[#B0AFAB] hover:text-red-400" />
                      </button>
                    </div>
                  </button>

                  {/* Expanded body */}
                  {isExpanded && (
                    <div className="px-5 pb-4 border-t border-[#E8E7E3]">
                      <div className="pt-4 space-y-3">
                        <div>
                          <span className="text-xs font-medium text-[#888884] uppercase tracking-wide">Subject</span>
                          <p className="text-sm text-[#1A1A1A] mt-1">{draft.subject}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-[#888884] uppercase tracking-wide">Body</span>
                          <p className="text-sm text-[#1A1A1A] mt-1 whitespace-pre-wrap leading-relaxed">
                            {draft.body || <span className="italic text-[#B0AFAB]">No body content</span>}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <DraftModal
          draft={editingDraft}
          onClose={() => {
            setShowModal(false)
            setEditingDraft(null)
          }}
          onSaved={() => {
            setShowModal(false)
            setEditingDraft(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function DraftModal({
  draft,
  onClose,
  onSaved,
}: {
  draft: EmailDraft | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEditing = !!draft
  const [form, setForm] = useState({
    name: draft?.name ?? '',
    subject: draft?.subject ?? '',
    body: draft?.body ?? '',
  })
  const [saving, setSaving] = useState(false)

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.subject.trim()) return
    setSaving(true)

    if (isEditing && draft) {
      await fetch(`/api/email-drafts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
    } else {
      await fetch('/api/email-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
    }

    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#E8E7E3]">
          <h2 className="font-semibold text-[#1A1A1A]">
            {isEditing ? 'Edit Draft' : 'New Email Draft'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
            <X size={16} className="text-[#888884]" />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs text-[#888884] block mb-1">Template Name *</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] transition-colors"
              placeholder="e.g. Cold Intro, Follow-up After Meeting, Check-in"
            />
          </div>

          <div>
            <label className="text-xs text-[#888884] block mb-1">Subject Line *</label>
            <input
              value={form.subject}
              onChange={(e) => set('subject', e.target.value)}
              required
              className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] transition-colors"
              placeholder="e.g. Quick intro — [Your Fund] x {{company}}"
            />
          </div>

          <div>
            <label className="text-xs text-[#888884] block mb-1">
              Email Body
              <span className="text-[#B0AFAB] ml-1 font-normal">
                — use {'{{name}}'} and {'{{company}}'} as placeholders
              </span>
            </label>
            <textarea
              value={form.body}
              onChange={(e) => set('body', e.target.value)}
              rows={10}
              className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] transition-colors resize-none font-mono leading-relaxed"
              placeholder={`Hi {{name}},\n\nI came across {{company}} and was really impressed by...\n\nWould love to find 20 minutes to learn more about what you're building.\n\nBest,\n[Your name]`}
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
              disabled={saving || !form.name.trim() || !form.subject.trim()}
              className="flex-1 text-sm py-2 rounded-lg bg-[#1A1A1A] text-white hover:bg-[#333] disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Draft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}