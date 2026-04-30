'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Plus,
  ExternalLink,
  Trash2,
  FolderIcon,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  FolderPlus,
  X,
  ChevronRight,
} from 'lucide-react'
import AddContentLinkModal from '@/components/AddContentLinkModal'

interface Folder {
  id: string
  name: string
  _count: { links: number }
}

interface ContentLink {
  id: string
  title: string
  url: string
  description: string | null
  tag: string | null
  folderId: string | null
  folder: { id: string; name: string } | null
  createdAt: string
}

export default function ContentPage() {
  const router = useRouter()
  const [links, setLinks] = useState<ContentLink[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null) // null = all, 'unfiled' = no folder, or folder id
  const [showAddModal, setShowAddModal] = useState(false)
  const [loading, setLoading] = useState(true)

  // Folder management state
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [editingFolder, setEditingFolder] = useState<string | null>(null)
  const [editFolderName, setEditFolderName] = useState('')
  const [folderMenuOpen, setFolderMenuOpen] = useState<string | null>(null)

  // Move link state
  const [movingLink, setMovingLink] = useState<string | null>(null)

  const fetchFolders = useCallback(async () => {
    const res = await fetch('/api/content/folders')
    const data = await res.json()
    setFolders(data)
  }, [])

  const fetchLinks = useCallback(async () => {
    const params = new URLSearchParams()
    if (selectedFolder === 'unfiled') {
      params.set('folderId', 'unfiled')
    } else if (selectedFolder) {
      params.set('folderId', selectedFolder)
    }
    const res = await fetch(`/api/content?${params}`)
    const data = await res.json()
    setLinks(data)
  }, [selectedFolder])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchFolders(), fetchLinks()]).finally(() => setLoading(false))
  }, [fetchFolders, fetchLinks])

  async function handleDelete(id: string) {
    await fetch(`/api/content/${id}`, { method: 'DELETE' })
    fetchLinks()
    fetchFolders()
  }

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault()
    if (!newFolderName.trim()) return
    await fetch('/api/content/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolderName.trim() }),
    })
    setNewFolderName('')
    setShowNewFolder(false)
    fetchFolders()
  }

  async function handleRenameFolder(id: string) {
    if (!editFolderName.trim()) return
    await fetch(`/api/content/folders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editFolderName.trim() }),
    })
    setEditingFolder(null)
    setEditFolderName('')
    fetchFolders()
    fetchLinks()
  }

  async function handleDeleteFolder(id: string) {
    await fetch(`/api/content/folders/${id}`, { method: 'DELETE' })
    if (selectedFolder === id) setSelectedFolder(null)
    setFolderMenuOpen(null)
    fetchFolders()
    fetchLinks()
  }

  async function handleMoveLink(linkId: string, folderId: string | null) {
    await fetch(`/api/content/${linkId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId }),
    })
    setMovingLink(null)
    fetchLinks()
    fetchFolders()
  }

  function handleCreated() {
    fetchLinks()
    fetchFolders()
  }

  const totalLinks = folders.reduce((sum, f) => sum + f._count.links, 0)

  return (
    <div className="min-h-screen bg-[#F7F6F3]">
      <header className="px-10 pt-12 pb-6">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-sm text-[#888884] hover:text-[#1A1A1A] mb-4 transition-colors"
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#1A1A1A]">Content</h1>
            <p className="text-sm text-[#888884] mt-1">
              Interesting links and resources organized by topic
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] text-white text-sm rounded-lg hover:bg-[#333] transition-colors"
          >
            <Plus size={14} />
            Add Link
          </button>
        </div>
      </header>

      <main className="px-10 pb-10">
        <div className="flex gap-6 max-w-6xl">
          {/* Folder sidebar */}
          <div className="w-56 flex-shrink-0">
            <div className="bg-white rounded-2xl border border-[#E8E7E3] overflow-hidden">
              <div className="p-3 border-b border-[#E8E7E3] flex items-center justify-between">
                <span className="text-xs font-medium text-[#888884] uppercase tracking-wide">
                  Folders
                </span>
                <button
                  onClick={() => setShowNewFolder(true)}
                  className="p-1 hover:bg-[#F7F6F3] rounded transition-colors"
                  title="New folder"
                >
                  <FolderPlus size={14} className="text-[#888884]" />
                </button>
              </div>

              <div className="p-1">
                {/* All links */}
                <button
                  onClick={() => setSelectedFolder(null)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                    selectedFolder === null
                      ? 'bg-[#F7F6F3] text-[#1A1A1A] font-medium'
                      : 'text-[#888884] hover:bg-[#F7F6F3] hover:text-[#1A1A1A]'
                  }`}
                >
                  <FolderOpen size={14} />
                  <span className="flex-1">All</span>
                  <span className="text-xs text-[#888884]">{links.length > 0 || !loading ? '' : ''}</span>
                </button>

                {/* Unfiled */}
                <button
                  onClick={() => setSelectedFolder('unfiled')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                    selectedFolder === 'unfiled'
                      ? 'bg-[#F7F6F3] text-[#1A1A1A] font-medium'
                      : 'text-[#888884] hover:bg-[#F7F6F3] hover:text-[#1A1A1A]'
                  }`}
                >
                  <FolderIcon size={14} />
                  <span className="flex-1">Unfiled</span>
                </button>

                {/* Folder list */}
                {folders.map((folder) => (
                  <div key={folder.id} className="relative group">
                    {editingFolder === folder.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          handleRenameFolder(folder.id)
                        }}
                        className="flex items-center gap-1 px-2 py-1"
                      >
                        <input
                          type="text"
                          value={editFolderName}
                          onChange={(e) => setEditFolderName(e.target.value)}
                          className="flex-1 px-2 py-1 text-sm border border-[#E8E7E3] rounded focus:outline-none focus:border-[#C8C7C3]"
                          autoFocus
                          onBlur={() => {
                            if (editFolderName.trim()) handleRenameFolder(folder.id)
                            else setEditingFolder(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditingFolder(null)
                          }}
                        />
                      </form>
                    ) : (
                      <button
                        onClick={() => setSelectedFolder(folder.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                          selectedFolder === folder.id
                            ? 'bg-[#F7F6F3] text-[#1A1A1A] font-medium'
                            : 'text-[#888884] hover:bg-[#F7F6F3] hover:text-[#1A1A1A]'
                        }`}
                      >
                        <FolderIcon size={14} />
                        <span className="flex-1 truncate">{folder.name}</span>
                        <span className="text-xs text-[#888884]">{folder._count.links}</span>
                        <div
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation()
                            setFolderMenuOpen(folderMenuOpen === folder.id ? null : folder.id)
                          }}
                        >
                          <MoreHorizontal size={14} className="text-[#888884]" />
                        </div>
                      </button>
                    )}

                    {/* Folder context menu */}
                    {folderMenuOpen === folder.id && (
                      <div className="absolute right-0 top-8 z-20 bg-white border border-[#E8E7E3] rounded-lg shadow-lg py-1 w-32">
                        <button
                          onClick={() => {
                            setEditingFolder(folder.id)
                            setEditFolderName(folder.name)
                            setFolderMenuOpen(null)
                          }}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-[#F7F6F3] flex items-center gap-2"
                        >
                          <Pencil size={12} />
                          Rename
                        </button>
                        <button
                          onClick={() => handleDeleteFolder(folder.id)}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-[#F7F6F3] flex items-center gap-2 text-red-600"
                        >
                          <Trash2 size={12} />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {/* New folder inline form */}
                {showNewFolder && (
                  <form onSubmit={handleCreateFolder} className="flex items-center gap-1 px-2 py-1">
                    <FolderPlus size={14} className="text-[#888884] flex-shrink-0" />
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Folder name"
                      className="flex-1 px-2 py-1 text-sm border border-[#E8E7E3] rounded focus:outline-none focus:border-[#C8C7C3]"
                      autoFocus
                      onBlur={() => {
                        if (!newFolderName.trim()) setShowNewFolder(false)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setShowNewFolder(false)
                          setNewFolderName('')
                        }
                      }}
                    />
                  </form>
                )}
              </div>
            </div>
          </div>

          {/* Main content area */}
          <div className="flex-1">
            {loading ? (
              <p className="text-sm text-[#888884]">Loading…</p>
            ) : links.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E8E7E3] p-10 text-center">
                <p className="text-sm text-[#888884]">
                  {selectedFolder && selectedFolder !== 'unfiled'
                    ? 'No links in this folder yet'
                    : selectedFolder === 'unfiled'
                    ? 'No unfiled links'
                    : 'No links saved yet'}
                </p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-3 text-sm text-[#1A1A1A] underline underline-offset-2 hover:no-underline"
                >
                  Add your first link
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {links.map((link) => (
                  <div
                    key={link.id}
                    className="bg-white rounded-xl border border-[#E8E7E3] p-4 hover:border-[#C8C7C3] transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-sm text-[#1A1A1A] hover:underline truncate"
                          >
                            {link.title}
                          </a>
                          <ExternalLink size={12} className="text-[#888884] flex-shrink-0" />
                        </div>
                        {link.description && (
                          <p className="text-sm text-[#888884] mb-1">{link.description}</p>
                        )}
                        <div className="flex items-center gap-2 text-xs text-[#888884]">
                          {link.tag && (
                            <span className="px-2 py-0.5 bg-[#F7F6F3] rounded-full">{link.tag}</span>
                          )}
                          {link.folder && selectedFolder === null && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-[#F7F6F3] rounded-full">
                              <FolderIcon size={10} />
                              {link.folder.name}
                            </span>
                          )}
                          <span>{new Date(link.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        {/* Move to folder */}
                        <div className="relative">
                          <button
                            onClick={() => setMovingLink(movingLink === link.id ? null : link.id)}
                            className="p-1.5 hover:bg-[#F7F6F3] rounded-lg transition-colors"
                            title="Move to folder"
                          >
                            <FolderIcon size={14} className="text-[#888884]" />
                          </button>
                          {movingLink === link.id && (
                            <div className="absolute right-0 top-8 z-20 bg-white border border-[#E8E7E3] rounded-lg shadow-lg py-1 w-40">
                              <button
                                onClick={() => handleMoveLink(link.id, null)}
                                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[#F7F6F3] ${
                                  !link.folderId ? 'font-medium' : ''
                                }`}
                              >
                                No folder
                              </button>
                              {folders.map((f) => (
                                <button
                                  key={f.id}
                                  onClick={() => handleMoveLink(link.id, f.id)}
                                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[#F7F6F3] flex items-center gap-2 ${
                                    link.folderId === f.id ? 'font-medium' : ''
                                  }`}
                                >
                                  <FolderIcon size={12} />
                                  {f.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleDelete(link.id)}
                          className="p-1.5 hover:bg-[#F7F6F3] rounded-lg transition-colors"
                        >
                          <Trash2 size={14} className="text-[#888884]" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <AddContentLinkModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={handleCreated}
        defaultFolderId={selectedFolder && selectedFolder !== 'unfiled' ? selectedFolder : null}
      />

      {/* Click-away handler for menus */}
      {(folderMenuOpen || movingLink) && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => {
            setFolderMenuOpen(null)
            setMovingLink(null)
          }}
        />
      )}
    </div>
  )
}