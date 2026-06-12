'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, Trash2, ChevronDown, ChevronRight, ExternalLink,
  Circle, CheckCircle2, Link as LinkIcon, X,
} from 'lucide-react'

interface ProjectSubtask {
  id: string
  projectId: string
  text: string
  completed: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

interface ProjectLink {
  id: string
  projectId: string
  url: string
  label: string | null
  createdAt: string
}

interface Project {
  id: string
  name: string
  status: string
  notes: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  subtasks: ProjectSubtask[]
  links: ProjectLink[]
}

const STATUSES = [
  { value: 'idea', label: 'Idea', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  { value: 'in_progress', label: 'In Progress', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  { value: 'paused', label: 'Paused', bg: 'bg-[#F0EFE9]', text: 'text-[#888884]', border: 'border-[#E8E7E3]' },
  { value: 'launched', label: 'Launched', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
]

function statusMeta(value: string) {
  return STATUSES.find(s => s.value === value) || STATUSES[0]
}

export default function ProjectsSection() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newSubtaskText, setNewSubtaskText] = useState<Record<string, string>>({})
  const [newLinkUrl, setNewLinkUrl] = useState<Record<string, string>>({})
  const [newLinkLabel, setNewLinkLabel] = useState<Record<string, string>>({})
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [editingNameText, setEditingNameText] = useState('')
  const newProjectInputRef = useRef<HTMLInputElement>(null)
  const editNameInputRef = useRef<HTMLInputElement>(null)
  const notesTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({})

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects')
      if (res.ok) {
        const data = await res.json()
        setProjects(data)
      }
    } catch (e) {
      console.error('Failed to fetch projects:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  useEffect(() => {
    if (showNewProject) {
      newProjectInputRef.current?.focus()
    }
  }, [showNewProject])

  useEffect(() => {
    if (editingNameId && editNameInputRef.current) {
      editNameInputRef.current.focus()
      editNameInputRef.current.select()
    }
  }, [editingNameId])

  // Cleanup notes debounce timeouts
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

  const createProject = async () => {
    const trimmed = newProjectName.trim()
    if (!trimmed) return

    setNewProjectName('')
    setShowNewProject(false)

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (res.ok) {
        const project = await res.json()
        setProjects(prev => [...prev, project])
        setExpandedIds(prev => new Set(prev).add(project.id))
      }
    } catch (e) {
      console.error('Failed to create project:', e)
    }
  }

