'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { CheckCircle2, Crosshair, Trash2, Pencil, ChevronDown, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'

interface FocusTask {
  id: string
  text: string
  completed: boolean
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export default function NeedToDoSection() {
  const [tasks, setTasks] = useState<FocusTask[]>([])
  const [loading, setLoading] = useState(true)
  const [newText, setNewText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [showArchive, setShowArchive] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/focus-tasks')
      if (res.ok) {
        const data = await res.json()
        setTasks(data)
      }
    } catch (e) {
      console.error('Failed to fetch focus tasks:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  const activeTask = tasks.find(t => !t.completed)
  const archivedTasks = tasks
    .filter(t => t.completed)
    .sort((a, b) => new Date(b.completedAt || b.updatedAt).getTime() - new Date(a.completedAt || a.updatedAt).getTime())

  const setFocus = async () => {
    const trimmed = newText.trim()
    if (!trimmed) return

    setNewText('')
    try {
      const res = await fetch('/api/focus-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      })
      if (res.ok) {
        const task = await res.json()
        // Move any current active task to completed in local state
        setTasks(prev => [
          task,
          ...prev.map(t => t.completed ? t : { ...t, completed: true, completedAt: new Date().toISOString() }),
        ])
      }
    } catch (e) {
      console.error('Failed to set focus:', e)
    }
  }

  const markComplete = async (task: FocusTask) => {
    const nowIso = new Date().toISOString()
    setTasks(prev =>
      prev.map(t => t.id === task.id ? { ...t, completed: true, completedAt: nowIso } : t)
    )

    try {
      await fetch(`/api/focus-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true }),
      })
    } catch (e) {
      console.error('Failed to complete focus task:', e)
      fetchTasks()
    }
  }

  const startEditing = (task: FocusTask) => {
    setEditingId(task.id)
    setEditingText(task.text)
  }

  const saveEdit = async () => {
    if (!editingId) return
    const trimmed = editingText.trim()
    if (!trimmed) {
      cancelEdit()
      return
    }

    setTasks(prev => prev.map(t =>
      t.id === editingId ? { ...t, text: trimmed } : t
    ))
    const id = editingId
    setEditingId(null)
    setEditingText('')

    try {
      await fetch(`/api/focus-tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      })
    } catch (e) {
      console.error('Failed to save edit:', e)
      fetchTasks()
    }
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingText('')
  }

  const deleteTask = async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))

    try {
      await fetch(`/api/focus-tasks/${id}`, { method: 'DELETE' })
    } catch (e) {
      console.error('Failed to delete focus task:', e)
      fetchTasks()
    }
  }

  if (loading) {
    return <div className="text-center py-16 text-sm text-[#888884]">Loading...</div>
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-[#1A1A1A] mb-1">Need to Do</h2>
      <p className="text-sm text-[#888884] mb-6">
        {activeTask ? 'Stay focused on your current task' : 'Set a focus task to get started'}
      </p>

      {/* Active focus task or set new */}
      {activeTask ? (
        <div className="bg-white rounded-2xl border border-[#E8E7E3] p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Crosshair size={14} className="text-[#888884]" />
            <span className="text-xs font-medium text-[#888884] uppercase tracking-wide">Current Focus</span>
          </div>

          {editingId === activeTask.id ? (
            <input
              ref={editInputRef}
              type="text"
              value={editingText}
              onChange={(e) => setEditingText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit()
                if (e.key === 'Escape') cancelEdit()
              }}
              onBlur={saveEdit}
              className="w-full text-lg font-medium text-[#1A1A1A] bg-transparent outline-none mb-4"
            />
          ) : (
            <p className="text-lg font-medium text-[#1A1A1A] mb-4 leading-relaxed">
              {activeTask.text}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => markComplete(activeTask)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 text-sm font-medium rounded-xl hover:bg-emerald-100 transition-colors"
            >
              <CheckCircle2 size={16} />
              Mark Complete
            </button>
            <button
              onClick={() => startEditing(activeTask)}
              className="p-2 text-[#888884] hover:text-[#1A1A1A] hover:bg-[#F7F6F3] rounded-lg transition-colors"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => deleteTask(activeTask.id)}
              className="p-2 text-[#888884] hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>

          <p className="text-xs text-[#A8A7A3] mt-4">
            Started {format(new Date(activeTask.createdAt), 'MMM d, yyyy')}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E8E7E3] p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Crosshair size={14} className="text-[#888884]" />
            <span className="text-xs font-medium text-[#888884] uppercase tracking-wide">Set Your Focus</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              ref={inputRef}
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setFocus()
              }}
              placeholder="What do you need to focus on?"
              className="flex-1 bg-[#F7F6F3] rounded-xl px-4 py-3 text-sm text-[#1A1A1A] placeholder:text-[#C8C7C3] outline-none border border-transparent focus:border-[#C8C7C3] transition-colors"
            />
            <button
              onClick={setFocus}
              disabled={!newText.trim()}
              className="px-5 py-3 bg-[#1A1A1A] text-white text-sm font-medium rounded-xl hover:bg-[#333] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Set Focus
            </button>
          </div>
        </div>
      )}

      {/* Set new focus when one is active */}
      {activeTask && (
        <div className="flex items-center gap-3 mb-6">
          <input
            ref={inputRef}
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setFocus()
            }}
            placeholder="Replace with a new focus..."
            className="flex-1 bg-white rounded-xl border border-[#E8E7E3] px-4 py-3 text-sm text-[#1A1A1A] placeholder:text-[#C8C7C3] outline-none focus:border-[#C8C7C3] transition-colors"
          />
          <button
            onClick={setFocus}
            disabled={!newText.trim()}
            className="px-4 py-3 bg-[#1A1A1A] text-white text-sm font-medium rounded-xl hover:bg-[#333] transition-colors disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
          >
            Set New
          </button>
        </div>
      )}

      {/* Archive */}
      {archivedTasks.length > 0 && (
        <div>
          <button
            onClick={() => setShowArchive(!showArchive)}
            className="flex items-center gap-2 text-sm text-[#888884] hover:text-[#1A1A1A] transition-colors mb-3"
          >
            {showArchive ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="font-medium">Completed ({archivedTasks.length})</span>
          </button>

          {showArchive && (
            <div className="space-y-1">
              {archivedTasks.map(task => (
                <div
                  key={task.id}
                  className="group flex items-start gap-3 bg-white/60 rounded-xl border border-[#E8E7E3] px-4 py-3"
                >
                  <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0 text-emerald-400" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-[#888884] line-through">{task.text}</span>
                    {task.completedAt && (
                      <p className="text-xs text-[#A8A7A3] mt-0.5">
                        Completed {format(new Date(task.completedAt), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-[#C8C7C3] hover:text-red-400 transition-all mt-0.5"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
