'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Circle, CheckCircle2 } from 'lucide-react'

interface Todo {
  id: string
  text: string
  completed: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export default function TodosPage() {
  const router = useRouter()
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
        setTodos(prev => {
          const incomplete = prev.filter(t => !t.completed)
          const complete = prev.filter(t => t.completed)
          return [...incomplete, todo, ...complete]
        })
      }
    } catch (e) {
      console.error('Failed to add todo:', e)
    }

    // Keep focus on input for rapid entry
    setTimeout(() => newInputRef.current?.focus(), 50)
  }

  const toggleTodo = async (todo: Todo) => {
    const newCompleted = !todo.completed

    // Optimistic update
    setTodos(prev => {
      const updated = prev.map(t =>
        t.id === todo.id ? { ...t, completed: newCompleted } : t
      )
      const incomplete = updated.filter(t => !t.completed)
      const complete = updated.filter(t => t.completed)
      return [...incomplete, ...complete]
    })

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
      // If empty, delete the todo
      await deleteTodo(editingId)
      setEditingId(null)
      setEditingText('')
      return
    }

    // Optimistic update
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

  const incompleteTodos = todos.filter(t => !t.completed)
  const completedTodos = todos.filter(t => t.completed)

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
        <h1 className="text-2xl font-semibold tracking-tight text-[#1A1A1A]">To-Do</h1>
        <p className="text-sm text-[#888884] mt-1">
          {incompleteTodos.length} remaining{completedTodos.length > 0 ? ` · ${completedTodos.length} completed` : ''}
        </p>
      </header>

      <main className="px-10 pb-16 max-w-2xl">
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
            {/* Incomplete todos */}
            {incompleteTodos.map((todo) => (
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
            ))}

            {/* Completed section */}
            {completedTodos.length > 0 && (
              <>
                <div className="pt-4 pb-2">
                  <span className="text-xs font-medium text-[#888884] uppercase tracking-wider">
                    Completed
                  </span>
                </div>
                {completedTodos.map((todo) => (
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
                ))}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}