  const updateProject = async (id: string, data: Partial<Project>) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...data } : p))

    try {
      await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    } catch (e) {
      console.error('Failed to update project:', e)
      fetchProjects()
    }
  }

  const deleteProject = async (id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id))

    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    } catch (e) {
      console.error('Failed to delete project:', e)
      fetchProjects()
    }
  }

  const handleNotesChange = (projectId: string, notes: string) => {
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, notes } : p))

    // Debounce save
    if (notesTimeoutRef.current[projectId]) {
      clearTimeout(notesTimeoutRef.current[projectId])
    }
    notesTimeoutRef.current[projectId] = setTimeout(() => {
      fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      }).catch(console.error)
    }, 800)
  }

  const addSubtask = async (projectId: string) => {
    const text = (newSubtaskText[projectId] || '').trim()
    if (!text) return

    setNewSubtaskText(prev => ({ ...prev, [projectId]: '' }))

    try {
      const res = await fetch(`/api/projects/${projectId}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (res.ok) {
        const subtask = await res.json()
        setProjects(prev => prev.map(p =>
          p.id === projectId ? { ...p, subtasks: [...p.subtasks, subtask] } : p
        ))
      }
    } catch (e) {
      console.error('Failed to add subtask:', e)
    }
  }

  const toggleSubtask = async (projectId: string, subtask: ProjectSubtask) => {
    const newCompleted = !subtask.completed
    setProjects(prev => prev.map(p =>
      p.id === projectId
        ? { ...p, subtasks: p.subtasks.map(s => s.id === subtask.id ? { ...s, completed: newCompleted } : s) }
        : p
    ))

    try {
      await fetch(`/api/projects/${projectId}/subtasks/${subtask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: newCompleted }),
      })
    } catch (e) {
      console.error('Failed to toggle subtask:', e)
      fetchProjects()
    }
  }

  const deleteSubtask = async (projectId: string, subtaskId: string) => {
    setProjects(prev => prev.map(p =>
      p.id === projectId
        ? { ...p, subtasks: p.subtasks.filter(s => s.id !== subtaskId) }
        : p
    ))

    try {
      await fetch(`/api/projects/${projectId}/subtasks/${subtaskId}`, { method: 'DELETE' })
    } catch (e) {
      console.error('Failed to delete subtask:', e)
      fetchProjects()
    }
  }

  const addLink = async (projectId: string) => {
    const url = (newLinkUrl[projectId] || '').trim()
    if (!url) return
    const label = (newLinkLabel[projectId] || '').trim() || null

    setNewLinkUrl(prev => ({ ...prev, [projectId]: '' }))
    setNewLinkLabel(prev => ({ ...prev, [projectId]: '' }))

    try {
      const res = await fetch(`/api/projects/${projectId}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, label }),
      })
      if (res.ok) {
        const link = await res.json()
        setProjects(prev => prev.map(p =>
          p.id === projectId ? { ...p, links: [...p.links, link] } : p
        ))
      }
    } catch (e) {
      console.error('Failed to add link:', e)
    }
  }

  const deleteLink = async (projectId: string, linkId: string) => {
    setProjects(prev => prev.map(p =>
      p.id === projectId
        ? { ...p, links: p.links.filter(l => l.id !== linkId) }
        : p
    ))

    try {
      await fetch(`/api/projects/${projectId}/links/${linkId}`, { method: 'DELETE' })
    } catch (e) {
      console.error('Failed to delete link:', e)
      fetchProjects()
    }
  }

  const saveNameEdit = async () => {
    if (!editingNameId) return
    const trimmed = editingNameText.trim()
    if (!trimmed) {
      setEditingNameId(null)
      setEditingNameText('')
      return
    }
    await updateProject(editingNameId, { name: trimmed })
    setEditingNameId(null)
    setEditingNameText('')
  }

  if (loading) {
    return <div className="text-center py-16 text-sm text-[#888884]">Loading...</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-[#1A1A1A] mb-1">Projects</h2>
          <p className="text-sm text-[#888884]">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowNewProject(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] text-white text-sm font-medium rounded-xl hover:bg-[#333] transition-colors"
        >
          <Plus size={14} />
          New Project
        </button>
      </div>

      {/* New project input */}
      {showNewProject && (
        <div className="flex items-center gap-3 mb-4">
          <input
            ref={newProjectInputRef}
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createProject()
              if (e.key === 'Escape') { setShowNewProject(false); setNewProjectName('') }
            }}
            placeholder="Project name..."
            className="flex-1 bg-white rounded-xl border border-[#E8E7E3] px-4 py-3 text-sm text-[#1A1A1A] placeholder:text-[#C8C7C3] outline-none focus:border-[#C8C7C3] transition-colors"
          />
          <button
            onClick={createProject}
            disabled={!newProjectName.trim()}
            className="px-4 py-3 bg-[#1A1A1A] text-white text-sm font-medium rounded-xl hover:bg-[#333] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Create
          </button>
          <button
            onClick={() => { setShowNewProject(false); setNewProjectName('') }}
            className="p-3 text-[#888884] hover:text-[#1A1A1A] transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {projects.length === 0 && !showNewProject ? (
        <div className="text-center py-16">
          <p className="text-sm text-[#888884]">No projects yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map(project => {
            const meta = statusMeta(project.status)
            const isExpanded = expandedIds.has(project.id)
            const completedCount = project.subtasks.filter(s => s.completed).length
            const totalCount = project.subtasks.length

            return (
              <div
                key={project.id}
                className="bg-white rounded-2xl border border-[#E8E7E3] overflow-hidden"
              >
                {/* Collapsed header */}
                <button
                  onClick={() => toggleExpanded(project.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-[#FAFAF8] transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown size={16} className="text-[#888884] flex-shrink-0" />
                  ) : (
                    <ChevronRight size={16} className="text-[#888884] flex-shrink-0" />
                  )}
                  <span className="flex-1 text-sm font-medium text-[#1A1A1A] truncate">
                    {project.name}
                  </span>
                  {totalCount > 0 && (
                    <span className="text-xs text-[#888884] mr-2">
                      {completedCount}/{totalCount}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${meta.bg} ${meta.text} ${meta.border}`}>
                    {meta.label}
                  </span>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-[#E8E7E3] px-5 py-4 space-y-5">
                    {/* Project name edit */}
                    <div>
                      <label className="text-xs font-medium text-[#888884] uppercase tracking-wide block mb-2">Name</label>
                      {editingNameId === project.id ? (
                        <input
                          ref={editNameInputRef}
                          type="text"
                          value={editingNameText}
                          onChange={(e) => setEditingNameText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveNameEdit()
                            if (e.key === 'Escape') { setEditingNameId(null); setEditingNameText('') }
                          }}
                          onBlur={saveNameEdit}
                          className="w-full bg-[#F7F6F3] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] outline-none border border-transparent focus:border-[#C8C7C3]"
                        />
                      ) : (
                        <p
                          onClick={() => { setEditingNameId(project.id); setEditingNameText(project.name) }}
                          className="text-sm text-[#1A1A1A] cursor-text px-3 py-2"
                        >
                          {project.name}
                        </p>
                      )}
                    </div>

                    {/* Status */}
                    <div>
                      <label className="text-xs font-medium text-[#888884] uppercase tracking-wide block mb-2">Status</label>
                      <div className="flex gap-2 flex-wrap">
                        {STATUSES.map(s => (
                          <button
                            key={s.value}
                            onClick={() => updateProject(project.id, { status: s.value })}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                              project.status === s.value
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
                      <label className="text-xs font-medium text-[#888884] uppercase tracking-wide block mb-2">Notes</label>
                      <textarea
                        value={project.notes || ''}
                        onChange={(e) => handleNotesChange(project.id, e.target.value)}
                        placeholder="Add notes about this project..."
                        rows={3}
                        className="w-full bg-[#F7F6F3] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#C8C7C3] outline-none border border-transparent focus:border-[#C8C7C3] transition-colors resize-none"
                      />
                    </div>

                    {/* Subtasks */}
                    <div>
                      <label className="text-xs font-medium text-[#888884] uppercase tracking-wide block mb-2">
                        Tasks {totalCount > 0 && `(${completedCount}/${totalCount})`}
                      </label>
                      <div className="space-y-1 mb-2">
                        {project.subtasks.map(subtask => (
                          <div
                            key={subtask.id}
                            className="group flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-[#F7F6F3] transition-colors"
                          >
                            <button
                              onClick={() => toggleSubtask(project.id, subtask)}
                              className="mt-0.5 flex-shrink-0"
                            >
                              {subtask.completed ? (
                                <CheckCircle2 size={16} className="text-emerald-400" />
                              ) : (
                                <Circle size={16} className="text-[#C8C7C3] hover:text-[#1A1A1A] transition-colors" />
                              )}
                            </button>
                            <span className={`flex-1 text-sm ${subtask.completed ? 'text-[#888884] line-through' : 'text-[#1A1A1A]'}`}>
                              {subtask.text}
                            </span>
                            <button
                              onClick={() => deleteSubtask(project.id, subtask.id)}
                              className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-[#C8C7C3] hover:text-red-400 transition-all"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newSubtaskText[project.id] || ''}
                          onChange={(e) => setNewSubtaskText(prev => ({ ...prev, [project.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addSubtask(project.id)
                          }}
                          placeholder="Add a task..."
                          className="flex-1 bg-[#F7F6F3] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#C8C7C3] outline-none border border-transparent focus:border-[#C8C7C3] transition-colors"
                        />
                        <button
                          onClick={() => addSubtask(project.id)}
                          disabled={!(newSubtaskText[project.id] || '').trim()}
                          className="p-2 text-[#888884] hover:text-[#1A1A1A] transition-colors disabled:opacity-30"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Links */}
                    <div>
                      <label className="text-xs font-medium text-[#888884] uppercase tracking-wide block mb-2">Links</label>
                      {project.links.length > 0 && (
                        <div className="space-y-1 mb-2">
                          {project.links.map(link => (
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
                                onClick={() => deleteLink(project.id, link.id)}
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
                          value={newLinkLabel[project.id] || ''}
                          onChange={(e) => setNewLinkLabel(prev => ({ ...prev, [project.id]: e.target.value }))}
                          placeholder="Label (optional)"
                          className="w-28 bg-[#F7F6F3] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#C8C7C3] outline-none border border-transparent focus:border-[#C8C7C3] transition-colors"
                        />
                        <input
                          type="text"
                          value={newLinkUrl[project.id] || ''}
                          onChange={(e) => setNewLinkUrl(prev => ({ ...prev, [project.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addLink(project.id)
                          }}
                          placeholder="https://..."
                          className="flex-1 bg-[#F7F6F3] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#C8C7C3] outline-none border border-transparent focus:border-[#C8C7C3] transition-colors"
                        />
                        <button
                          onClick={() => addLink(project.id)}
                          disabled={!(newLinkUrl[project.id] || '').trim()}
                          className="p-2 text-[#888884] hover:text-[#1A1A1A] transition-colors disabled:opacity-30"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Delete */}
                    <div className="pt-2 border-t border-[#E8E7E3]">
                      <button
                        onClick={() => deleteProject(project.id)}
                        className="flex items-center gap-2 text-xs text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={12} />
                        Delete project
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
