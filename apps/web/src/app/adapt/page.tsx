'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Wand2, ChevronDown, ChevronUp, Check, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type Change = {
  file: string
  description: string
  content: string
}

type Message =
  | { role: 'user'; content: string }
  | { role: 'assistant'; summary: string; changes: Change[]; applied?: boolean; error?: string }
  | { role: 'thinking' }

export default function AdaptPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [expandedChanges, setExpandedChanges] = useState<Record<number, boolean>>({})
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Build history for multi-turn context
  function buildHistory(upTo: number) {
    return messages
      .slice(0, upTo)
      .filter((m): m is Extract<Message, { role: 'user' | 'assistant' }> =>
        m.role === 'user' || m.role === 'assistant'
      )
      .map((m) => ({
        role: m.role,
        content: m.role === 'user' ? m.content : m.summary,
      }))
  }

  async function send() {
    const req = input.trim()
    if (!req || loading) return

    setInput('')
    setLoading(true)

    const userMsg: Message = { role: 'user', content: req }
    const thinkingMsg: Message = { role: 'thinking' }
    setMessages((prev) => [...prev, userMsg, thinkingMsg])

    try {
      const res = await fetch('/api/adapt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: req, history: buildHistory(messages.length) }),
      })
      const data = await res.json()

      setMessages((prev) => {
        const next = prev.filter((m) => m.role !== 'thinking')
        return [
          ...next,
          {
            role: 'assistant',
            summary: data.summary ?? data.error ?? 'Something went wrong.',
            changes: data.changes ?? [],
          },
        ]
      })
    } catch (err) {
      setMessages((prev) => {
        const next = prev.filter((m) => m.role !== 'thinking')
        return [
          ...next,
          { role: 'assistant', summary: `Error: ${String(err)}`, changes: [] },
        ]
      })
    } finally {
      setLoading(false)
    }
  }

  async function applyChanges(msgIndex: number, changes: Change[]) {
    const res = await fetch('/api/adapt/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes }),
    })
    const data = await res.json()
    const allOk = data.results.every((r: { ok: boolean }) => r.ok)

    setMessages((prev) =>
      prev.map((m, i) =>
        i === msgIndex && m.role === 'assistant'
          ? { ...m, applied: true, error: allOk ? undefined : 'Some files failed to write.' }
          : m
      )
    )
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

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
        <div className="flex items-center gap-2">
          <Wand2 size={16} className="text-[#888884]" />
          <h1 className="text-lg font-semibold text-[#1A1A1A]">Adapt</h1>
        </div>
        <span className="text-sm text-[#888884]">— modify this app in plain language</span>
      </div>

      <div className="border-b border-[#E8E7E3] mx-8" />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
        {messages.length === 0 && (
          <div className="max-w-2xl space-y-3">
            <p className="text-sm text-[#888884]">
              Describe a feature or change and it will be written directly into the app.
              Next.js hot reload picks it up instantly.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                'Add a button to send an email directly from a target\'s page',
                'Show a "days since last contact" badge on each target in the list',
                'Add a notes field to the Log Activity modal',
                'Add a keyboard shortcut to open the Add Target modal',
              ].map((example) => (
                <button
                  key={example}
                  onClick={() => setInput(example)}
                  className="text-left text-xs text-[#888884] bg-white border border-[#E8E7E3] rounded-xl px-4 py-3 hover:border-[#C8C7C3] transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === 'thinking') {
            return (
              <div key={i} className="flex items-center gap-2 text-sm text-[#888884]">
                <Loader2 size={13} className="animate-spin" />
                Reading codebase and planning changes...
              </div>
            )
          }

          if (msg.role === 'user') {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-xl bg-[#1A1A1A] text-white text-sm rounded-2xl rounded-br-md px-4 py-3">
                  {msg.content}
                </div>
              </div>
            )
          }

          // Assistant message
          const expanded = expandedChanges[i] ?? false
          return (
            <div key={i} className="max-w-2xl space-y-3">
              {/* Summary */}
              <div className="bg-white border border-[#E8E7E3] rounded-2xl p-5">
                <p className="text-sm text-[#1A1A1A] leading-relaxed">{msg.summary}</p>
              </div>

              {/* Changes */}
              {msg.changes.length > 0 && (
                <div className="bg-white border border-[#E8E7E3] rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setExpandedChanges((s) => ({ ...s, [i]: !expanded }))}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#F7F6F3] transition-colors"
                  >
                    <span className="text-xs font-medium text-[#888884] uppercase tracking-wide">
                      {msg.changes.length} file{msg.changes.length !== 1 ? 's' : ''} to change
                    </span>
                    {expanded ? <ChevronUp size={14} className="text-[#888884]" /> : <ChevronDown size={14} className="text-[#888884]" />}
                  </button>

                  {expanded && (
                    <div className="border-t border-[#E8E7E3]">
                      {msg.changes.map((change, ci) => (
                        <div key={ci} className="px-5 py-3 border-b border-[#F0EFE9] last:border-0">
                          <p className="text-xs font-mono text-[#888884] mb-0.5">{change.file}</p>
                          <p className="text-xs text-[#B0AFAB]">{change.description}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Apply */}
                  <div className="px-5 py-3 border-t border-[#E8E7E3] flex items-center justify-between">
                    {msg.error && (
                      <span className="flex items-center gap-1 text-xs text-red-500">
                        <AlertCircle size={12} /> {msg.error}
                      </span>
                    )}
                    {msg.applied ? (
                      <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                        <Check size={13} /> Applied — hot reload in progress
                      </span>
                    ) : (
                      <button
                        onClick={() => applyChanges(i, msg.changes)}
                        className={cn(
                          'ml-auto text-xs bg-[#1A1A1A] text-white px-4 py-1.5 rounded-lg hover:bg-[#333] transition-colors'
                        )}
                      >
                        Apply changes
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-8 pb-8">
        <div className="max-w-2xl">
          <div className="bg-white border border-[#E8E7E3] rounded-2xl flex items-end gap-3 px-4 py-3 focus-within:border-[#C8C7C3] transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Describe a feature or change..."
              rows={1}
              className="flex-1 text-sm bg-transparent outline-none resize-none text-[#1A1A1A] placeholder:text-[#C8C7C3] leading-relaxed"
              style={{ minHeight: '24px', maxHeight: '120px' }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="flex-shrink-0 bg-[#1A1A1A] text-white p-2 rounded-lg hover:bg-[#333] disabled:opacity-40 transition-colors"
            >
              <Wand2 size={14} />
            </button>
          </div>
          <p className="text-xs text-[#B0AFAB] mt-2 pl-1">Enter to send · Shift+Enter for newline</p>
        </div>
      </div>
    </div>
  )
}
