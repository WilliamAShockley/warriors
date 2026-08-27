'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Horizon OS chat console — mimics the Claude Code interaction grammar:
 * flowing transcript (no bubbles), `>` user echo, `⏺` assistant blocks,
 * collapsible tool blocks, dim status lines, slash commands, Esc interrupt.
 */

type ToolItem = { kind: 'tool'; id: string; name: string; input: unknown; result?: unknown; running: boolean; open: boolean }
type Item =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; streaming?: boolean; interrupted?: boolean }
  | { kind: 'status'; text: string }
  | { kind: 'block'; text: string }
  | { kind: 'error'; text: string }
  | ToolItem

type SessionRow = { id: string; title: string; updatedAt: string }

const SLASH_COMMANDS: Array<{ cmd: string; desc: string }> = [
  { cmd: '/missions', desc: 'list missions with status' },
  { cmd: '/status', desc: '/status <mission> — progress summary' },
  { cmd: '/approvals', desc: 'pending approvals with links' },
  { cmd: '/linkedin', desc: 'LinkedIn queue state' },
  { cmd: '/new', desc: 'new chat session' },
  { cmd: '/clear', desc: 'clear viewport (session persists)' },
  { cmd: '/help', desc: 'show commands' },
]

function pad(s: unknown, n: number) {
  return String(s ?? '').slice(0, n).padEnd(n)
}

