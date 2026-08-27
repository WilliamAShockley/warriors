'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, X } from 'lucide-react'

/**
 * OG — the drafting diagnostic bench. Drop in a company name (tab 1) or a
 * company URL (tab 2); each run researches the target, generates a structured
 * touch-1 draft through the shared engine, and lands as a row whose columns
 * are verifiable checks. Every row expands to its raw JSON evidence.
 */

type Mode = 'name' | 'url'
type OgColumn = { label: string; checkId: string }
type Check = { id: string; pass: boolean; detail?: string }
type OgResult = {
  parts?: unknown
  checks?: Check[]
  checksPassed?: boolean
  repaired?: boolean
  subject?: string
  body?: string
}
type OgRun = {
  id: string
  mode: Mode
  input: string
  founderName?: string | null
  company?: string | null
  enrichment?: unknown
  result?: OgResult | null
  error?: string | null
  createdAt: string
}

const TABS: Array<{ mode: Mode; label: string; placeholder: string }> = [
  { mode: 'name', label: 'company name', placeholder: 'e.g. Ledgerline' },
  { mode: 'url', label: 'company url', placeholder: 'e.g. ledgerline.com' },
]

export default function OgPage() {
  const [mode, setMode] = useState<Mode>('name')
  const [input, setInput] = useState('')
  const [runs, setRuns] = useState<OgRun[]>([])
  const [columns, setColumns] = useState<OgColumn[]>([])
  const [available, setAvailable] = useState<string[]>([])
  const [running, setRunning] = useState<string[]>([]) // inputs currently in flight
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editCols, setEditCols] = useState(false)
  const [newCheckId, setNewCheckId] = useState('')
  const [newLabel, setNewLabel] = useState('')

  const load = useCallback(async () => {
    const [r, c] = await Promise.all([
      fetch('/api/og/runs').then((x) => x.json()),
      fetch('/api/og/columns').then((x) => x.json()),
    ])
    setRuns(r.runs ?? [])
    setColumns(c.columns ?? [])
    setAvailable(c.available ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const run = async () => {
    const value = input.trim()
    if (!value) return
    setInput('')
    setRunning((prev) => [...prev, value])
    try {
      await fetch('/api/og/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode, input: value }),
      })
    } finally {
      setRunning((prev) => prev.filter((x) => x !== value))
      load()
    }
  }

  const remove = async (id: string) => {
    await fetch(`/api/og/runs/${id}`, { method: 'DELETE' })
    load()
  }

  const saveColumns = async (next: OgColumn[]) => {
    setColumns(next)
    await fetch('/api/og/columns', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ columns: next }),
    })
  }

  const addColumn = () => {
    if (!newCheckId) return
    saveColumns([...columns, { label: newLabel.trim() || newCheckId, checkId: newCheckId }])
    setNewCheckId('')
    setNewLabel('')
  }

  const checkFor = (r: OgRun, checkId: string): Check | undefined =>
    r.result?.checks?.find((c) => c.id === checkId)

  const visible = runs.filter((r) => r.mode === mode)
  const unusedChecks = available.filter((id) => !columns.some((c) => c.checkId === id))

  return (
    <div className="min-h-screen bg-[#FBFAF8] text-[#1A1A1A]">
      <div className="max-w-full px-6 py-6">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/" className="text-[#888884] hover:text-[#1A1A1A]"><ArrowLeft size={16} /></Link>
          <h1 className="text-lg font-medium">OG</h1>
          <span className="text-[10px] uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-medium">Bench</span>
        </div>
        <p className="text-sm text-[#888884] mb-5">
          Drop in a target, get a structured draft, and see every verifiable check as a column. Expand a row for its raw JSON.
        </p>

        {/* tabs */}
        <div className="flex gap-1 mb-3 border-b border-[#E8E7E3]">
          {TABS.map((t) => (
            <button
              key={t.mode}
              onClick={() => setMode(t.mode)}
              className={`px-3 py-1.5 text-sm rounded-t-md border border-b-0 ${
                mode === t.mode
                  ? 'bg-white border-[#E8E7E3] font-medium'
                  : 'bg-transparent border-transparent text-[#888884] hover:text-[#1A1A1A]'
              }`}
            >
              {t.label}
            </button>
          ))}
          <div className="ml-auto pb-1.5">
            <button onClick={() => setEditCols((v) => !v)} className="text-xs text-[#888884] hover:text-[#1A1A1A] border border-[#E8E7E3] rounded px-2 py-1 bg-white">
              {editCols ? 'done' : 'edit columns'}
            </button>
          </div>
        </div>

        {/* input */}
        <div className="flex gap-2 mb-4">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder={TABS.find((t) => t.mode === mode)!.placeholder}
            className="w-96 bg-white border border-[#E8E7E3] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#C8C7C3]"
          />
          <button onClick={run} className="bg-[#1A1A1A] text-white rounded-lg px-4 py-1.5 text-sm hover:bg-[#333]">
            run
          </button>
        </div>

        {/* column editor */}
        {editCols && (
          <div className="mb-4 bg-white border border-[#E8E7E3] rounded-lg p-3 text-sm space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {columns.map((c, i) => (
                <span key={`${c.checkId}-${i}`} className="inline-flex items-center gap-1 border border-[#E8E7E3] rounded px-2 py-0.5 text-xs bg-[#FBFAF8]">
                  {c.label} <span className="text-[#B0AFAB]">({c.checkId})</span>
                  <button onClick={() => saveColumns(columns.filter((_, j) => j !== i))} className="text-[#B0AFAB] hover:text-red-500"><X size={12} /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2 items-center">
              <select value={newCheckId} onChange={(e) => setNewCheckId(e.target.value)} className="border border-[#E8E7E3] rounded px-2 py-1 text-xs bg-white">
                <option value="">add a check column…</option>
                {unusedChecks.map((id) => <option key={id} value={id}>{id}</option>)}
              </select>
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="label (optional)" className="border border-[#E8E7E3] rounded px-2 py-1 text-xs w-40" />
              <button onClick={addColumn} className="inline-flex items-center gap-1 text-xs border border-[#E8E7E3] rounded px-2 py-1 bg-white hover:border-[#C8C7C3]"><Plus size={12} /> add</button>
              <span className="text-xs text-[#B0AFAB]">columns map 1:1 to the verifiable check registry</span>
            </div>
          </div>
        )}

        {/* table */}
        <div className="overflow-x-auto bg-white border border-[#E8E7E3] rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#888884] border-b border-[#E8E7E3]">
                <th className="px-3 py-2 whitespace-nowrap">{mode === 'name' ? 'company' : 'url'}</th>
                <th className="px-3 py-2 whitespace-nowrap">founder</th>
                {columns.map((c, i) => (
                  <th key={`${c.checkId}-${i}`} className="px-2 py-2 whitespace-nowrap text-center" title={c.checkId}>{c.label}</th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {running.map((r) => (
                <tr key={`running-${r}`} className="border-b border-[#F1F0EC] text-[#888884] animate-pulse">
                  <td className="px-3 py-2">{r}</td>
                  <td className="px-3 py-2" colSpan={columns.length + 2}>researching + drafting…</td>
                </tr>
              ))}
              {visible.map((r) => (
                <FragmentRow
                  key={r.id}
                  r={r}
                  columns={columns}
                  expanded={expanded === r.id}
                  onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                  onDelete={() => remove(r.id)}
                  checkFor={checkFor}
                />
              ))}
              {visible.length === 0 && running.length === 0 && (
                <tr><td className="px-3 py-6 text-[#B0AFAB]" colSpan={columns.length + 3}>no runs yet — drop in a {mode === 'name' ? 'company name' : 'url'} above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function FragmentRow({
  r, columns, expanded, onToggle, onDelete, checkFor,
}: {
  r: OgRun
  columns: OgColumn[]
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  checkFor: (r: OgRun, checkId: string) => Check | undefined
}) {
  return (
    <>
      <tr className="border-b border-[#F1F0EC] hover:bg-[#FBFAF8] cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2 whitespace-nowrap max-w-52 truncate" title={r.input}>{r.input}</td>
        <td className="px-3 py-2 whitespace-nowrap text-[#888884]">{r.founderName ?? (r.error ? 'error' : '—')}</td>
        {columns.map((c, i) => {
          const check = checkFor(r, c.checkId)
          return (
            <td key={`${c.checkId}-${i}`} className="px-2 py-2 text-center" title={check?.detail ?? c.checkId}>
              {r.error ? <span className="text-red-400">!</span>
                : !check ? <span className="text-[#C8C7C3]">—</span>
                : check.pass ? <span className="text-emerald-600">✓</span>
                : <span className="text-red-500 font-medium">✗</span>}
            </td>
          )
        })}
        <td className="px-3 py-2 whitespace-nowrap text-right">
          <button onClick={(e) => { e.stopPropagation(); onToggle() }} className="text-xs text-[#888884] hover:text-[#1A1A1A] border border-[#E8E7E3] rounded px-1.5 py-0.5 mr-1.5">json</button>
          <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="text-[#C8C7C3] hover:text-red-500"><Trash2 size={13} /></button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-[#F1F0EC] bg-[#FBFAF8]">
          <td colSpan={columns.length + 3} className="px-3 py-3">
            {r.error && <div className="text-xs text-red-500 mb-2">error: {r.error}</div>}
            {r.result?.body && (
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-wider text-[#888884] mb-1">
                  assembled draft{r.result.subject ? ` · ${r.result.subject}` : ''}{r.result.repaired ? ' · repaired' : ''}
                </div>
                <pre className="whitespace-pre-wrap text-xs bg-white border border-[#E8E7E3] rounded p-3 max-w-3xl">{r.result.body}</pre>
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#888884] mb-1">structured output (parts + checks)</div>
                <pre className="text-[11px] bg-white border border-[#E8E7E3] rounded p-3 overflow-x-auto max-h-96 overflow-y-auto">
                  {JSON.stringify({ parts: r.result?.parts, checks: r.result?.checks, checksPassed: r.result?.checksPassed }, null, 2)}
                </pre>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#888884] mb-1">enrichment given to the model</div>
                <pre className="text-[11px] bg-white border border-[#E8E7E3] rounded p-3 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
                  {JSON.stringify(r.enrichment ?? null, null, 2)}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
