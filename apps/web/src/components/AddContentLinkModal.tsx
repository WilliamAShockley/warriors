'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

interface Folder {
  id: string
  name: string
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
  defaultFolderId?: string | null
}

export default function AddContentLinkModal({ open, onClose, onCreated, defaultFolderId }: Props) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [tag, setTag] = useState('')
  const [folderId, setFolderId] = useState<string | null>(defaultFolderId ?? null)
  const [folders, setFolders] = useState<Folder[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      fetch('/api/content/folders')
        .then((r) => r.json())
        .then(setFolders)
        .catch(() => {})
      setFolderId(defaultFolderId ?? null)
    }
  }, [open, defaultFolderId])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, url, description, tag, folderId }),
    })
    setSaving(false)
    setTitle('')
    setUrl('')
    setDescription('')
    setTag('')
    setFolderId(defaultFolderId ?? null)
    onCreated()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl border border-[#E8E7E3] p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-[#1A1A1A]">Add Link</h2>
          <button onClick={onClose} className="p-1 hover:bg-black/5 rounded-lg">
            <X size={16} className="text-[#888884]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-lg border border-[#E8E7E3] text-sm focus:outline-none focus:border-[#C8C7C3]"
          />
          <input
            type="url"
            placeholder="URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-lg border border-[#E8E7E3] text-sm focus:outline-none focus:border-[#C8C7C3]"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[#E8E7E3] text-sm focus:outline-none focus:border-[#C8C7C3]"
          />
          <input
            type="text"
            placeholder="Tag (optional)"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[#E8E7E3] text-sm focus:outline-none focus:border-[#C8C7C3]"
          />
          <select
            value={folderId ?? ''}
            onChange={(e) => setFolderId(e.target.value || null)}
            className="w-full px-3 py-2 rounded-lg border border-[#E8E7E3] text-sm focus:outline-none focus:border-[#C8C7C3] bg-white"
          >
            <option value="">No folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2 bg-[#1A1A1A] text-white text-sm rounded-lg hover:bg-[#333] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add Link'}
          </button>
        </form>
      </div>
    </div>
  )
}