export default function Console() {
  const [items, setItems] = useState<Item[]>([
    { kind: 'status', text: 'Horizon OS console. Type a task, or /help for commands.' },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [slashOpen, setSlashOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    })
  }, [])

  const push = useCallback((item: Item) => {
    setItems((prev) => [...prev, item])
    scrollDown()
  }, [scrollDown])

  const loadSessions = useCallback(async () => {
    const res = await fetch('/api/horizon/chat/sessions').then((r) => r.json()).catch(() => null)
    if (res?.sessions) setSessions(res.sessions)
  }, [])

  useEffect(() => { loadSessions() }, [loadSessions])

  // ── Load a stored session: re-render tool blocks from content blocks ──
  const openSession = useCallback(async (id: string) => {
    const res = await fetch(`/api/horizon/chat/sessions/${id}`).then((r) => r.json()).catch(() => null)
    if (!res?.messages) return
    const rebuilt: Item[] = []
    const toolIndex = new Map<string, ToolItem>()
    for (const m of res.messages) {
      const blocks = Array.isArray(m.content) ? m.content : []
      for (const b of blocks) {
        if (m.role === 'user' && b.type === 'text') rebuilt.push({ kind: 'user', text: b.text })
        else if (m.role === 'user' && b.type === 'tool_result') {
          const t = toolIndex.get(b.tool_use_id)
          if (t) {
            t.running = false
            try { t.result = typeof b.content === 'string' ? JSON.parse(b.content) : b.content } catch { t.result = b.content }
          }
        } else if (m.role === 'assistant' && b.type === 'text') rebuilt.push({ kind: 'assistant', text: b.text })
        else if (m.role === 'assistant' && b.type === 'tool_use') {
          const t: ToolItem = { kind: 'tool', id: b.id, name: b.name, input: b.input, running: false, open: false }
          toolIndex.set(b.id, t)
          rebuilt.push(t)
        }
      }
    }
    setSessionId(id)
    setItems(rebuilt.length ? rebuilt : [{ kind: 'status', text: '(empty session)' }])
    scrollDown()
  }, [scrollDown])

  // ── Slash commands: direct DB-backed endpoints, no model call ─────────
  const runSlash = useCallback(async (raw: string) => {
    const [cmd, ...rest] = raw.trim().split(/\s+/)
    const arg = rest.join(' ')
    push({ kind: 'user', text: raw })

    const fmt = (lines: string[]) => push({ kind: 'block', text: lines.join('\n') || '(none)' })
    try {
      if (cmd === '/help') {
        fmt(SLASH_COMMANDS.map((c) => `${c.cmd.padEnd(12)} ${c.desc}`))
      } else if (cmd === '/clear') {
        setItems([{ kind: 'status', text: 'viewport cleared — session persists.' }])
      } else if (cmd === '/new') {
        setSessionId(null)
        setItems([{ kind: 'status', text: 'new session.' }])
        loadSessions()
      } else if (cmd === '/missions') {
        const res = await fetch('/api/horizon/missions').then((r) => r.json())
        fmt([
          `${pad('STATUS', 18)} ${pad('TITLE', 42)} PENDING`,
          ...res.missions.map((m: { status: string; title: string; pendingApprovals: unknown[]; id: string }) =>
            `${pad(m.status, 18)} ${pad(m.title, 42)} ${m.pendingApprovals.length ? `${m.pendingApprovals.length} approval(s)` : '-'}  [${m.id.slice(-6)}]`),
        ])
      } else if (cmd === '/status') {
        const res = await fetch('/api/horizon/missions').then((r) => r.json())
        const q = arg.toLowerCase()
        const hit = res.missions.find((m: { id: string; title: string }) =>
          m.id === arg || m.id.endsWith(arg) || m.title.toLowerCase().includes(q))
        if (!hit) { fmt([`no mission matching "${arg}"`]) }
        else {
          const d = await fetch(`/api/horizon/missions/${hit.id}`).then((r) => r.json())
          fmt([
            `${d.mission.title} — ${d.mission.status}${d.linkedinPaused ? '  [linkedin paused]' : ''}`,
            `states: ${JSON.stringify(d.report?.states ?? {})}`,
            `sends: ${d.report?.sends ?? 0}  replies: ${d.report?.replies ?? 0}  outcomes: ${JSON.stringify(d.report?.outcomes ?? {})}`,
            `pending: ${d.approvals.filter((a: { status: string }) => a.status === 'pending').map((a: { kind: string }) => a.kind).join(', ') || 'none'}`,
            `detail: /horizon/missions/${hit.id}`,
          ])
        }
      } else if (cmd === '/approvals') {
        const res = await fetch('/api/horizon/approvals').then((r) => r.json())
        fmt(res.approvals.map((a: { kind: string; mission: { title: string }; id: string }) =>
          `${pad(a.kind, 18)} ${pad(a.mission.title, 40)} /horizon/approvals?approval=${a.id}`))
      } else if (cmd === '/linkedin') {
        const res = await fetch('/api/horizon/linkedin-queue').then((r) => r.json())
        fmt([
          `${pad('STATE', 10)} ${pad('PERSON', 24)} ${pad('CH', 9)} CAMPAIGN`,
          ...res.touches.map((t: { placementState: string; person: string; channel: string; campaign: string }) =>
            `${pad(t.placementState, 10)} ${pad(t.person, 24)} ${pad(t.channel, 9)} ${t.campaign}`),
        ])
      } else {
        fmt([`unknown command ${cmd} — /help`])
      }
    } catch (err) {
      push({ kind: 'error', text: String(err) })
    }
  }, [push, loadSessions])

  // ── Send a chat turn (SSE) ────────────────────────────────────────────
  const send = useCallback(async (text: string) => {
    push({ kind: 'user', text })
    setBusy(true)
    const controller = new AbortController()
    abortRef.current = controller

    let current: { text: string } | null = null
    try {
      const res = await fetch('/api/horizon/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) throw new Error(`chat failed: ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const frames = buf.split('\n\n')
        buf = frames.pop() ?? ''
        for (const frame of frames) {
          const line = frame.split('\n').find((l) => l.startsWith('data: '))
          if (!line) continue
          const ev = JSON.parse(line.slice(6))
          if (ev.type === 'session') {
            setSessionId(ev.sessionId)
          } else if (ev.type === 'text') {
            if (!current) {
              current = { text: '' }
              setItems((prev) => [...prev, { kind: 'assistant', text: '', streaming: true }])
            }
            current.text += ev.text
            const snapshot = current.text
            setItems((prev) => {
              const next = [...prev]
              for (let i = next.length - 1; i >= 0; i--) {
                if (next[i].kind === 'assistant') { next[i] = { kind: 'assistant', text: snapshot, streaming: true }; break }
              }
              return next
            })
            scrollDown()
          } else if (ev.type === 'tool_start') {
            current = null
            push({ kind: 'tool', id: ev.id, name: ev.name, input: ev.input, running: true, open: false })
          } else if (ev.type === 'tool_result') {
            setItems((prev) => prev.map((it) =>
              it.kind === 'tool' && it.id === ev.id ? { ...it, result: ev.result, running: false } : it))
            scrollDown()
          } else if (ev.type === 'error') {
            push({ kind: 'error', text: ev.message })
          } else if (ev.type === 'done') {
            current = null
          }
        }
      }
      // finalize streaming flags
      setItems((prev) => prev.map((it) => (it.kind === 'assistant' && it.streaming ? { ...it, streaming: false } : it)))
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError'
      setItems((prev) => prev.map((it) => (it.kind === 'assistant' && it.streaming ? { ...it, streaming: false, interrupted: aborted } : it)))
      if (aborted) push({ kind: 'status', text: '⎋ interrupted.' })
      else push({ kind: 'error', text: String(err) })
    } finally {
      setBusy(false)
      abortRef.current = null
      loadSessions()
    }
  }, [push, sessionId, scrollDown, loadSessions])

  const submit = useCallback(() => {
    const text = input.trim()
    if (!text) return
    setInput('')
    setSlashOpen(false)
    if (text.startsWith('/')) runSlash(text)
    else send(text)
  }, [input, runSlash, send])

  // Esc interrupts a running turn.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && abortRef.current) abortRef.current.abort()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const slashMatches = input.startsWith('/')
    ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(input.split(' ')[0]))
    : []

  return (
    <div className="flex h-full min-h-0">
      {/* session sidebar */}
      {sidebarOpen && (
        <aside className="w-56 shrink-0 border-r border-[#22262c] overflow-y-auto p-2 text-[12px]">
          <button
            className="w-full mb-2 border border-[#2c313a] rounded px-2 py-1 text-left text-[#9aa0ab] hover:text-[#e6e8ec]"
            onClick={() => { setSessionId(null); setItems([{ kind: 'status', text: 'new session.' }]) }}
          >
            + new session
          </button>
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => openSession(s.id)}
              className={`block w-full truncate text-left px-2 py-1 rounded hover:bg-[#181b20] ${s.id === sessionId ? 'text-[#e8b04b]' : 'text-[#9aa0ab]'}`}
              title={s.title}
            >
              {s.title}
            </button>
          ))}
        </aside>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* transcript */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 leading-relaxed text-[13px]">
          {items.map((item, i) => {
            if (item.kind === 'user') return (
              <div key={i} className="mt-3 whitespace-pre-wrap text-[#7d94c0]"><span className="text-[#565c66]">&gt; </span>{item.text}</div>
            )
            if (item.kind === 'assistant') return (
              <div key={i} className="mt-2 whitespace-pre-wrap">
                <span className="text-[#4f9e64]">⏺ </span>
                {item.text}
                {item.streaming && <span className="animate-pulse text-[#565c66]">▌</span>}
                {item.interrupted && <span className="text-[#c66] text-[11px]"> [interrupted]</span>}
              </div>
            )
            if (item.kind === 'status') return (
              <div key={i} className="mt-2 text-[#565c66] text-[12px]">{item.text}</div>
            )
            if (item.kind === 'block') return (
              <pre key={i} className="mt-2 whitespace-pre-wrap text-[12px] text-[#aeb4bd] bg-[#12151a] border border-[#1d2127] rounded p-2 overflow-x-auto">{item.text}</pre>
            )
            if (item.kind === 'error') return (
              <div key={i} className="mt-2 text-[#d16a6a] text-[12px]">✗ {item.text}</div>
            )
            // tool block — Claude Code style: one-line summary, click to expand
            return (
              <div key={i} className="mt-2">
                <button
                  className="text-left w-full"
                  onClick={() => setItems((prev) => prev.map((it) => it === item ? { ...it, open: !item.open } : it))}
                >
                  <span className={item.running ? 'text-[#e8b04b]' : 'text-[#565c66]'}>
                    {item.running ? '◐ ' : '⏺ '}
                  </span>
                  <span className="text-[#8fa3c0]">{item.name}</span>
                  <span className="text-[#565c66]">({JSON.stringify(item.input)?.slice(0, 80)})</span>
                  {item.running
                    ? <span className="text-[#565c66] text-[11px]"> running…</span>
                    : <span className="text-[#565c66] text-[11px]"> {item.open ? '▾' : '▸'} done</span>}
                </button>
                {item.open && (
                  <pre className="mt-1 ml-4 whitespace-pre-wrap text-[11px] text-[#8a919c] bg-[#12151a] border border-[#1d2127] rounded p-2 overflow-x-auto">
{`input:  ${JSON.stringify(item.input, null, 1)}
result: ${JSON.stringify(item.result ?? null, null, 1)}`}
                  </pre>
                )}
              </div>
            )
          })}
          {busy && <div className="mt-2 text-[#565c66] text-[12px] animate-pulse">⏺ working…</div>}
        </div>

        {/* input bar */}
        <div className="relative border-t border-[#22262c] p-2 shrink-0">
          {slashOpen && slashMatches.length > 0 && (
            <div className="absolute bottom-full left-2 mb-1 w-96 bg-[#14171c] border border-[#2c313a] rounded shadow-xl text-[12px]">
              {slashMatches.map((c) => (
                <button
                  key={c.cmd}
                  className="block w-full text-left px-3 py-1.5 hover:bg-[#1b1f26]"
                  onClick={() => { setInput(c.cmd + ' '); setSlashOpen(false); inputRef.current?.focus() }}
                >
                  <span className="text-[#e8b04b]">{c.cmd}</span>
                  <span className="text-[#565c66] ml-3">{c.desc}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-start gap-2">
            <button className="text-[#565c66] text-[12px] pt-1.5" onClick={() => setSidebarOpen((v) => !v)} title="toggle sessions">☰</button>
            <span className="text-[#565c66] pt-1">&gt;</span>
            <textarea
              ref={inputRef}
              value={input}
              rows={1}
              placeholder={busy ? 'esc to interrupt…' : 'task or /command'}
              className="flex-1 resize-none bg-transparent outline-none text-[13px] placeholder-[#3d434c] max-h-40"
              style={{ height: 'auto' }}
              onChange={(e) => {
                setInput(e.target.value)
                setSlashOpen(e.target.value.startsWith('/'))
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!busy) submit() }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
