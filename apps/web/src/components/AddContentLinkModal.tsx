'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

const TAG_OPTIONS = ['Article', 'Thread', 'Video', 'Podcast', 'Tool', 'Research', 'Other']

export default function AddContentLinkModal({ open, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [tag, setTag] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const handleSave = async () => {
    if (!title.trim() || !url.trim()) return
    setSaving(true)
    try {
      await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          url: url.trim(),
          description: description.trim() || null,
          tag: tag || null,
        }),
      })
      setTitle('')
      setUrl('')
      setDescription('')
      setTag('')
      onCreated()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-lg border border-[#E8E7E3] w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-[#1A1A1A]">Save Link</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-black/5">
            <X size={16} className="text-[#888884]" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#888884] mb-1.5">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Great essay on AI agents"
              className="w-full px-3 py-2 rounded-lg border border-[#E8E7E3] text-sm focus:outline-none focus:border-[#888884] transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#888884] mb-1.5">URL *</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-lg border border-[#E8E7E3] text-sm focus:outline-none focus:border-[#888884] transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#888884] mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Why is this interesting?"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-[#E8E7E3] text-sm focus:outline-none focus:border-[#888884] transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#888884] mb-1.5">Tag</label>
            <div className="flex flex-wrap gap-2">
              {TAG_OPTIONS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTag(tag === t ? '' : t)}
                  className={[
                    'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                    tag === t
                      ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                      : 'bg-white text-[#888884] border-[#E8E7E3] hover:border-[#C8C7C3]',
                  ].join(' ')}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-[#E8E7E3] text-sm font-medium text-[#888884] hover:bg-black/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || !url.trim() || saving}
            className="flex-1 px-4 py-2 rounded-lg bg-[#1A1A1A] text-white text-sm font-medium hover:bg-[#333] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}