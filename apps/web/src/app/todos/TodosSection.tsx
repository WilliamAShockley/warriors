'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Plus, Trash2, Circle, CheckCircle2 } from 'lucide-react'
import { startOfToday, startOfWeek, startOfMonth } from 'date-fns'

interface Todo {
  id: string
  text: string
  completed: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

const BUCKETS = ['Today', 'This Week', 'This Month', 'Older'] as const
type Bucket = (typeof BUCKETS)[number]

function bucketFor(iso: string, today: number, weekStart: number, monthStart: number): Bucket {
  const t = new Date(iso).getTime()
  if (t >= today) return 'Today'
  if (t >= weekStart) return 'This Week'
  if (t >= monthStart) return 'This Month'
  return 'Older'
}

function groupByBucket(todos: Todo[], dateField: 'createdAt' | 'updatedAt'): Map<Bucket, Todo[]> {
  const today = startOfToday().getTime()
  const weekStart = startOfWeek(new Date()).getTime()
  const monthStart = startOfMonth(new Date()).getTime()
  const groups = new Map<Bucket, Todo[]>()
  for (const todo of todos) {
    const b = bucketFor(todo[dateField], today, weekStart, monthStart)
    const arr = groups.get(b) ?? []
    arr.push(todo)
    groups.set(b, arr)
  }
  return groups
}

export default function TodosSection() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [newText, setNewText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const newInputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  const fetchTodos = useCallback(async () => {
    try {
      const res = await fetch('/api/todos')
      if (res.ok) {
        const data = await res.json()
        setTodos(data)
      }
    } catch (e) {
      console.error('Failed to fetch todos:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTodos()
  }, [fetchTodos])

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  const addTodo = async () => {
    const trimmed = newText.trim()
    if (!trimmed) return

    setNewText('')
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      })
      if (res.ok) {
        const todo = await res.json()
        setTodos(prev => [todo, ...prev])
      }
    } catch (e) {
      console.error('Failed to add todo:', e)
    }

    setTimeout(() => newInputRef.current?.focus(), 50)
  }

