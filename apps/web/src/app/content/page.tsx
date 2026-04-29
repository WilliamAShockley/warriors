'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, ExternalLink, Trash2, LinkIcon } from 'lucide-react'
import AddContentLinkModal from '@/components/AddContentLinkModal'

interface ContentLink {
  id: string
  title: string
  url: string
  description: string | null
  tag: string | null
  createdAt: string
}

const TAG_COLORS: Record<string, string> = {
  Article: 'bg-blue-50 text-blue-600 border-blue-100',
  Thread: 'bg-purple-50 text-purple-600 border-purple-100',
  Video: 'bg-red-50 text-red-600 border-red-100',
  Podcast: 'bg-green-50 text-green-600 border-green-100',
  Tool: 'bg-amber-50 text-amber-600 border-amber-100',
  Research: 'bg-cyan-50 text-cyan-600 border-cyan-100',
  Other: 'bg-gray-50 text-gray-500 border-gray-100',
}

export default function ContentPage() {
  const router = useRouter()
  const [links, setLinks] = useState<ContentLink[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch('/api/content')
      if (res.ok) {
        const data = await res.json()
        setLinks(data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLinks()
  }, [fetchLinks])

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await fetch(`/api/content/${id}`, { method: 'DELETE' })
      setLinks((prev) => prev.filter((l) => l.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  const allTags = Array.from(new Set(links.map((l) => l.tag).filter(Boolean))) as string[]
  const filteredLinks = filterTag ? links.filter((l) => l.tag === filterTag) : links

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '')
    } catch {
      return url
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F6F3]">
      <header className="px-10 pt-12 pb-6">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-sm text-[#888884] hover:text-[#1A1A1A] transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Home
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#1A1A1A]">Content</h1>
            <p className="text-sm text-[#888884] mt-1">
              {links.length} saved link{links.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1A1A1A] text-white text-sm font-medium hover:bg-[#333] transition-colors"
          >
            <Plus size={14} />
            Save Link
          </button>
        </div>
      </header>

      <main className="px-10 pb-10">
        {/* Tag filters */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setFilterTag(null)}
              className={[
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                !filterTag
                  ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                  : 'bg-white text-[#888884] border-[#E8E7E3] hover:border-[#C8C7C3]',
              ].join(' ')}
            >
              All
            </button>
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setFilterTag(filterTag === t ? null : t)}
                className={[
                  'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                  filterTag === t
                    ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                    : 'bg-white text-[#888884] border-[#E8E7E3] hover:border-[#C8C7C3]',
                ].join(' ')}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-[#888884] py-20 text-center">Loading…</div>
        ) : filteredLinks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 rounded-2xl bg-white border border-[#E8E7E3] flex items-center justify-center mb-4">
              <LinkIcon size={20} className="text-[#888884]" />
            </div>
            <p className="text-sm text-[#888884] mb-4">
              {filterTag ? `No links tagged "${filterTag}"` : 'No links saved yet'}
            </p>
            {!filterTag && (
              <button
                onClick={() => setShowModal(true)}
                className="px-4 py-2 rounded-lg bg-[#1A1A1A] text-white text-sm font-medium hover:bg-[#333] transition-colors"
              >
                Save your first link
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredLinks.map((link) => (
              <div
                key={link.id}
                className="group bg-white rounded-xl border border-[#E8E7E3] p-5 hover:border-[#C8C7C3] hover:shadow-sm transition-all duration-150"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 font-medium text-sm text-[#1A1A1A] hover:underline leading-snug"
                  >
                    {link.title}
                  </a>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
                    >
                      <ExternalLink size={13} className="text-[#888884]" />
                    </a>
                    <button
                      onClick={() => handleDelete(link.id)}
                      disabled={deletingId === link.id}
                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={13} className={deletingId === link.id ? 'text-[#C8C7C3]' : 'text-[#888884] hover:text-red-500'} />
                    </button>
                  </div>
                </div>

                {link.description && (
                  <p className="text-xs text-[#888884] leading-relaxed mb-3 line-clamp-2">
                    {link.description}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-auto">
                  {link.tag && (
                    <span
                      className={[
                        'px-2 py-0.5 rounded-full text-[10px] font-medium border',
                        TAG_COLORS[link.tag] || TAG_COLORS.Other,
                      ].join(' ')}
                    >
                      {link.tag}
                    </span>
                  )}
                  <span className="text-[10px] text-[#B0AFAB]">
                    {getDomain(link.url)}
                  </span>
                  <span className="text-[10px] text-[#B0AFAB] ml-auto">
                    {new Date(link.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <AddContentLinkModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={fetchLinks}
      />
    </div>
  )
}