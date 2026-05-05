'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Lightbulb } from 'lucide-react'

interface MarketNote {
  id: string
  title: string
  content: string
  createdAt: string
}

export default function MarketNotesPage() {
  const router = useRouter()
  const [notes, setNotes] = useState<MarketNote[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedNote, setSelectedNote] = useState<MarketNote | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch('/api/market-notes')
      if (res.ok) {
        const data = await res.json()
        setNotes(data)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/market-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), content: newContent.trim() }),
      })
      if (res.ok) {
        setNewTitle('')
        setNewContent('')
        setShowNewForm(false)
        await fetchNotes()
      }
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async () => {
    if (!selectedNote || !editTitle.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/market-notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedNote.id, title: editTitle.trim(), content: editContent.trim() }),
      })
      if (res.ok) {
        await fetchNotes()
        setSelectedNote({ ...selectedNote, title: editTitle.trim(), content: editContent.trim() })
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch('/api/market-notes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        if (selectedNote?.id === id) {
          setSelectedNote(null)
        }
        await fetchNotes()
      }
    } catch {
      // ignore
    }
  }

  const selectNote = (note: MarketNote) => {
    setSelectedNote(note)
    setEditTitle(note.title)
    setEditContent(note.content)
    setShowNewForm(false)
  }

  return (
    <div className="min-h-screen bg-[#F7F6F3]">
      <header className="px-10 pt-10 pb-6">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-sm text-[#888884] hover:text-[#1A1A1A] transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#1A1A1A]">Market Notes &amp; Insights</h1>
            <p className="text-sm text-[#888884] mt-1">Capture market observations, thesis notes, and investment insights</p>
          </div>
          <button
            onClick={() => {
              setShowNewForm(true)
              setSelectedNote(null)
              setNewTitle('')
              setNewContent('')
            }}
            className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] text-white rounded-lg text-sm hover:bg-[#333] transition-colors"
          >
            <Plus size={14} />
            New Note
          </button>
        </div>
      </header>

      <main className="px-10 pb-10">
        <div className="flex gap-6 max-w-5xl">
          {/* Notes list */}
          <div className="w-80 shrink-0 space-y-2">
            {loading ? (
              <p className="text-sm text-[#888884]">Loading...</p>
            ) : notes.length === 0 && !showNewForm ? (
              <div className="bg-white rounded-xl border border-[#E8E7E3] p-6 text-center">
                <Lightbulb size={24} className="text-[#888884] mx-auto mb-2" />
                <p className="text-sm text-[#888884]">No notes yet. Create your first insight.</p>
              </div>
            ) : (
              notes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => selectNote(note)}
                  className={`w-full text-left p-4 rounded-xl border transition-all duration-150 ${
                    selectedNote?.id === note.id
                      ? 'bg-white border-[#1A1A1A] shadow-sm'
                      : 'bg-white border-[#E8E7E3] hover:border-[#C8C7C3]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#1A1A1A] truncate">{note.title}</p>
                      <p className="text-xs text-[#888884] mt-1 line-clamp-2">{note.content || 'No content'}</p>
                      <p className="text-xs text-[#888884] mt-2">
                        {new Date(note.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(note.id)
                      }}
                      className="p-1 rounded hover:bg-red-50 transition-colors shrink-0"
                    >
                      <Trash2 size={12} className="text-[#888884] hover:text-red-500" />
                    </button>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Detail / New form */}
          <div className="flex-1 min-w-0">
            {showNewForm ? (
              <div className="bg-white rounded-xl border border-[#E8E7E3] p-6 space-y-4">
                <h2 className="text-lg font-medium text-[#1A1A1A]">New Note</h2>
                <div>
                  <label className="block text-sm text-[#888884] mb-1">Title</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. AI Infrastructure Thesis"
                    className="w-full px-3 py-2 border border-[#E8E7E3] rounded-lg text-sm focus:outline-none focus:border-[#1A1A1A] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#888884] mb-1">Content</label>
                  <textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    rows={12}
                    placeholder="Write your market observations, thesis notes, or insights..."
                    className="w-full px-3 py-2 border border-[#E8E7E3] rounded-lg text-sm focus:outline-none focus:border-[#1A1A1A] transition-colors resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={saving || !newTitle.trim()}
                    className="px-4 py-2 bg-[#1A1A1A] text-white rounded-lg text-sm hover:bg-[#333] transition-colors disabled:opacity-40"
                  >
                    {saving ? 'Saving...' : 'Save Note'}
                  </button>
                  <button
                    onClick={() => setShowNewForm(false)}
                    className="px-4 py-2 border border-[#E8E7E3] rounded-lg text-sm hover:bg-[#F7F6F3] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : selectedNote ? (
              <div className="bg-white rounded-xl border border-[#E8E7E3] p-6 space-y-4">
                <div>
                  <label className="block text-sm text-[#888884] mb-1">Title</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E8E7E3] rounded-lg text-sm focus:outline-none focus:border-[#1A1A1A] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#888884] mb-1">Content</label>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={16}
                    className="w-full px-3 py-2 border border-[#E8E7E3] rounded-lg text-sm focus:outline-none focus:border-[#1A1A1A] transition-colors resize-none"
                  />
                </div>
                <button
                  onClick={handleUpdate}
                  disabled={saving || !editTitle.trim()}
                  className="px-4 py-2 bg-[#1A1A1A] text-white rounded-lg text-sm hover:bg-[#333] transition-colors disabled:opacity-40"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#E8E7E3] p-12 text-center">
                <Lightbulb size={32} className="text-[#888884] mx-auto mb-3" />
                <p className="text-sm text-[#888884]">Select a note or create a new one</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}