  const toggleTodo = async (todo: Todo) => {
    const newCompleted = !todo.completed
    const nowIso = new Date().toISOString()
    setTodos(prev =>
      prev.map(t =>
        t.id === todo.id ? { ...t, completed: newCompleted, updatedAt: nowIso } : t
      )
    )

    try {
      await fetch(`/api/todos/${todo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: newCompleted }),
      })
    } catch (e) {
      console.error('Failed to toggle todo:', e)
      fetchTodos()
    }
  }

  const startEditing = (todo: Todo) => {
    setEditingId(todo.id)
    setEditingText(todo.text)
  }

  const saveEdit = async () => {
    if (!editingId) return
    const trimmed = editingText.trim()

    if (!trimmed) {
      await deleteTodo(editingId)
      setEditingId(null)
      setEditingText('')
      return
    }

    setTodos(prev => prev.map(t =>
      t.id === editingId ? { ...t, text: trimmed } : t
    ))
    setEditingId(null)
    setEditingText('')

    try {
      await fetch(`/api/todos/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      })
    } catch (e) {
      console.error('Failed to save edit:', e)
      fetchTodos()
    }
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingText('')
  }

  const deleteTodo = async (id: string) => {
    setTodos(prev => prev.filter(t => t.id !== id))

    try {
      await fetch(`/api/todos/${id}`, { method: 'DELETE' })
    } catch (e) {
      console.error('Failed to delete todo:', e)
      fetchTodos()
    }
  }

  const incompleteTodos = useMemo(
    () =>
      todos
        .filter(t => !t.completed)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [todos],
  )
  const completedTodos = useMemo(
    () =>
      todos
        .filter(t => t.completed)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [todos],
  )
  const incompleteGroups = useMemo(() => groupByBucket(incompleteTodos, 'createdAt'), [incompleteTodos])
  const completedGroups = useMemo(() => groupByBucket(completedTodos, 'updatedAt'), [completedTodos])

  const renderIncomplete = (todo: Todo) => (
    <div
      key={todo.id}
      className="group flex items-start gap-3 bg-white rounded-xl border border-[#E8E7E3] px-4 py-3 hover:border-[#C8C7C3] transition-all"
    >
      <button
        onClick={() => toggleTodo(todo)}
        className="mt-0.5 flex-shrink-0 text-[#C8C7C3] hover:text-[#1A1A1A] transition-colors"
      >
        <Circle size={18} />
      </button>

      {editingId === todo.id ? (
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
          className="flex-1 bg-transparent text-sm text-[#1A1A1A] outline-none"
        />
      ) : (
        <span
          onClick={() => startEditing(todo)}
          className="flex-1 text-sm text-[#1A1A1A] cursor-text leading-snug pt-0.5"
        >
          {todo.text}
        </span>
      )}

      <button
        onClick={() => deleteTodo(todo.id)}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-[#C8C7C3] hover:text-red-400 transition-all mt-0.5"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )

  const renderCompleted = (todo: Todo) => (
    <div
      key={todo.id}
      className="group flex items-start gap-3 bg-white/60 rounded-xl border border-[#E8E7E3] px-4 py-3 hover:border-[#C8C7C3] transition-all"
    >
      <button
        onClick={() => toggleTodo(todo)}
        className="mt-0.5 flex-shrink-0 text-[#888884] hover:text-[#1A1A1A] transition-colors"
      >
        <CheckCircle2 size={18} />
      </button>

      {editingId === todo.id ? (
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
          className="flex-1 bg-transparent text-sm text-[#888884] line-through outline-none"
        />
      ) : (
        <span
          onClick={() => startEditing(todo)}
          className="flex-1 text-sm text-[#888884] line-through cursor-text leading-snug pt-0.5"
        >
          {todo.text}
        </span>
      )}

      <button
        onClick={() => deleteTodo(todo.id)}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-[#C8C7C3] hover:text-red-400 transition-all mt-0.5"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )

  const renderBucketLabel = (label: string) => (
    <div className="pt-4 pb-2">
      <span className="text-xs font-medium text-[#888884] uppercase tracking-wider">
        {label}
      </span>
    </div>
  )

  return (
    <div>
      <h2 className="text-lg font-semibold text-[#1A1A1A] mb-1">To-Do&apos;s</h2>
      <p className="text-sm text-[#888884] mb-4">
        {incompleteTodos.length} remaining{completedTodos.length > 0 ? ` · ${completedTodos.length} completed` : ''}
      </p>

      {/* New todo input */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 flex items-center gap-3 bg-white rounded-xl border border-[#E8E7E3] px-4 py-3 focus-within:border-[#C8C7C3] transition-colors">
          <Plus size={16} className="text-[#888884] flex-shrink-0" />
          <input
            ref={newInputRef}
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addTodo()
            }}
            placeholder="Add a to-do..."
            className="flex-1 bg-transparent text-sm text-[#1A1A1A] placeholder:text-[#C8C7C3] outline-none"
          />
        </div>
        <button
          onClick={addTodo}
          disabled={!newText.trim()}
          className="px-4 py-3 bg-[#1A1A1A] text-white text-sm font-medium rounded-xl hover:bg-[#333] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-sm text-[#888884]">Loading...</div>
      ) : todos.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-[#888884]">No to-dos yet. Add one above to get started.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {BUCKETS.map(bucket => {
            const group = incompleteGroups.get(bucket)
            if (!group || group.length === 0) return null
            return (
              <div key={`inc-${bucket}`}>
                {renderBucketLabel(bucket)}
                {group.map(renderIncomplete)}
              </div>
            )
          })}

          {completedTodos.length > 0 && (
            <>
              {renderBucketLabel('Completed')}
              {BUCKETS.map(bucket => {
                const group = completedGroups.get(bucket)
                if (!group || group.length === 0) return null
                return (
                  <div key={`done-${bucket}`}>
                    <div className="pt-2 pb-1 pl-1">
                      <span className="text-[11px] font-medium text-[#A8A7A3] uppercase tracking-wider">
                        {bucket}
                      </span>
                    </div>
                    {group.map(renderCompleted)}
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
