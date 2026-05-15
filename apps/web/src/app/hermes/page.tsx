'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Play,
  Download,
  Layers,
  Sparkles,
  Box,
  GitMerge,
  Fingerprint,
  BarChart3,
  Search,
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ChevronDown,
  ChevronRight,
  Zap,
  X,
  Plus,
  Pencil,
  Check,
} from 'lucide-react'

// ── Block definitions ──────────────────────────────────────────────

type BlockDef = {
  id: string
  label: string
  icon: React.ElementType
  steps: string[]
}

const BLOCKS: BlockDef[] = [
  {
    id: 'ingestion',
    label: 'Ingestion',
    icon: Download,
    steps: [
      'Init connector',
      'Execute search',
      'Parse response',
      'LLM extraction',
      'Schema validation',
      'Write to staging',
    ],
  },
  {
    id: 'enrichment',
    label: 'Enrichment',
    icon: Sparkles,
    steps: [
      'Load target',
      'Funding data',
      'Website scrape',
      'Email lookup',
      'Twitter enrichment',
      'Text blob synthesis',
      'Write enriched record',
    ],
  },
  {
    id: 'embedding',
    label: 'Embedding',
    icon: Box,
    steps: [
      'Load blob',
      'Call embedding model',
      'Validate dimensions',
      'Upsert to pgvector',
      'Similarity sanity check',
    ],
  },
  {
    id: 'clustering',
    label: 'Clustering',
    icon: Layers,
    steps: [
      'Fetch embeddings',
      'Run HDBSCAN',
      'Report stats',
      'LLM label generation',
      'Write clusters',
      'Update target cluster IDs',
    ],
  },
  {
    id: 'entity_resolution',
    label: 'Entity Resolution',
    icon: Fingerprint,
    steps: [
      'Load candidates',
      'Primary URL match',
      'Fuzzy name match',
      'Embedding similarity',
      'Merge duplicates',
      'Flag uncertain',
    ],
  },
  {
    id: 'scoring',
    label: 'Scoring',
    icon: BarChart3,
    steps: [
      'Load entity + signals',
      'Thesis fit',
      'Recency decay',
      'Signal volume',
      'Investor/founder boost',
      'Write score',
    ],
  },
  {
    id: 'search',
    label: 'Semantic Search',
    icon: Search,
    steps: [
      'Accept query',
      'Embed query',
      'pgvector search',
      'Score-weighted rerank',
      'Sub-topic labeling',
      'Return results',
    ],
  },
  {
    id: 'outreach',
    label: 'Outreach',
    icon: Send,
    steps: [
      'Load target + enrichment',
      'Build LLM context',
      'Generate draft',
      'Validate quality',
      'Save to approval queue',
      'Confirm gate',
    ],
  },
]

// ── Types ──────────────────────────────────────────────────────────

type StepStatus = 'pending' | 'running' | 'success' | 'error'
type BlockStatus = 'idle' | 'running' | 'passed' | 'failed'

type StepEvent = {
  block: string
  step: number
  name: string
  status: StepStatus
  durationMs: number
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  error?: string
}

type SubTheme = {
  label: string
  description: string
  searchQueries: string[]
  enabled: boolean
  editing: boolean
}

// ── Winged Foot SVG ────────────────────────────────────────────────

function WingedFootIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M8 20c0-1 .5-2 2-3s3-1.5 4-3c.5-.8.5-1.5 0-2.5S12 9 12 7c0-1.5.5-3 2-4" />
      <path d="M7.5 20h6" />
      <path d="M5 13c-2-1-3.5-2.5-3.5-4S3 6 5 6" />
      <path d="M5 11c-1.5-.5-2.5-1.5-2.5-3S4 5.5 5 5" />
      <path d="M6 9.5C4.5 9 4 8 4 7s1-2 2.5-2" />
    </svg>
  )
}

// ── Status helpers ─────────────────────────────────────────────────

function blockStatusColor(status: BlockStatus) {
  switch (status) {
    case 'passed': return 'bg-emerald-400'
    case 'failed': return 'bg-red-400'
    case 'running': return 'bg-amber-400 animate-pulse'
    default: return 'bg-gray-300'
  }
}

function stepStatusBadge(status: StepStatus) {
  switch (status) {
    case 'success':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
          <CheckCircle2 size={10} /> passed
        </span>
      )
    case 'error':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
          <XCircle size={10} /> error
        </span>
      )
    case 'running':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
          <Loader2 size={10} className="animate-spin" /> running
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
          <Clock size={10} /> pending
        </span>
      )
  }
}

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'hackernews', label: 'Hacker News' },
  { value: 'google_news', label: 'Google News' },
  { value: 'techcrunch', label: 'TechCrunch' },
  { value: 'tbpn', label: 'TBPN' },
  { value: 'vc_portfolio', label: 'VC Portfolios' },
  { value: 'vc_website', label: 'VC Websites' },
]

// ── Main page component ────────────────────────────────────────────

export default function HermesPage() {
  const router = useRouter()
  const [selectedBlock, setSelectedBlock] = useState<string>('ingestion')
  const [blockStatuses, setBlockStatuses] = useState<Record<string, BlockStatus>>({})
  const [stepEvents, setStepEvents] = useState<Record<string, StepEvent[]>>({})
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [runningBlock, setRunningBlock] = useState<string | null>(null)
  const [lastRunTimestamps, setLastRunTimestamps] = useState<Record<string, string>>({})
  const [lastRunDurations, setLastRunDurations] = useState<Record<string, number>>({})

  // Thesis & sub-themes
  const [thesis, setThesis] = useState('')
  const [subThemes, setSubThemes] = useState<SubTheme[]>([])
  const [isDecomposing, setIsDecomposing] = useState(false)
  const [selectedSources, setSelectedSources] = useState<string[]>(['hackernews', 'google_news', 'techcrunch'])
  const [pipelineRunning, setPipelineRunning] = useState(false)

  // Load past runs on mount
  const loadPastRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/hermes/runs')
      if (res.ok) {
        const data = await res.json()
        const statuses: Record<string, BlockStatus> = {}
        const timestamps: Record<string, string> = {}
        const durations: Record<string, number> = {}
        const events: Record<string, StepEvent[]> = {}

        for (const run of data) {
          if (!timestamps[run.block]) {
            statuses[run.block] = run.status as BlockStatus
            timestamps[run.block] = run.startedAt
            if (run.durationMs) durations[run.block] = run.durationMs
            try { events[run.block] = JSON.parse(run.steps) } catch { /* skip */ }
          }
        }

        setBlockStatuses(prev => ({ ...prev, ...statuses }))
        setLastRunTimestamps(prev => ({ ...prev, ...timestamps }))
        setLastRunDurations(prev => ({ ...prev, ...durations }))
        setStepEvents(prev => ({ ...prev, ...events }))
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadPastRuns() }, [loadPastRuns])

  function toggleStep(key: string) {
    setExpandedSteps(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // ── Thesis decomposition ──
  async function decomposeThesis() {
    if (!thesis.trim() || isDecomposing) return
    setIsDecomposing(true)
    setSubThemes([])

    try {
      const res = await fetch('/api/hermes/decompose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thesis: thesis.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        setSubThemes(
          (data.subThemes ?? []).map((t: any) => ({
            ...t,
            enabled: true,
            editing: false,
          }))
        )
      }
    } catch { /* ignore */ }
    setIsDecomposing(false)
  }

  function toggleSubTheme(idx: number) {
    setSubThemes(prev => prev.map((t, i) => i === idx ? { ...t, enabled: !t.enabled } : t))
  }

  function removeSubTheme(idx: number) {
    setSubThemes(prev => prev.filter((_, i) => i !== idx))
  }

  function updateSubThemeQuery(themeIdx: number, queryIdx: number, value: string) {
    setSubThemes(prev => prev.map((t, i) => {
      if (i !== themeIdx) return t
      const queries = [...t.searchQueries]
      queries[queryIdx] = value
      return { ...t, searchQueries: queries }
    }))
  }

  function addQueryToSubTheme(idx: number) {
    setSubThemes(prev => prev.map((t, i) =>
      i === idx ? { ...t, searchQueries: [...t.searchQueries, ''] } : t
    ))
  }

  function toggleEditing(idx: number) {
    setSubThemes(prev => prev.map((t, i) => i === idx ? { ...t, editing: !t.editing } : t))
  }

  function toggleSource(source: string) {
    setSelectedSources(prev =>
      prev.includes(source) ? prev.filter(s => s !== source) : [...prev, source]
    )
  }

  // ── Stream a block run ──
  async function streamBlock(blockId: string, body: Record<string, any> = {}) {
    setSelectedBlock(blockId)
    setRunningBlock(blockId)
    setBlockStatuses(prev => ({ ...prev, [blockId]: 'running' }))
    setStepEvents(prev => ({ ...prev, [blockId]: [] }))

    const startTime = Date.now()
    let hasFailed = false

    try {
      const res = await fetch(`/api/hermes/run/${blockId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.body) {
        setBlockStatuses(prev => ({ ...prev, [blockId]: 'failed' }))
        setRunningBlock(null)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event: StepEvent = JSON.parse(line)
            if (event.status === 'error') hasFailed = true
            setStepEvents(prev => {
              const existing = prev[blockId] ?? []
              const idx = existing.findIndex(e => e.step === event.step && e.name === event.name)
              if (idx >= 0) {
                const updated = [...existing]
                updated[idx] = event
                return { ...prev, [blockId]: updated }
              }
              return { ...prev, [blockId]: [...existing, event] }
            })
          } catch { /* skip */ }
        }
      }

      const elapsed = Date.now() - startTime
      const finalStatus = hasFailed ? 'failed' : 'passed'
      setBlockStatuses(prev => ({ ...prev, [blockId]: finalStatus as BlockStatus }))
      setLastRunTimestamps(prev => ({ ...prev, [blockId]: new Date().toISOString() }))
      setLastRunDurations(prev => ({ ...prev, [blockId]: elapsed }))
    } catch {
      setBlockStatuses(prev => ({ ...prev, [blockId]: 'failed' }))
    }

    setRunningBlock(null)
  }

  // ── Run full pipeline ──
  async function runFullPipeline() {
    const enabledThemes = subThemes.filter(t => t.enabled)
    if (enabledThemes.length === 0) return

    setPipelineRunning(true)

    // Collect all search queries from enabled sub-themes
    const allQueries = enabledThemes.flatMap(t => t.searchQueries.filter(q => q.trim()))

    // Step 1: Ingestion
    await streamBlock('ingestion', {
      queries: allQueries,
      sources: selectedSources,
    })

    // Step 2: Enrichment (batch — enrich new targets without blobs)
    await streamBlock('enrichment', {})

    // Step 3: Embedding
    await streamBlock('embedding', {})

    // Step 4: Entity Resolution
    await streamBlock('entity_resolution', {})

    // Step 5: Scoring
    await streamBlock('scoring', {})

    // Step 6: Clustering
    await streamBlock('clustering', {})

    setPipelineRunning(false)
    loadPastRuns()
  }

  // Run a single block
  async function runBlock(blockId: string) {
    if (runningBlock) return

    if (blockId === 'ingestion') {
      const enabledThemes = subThemes.filter(t => t.enabled)
      const allQueries = enabledThemes.flatMap(t => t.searchQueries.filter(q => q.trim()))
      await streamBlock(blockId, { queries: allQueries, sources: selectedSources })
    } else {
      await streamBlock(blockId, {})
    }
    loadPastRuns()
  }

  const currentBlockDef = BLOCKS.find(b => b.id === selectedBlock)
  const currentSteps = stepEvents[selectedBlock] ?? []
  const currentStatus = blockStatuses[selectedBlock] ?? 'idle'
  const enabledThemeCount = subThemes.filter(t => t.enabled).length
  const totalQueries = subThemes.filter(t => t.enabled).flatMap(t => t.searchQueries.filter(q => q.trim())).length

  return (
    <div className="min-h-screen bg-[#F7F6F3] flex flex-col">
      {/* Dark navy header */}
      <header className="bg-[#1E3A5F] px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push('/')}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
        >
          <ArrowLeft size={16} className="text-white/70" />
        </button>
        <WingedFootIcon className="w-6 h-6 text-amber-400" />
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-white tracking-tight">Hermes</h1>
          <p className="text-xs text-white/50">Pipeline debugger</p>
        </div>
        <button
          onClick={() => router.push('/hermes/search')}
          className="flex items-center gap-2 text-xs text-white/70 hover:text-white bg-white/10 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Search size={12} />
          Semantic Search
        </button>
      </header>

      {/* Thesis input bar */}
      <div className="bg-white border-b border-[#E8E7E3] px-6 py-5">
        <div className="max-w-4xl mx-auto">
          <label className="text-xs uppercase tracking-wider text-[#888884] font-medium mb-2 block">
            Investment Thesis
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={thesis}
              onChange={e => setThesis(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && decomposeThesis()}
              placeholder="e.g. onchain issuance, AI developer tools, climate fintech..."
              className="flex-1 px-4 py-3 rounded-xl border border-[#E8E7E3] text-sm text-[#1A1A1A] placeholder:text-[#C8C7C3] focus:outline-none focus:border-[#1E3A5F] focus:ring-1 focus:ring-[#1E3A5F]/20"
            />
            <button
              onClick={decomposeThesis}
              disabled={!thesis.trim() || isDecomposing}
              className="flex items-center gap-2 px-5 py-3 bg-[#1E3A5F] text-white text-sm font-medium rounded-xl hover:bg-[#2A4D7A] disabled:opacity-40 transition-colors"
            >
              {isDecomposing ? (
                <><Loader2 size={14} className="animate-spin" /> Decomposing...</>
              ) : (
                <><Zap size={14} /> Decompose</>
              )}
            </button>
          </div>

          {/* Sub-theme cards */}
          {subThemes.length > 0 && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-[#888884] font-medium">
                  Sub-themes ({enabledThemeCount} active, {totalQueries} queries)
                </p>
                <div className="flex items-center gap-2">
                  {/* Source toggles */}
                  <span className="text-[10px] text-[#B0AFAB] mr-1">Sources:</span>
                  {SOURCE_OPTIONS.map(s => (
                    <button
                      key={s.value}
                      onClick={() => toggleSource(s.value)}
                      className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                        selectedSources.includes(s.value)
                          ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]'
                          : 'text-[#888884] border-[#E8E7E3] hover:border-[#C8C7C3]'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {subThemes.map((theme, idx) => (
                  <div
                    key={idx}
                    className={`rounded-xl border transition-all ${
                      theme.enabled
                        ? 'border-[#1E3A5F]/20 bg-white shadow-sm'
                        : 'border-[#E8E7E3] bg-[#FAFAF8] opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3 px-4 py-3">
                      {/* Toggle */}
                      <button
                        onClick={() => toggleSubTheme(idx)}
                        className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          theme.enabled
                            ? 'bg-[#1E3A5F] border-[#1E3A5F]'
                            : 'border-[#C8C7C3] bg-white'
                        }`}
                      >
                        {theme.enabled && <Check size={12} className="text-white" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-[#1A1A1A]">{theme.label}</h4>
                          <button
                            onClick={() => toggleEditing(idx)}
                            className="p-0.5 rounded hover:bg-[#F7F6F3] text-[#B0AFAB] hover:text-[#888884]"
                          >
                            <Pencil size={10} />
                          </button>
                        </div>
                        <p className="text-xs text-[#888884] mt-0.5">{theme.description}</p>

                        {/* Search queries — always visible but compact */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {theme.searchQueries.map((q, qIdx) => (
                            theme.editing ? (
                              <input
                                key={qIdx}
                                value={q}
                                onChange={e => updateSubThemeQuery(idx, qIdx, e.target.value)}
                                className="text-[11px] px-2.5 py-1 rounded-lg border border-[#E8E7E3] bg-white text-[#1A1A1A] focus:outline-none focus:border-[#1E3A5F] min-w-[200px]"
                              />
                            ) : (
                              <span
                                key={qIdx}
                                className="text-[11px] px-2.5 py-1 rounded-lg bg-[#F7F6F3] text-[#555] border border-[#E8E7E3]"
                              >
                                {q}
                              </span>
                            )
                          ))}
                          {theme.editing && (
                            <button
                              onClick={() => addQueryToSubTheme(idx)}
                              className="text-[11px] px-2.5 py-1 rounded-lg border border-dashed border-[#C8C7C3] text-[#B0AFAB] hover:border-[#888884] hover:text-[#888884] flex items-center gap-1"
                            >
                              <Plus size={10} /> query
                            </button>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => removeSubTheme(idx)}
                        className="p-1 rounded hover:bg-red-50 text-[#C8C7C3] hover:text-red-400 flex-shrink-0"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Run pipeline button */}
              <button
                onClick={runFullPipeline}
                disabled={pipelineRunning || enabledThemeCount === 0 || selectedSources.length === 0}
                className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-40 transition-colors mt-3"
              >
                {pipelineRunning ? (
                  <><Loader2 size={16} className="animate-spin" /> Pipeline running...</>
                ) : (
                  <><Play size={16} /> Run Full Pipeline ({totalQueries} queries × {selectedSources.length} sources)</>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — block list */}
        <aside className="w-60 flex-shrink-0 border-r border-[#E8E7E3] bg-white overflow-y-auto">
          <div className="px-4 py-3 border-b border-[#E8E7E3]">
            <p className="text-[10px] uppercase tracking-wider text-[#888884] font-medium">Pipeline Blocks</p>
          </div>
          <nav className="py-1">
            {BLOCKS.map(block => {
              const Icon = block.icon
              const status = blockStatuses[block.id] ?? 'idle'
              const isSelected = selectedBlock === block.id
              return (
                <button
                  key={block.id}
                  onClick={() => setSelectedBlock(block.id)}
                  className={[
                    'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors relative',
                    isSelected ? 'bg-[#F7F6F3]' : 'hover:bg-[#FAFAF8]',
                  ].join(' ')}
                >
                  <div
                    className={[
                      'absolute left-0 top-0 bottom-0 w-[3px] rounded-r transition-colors',
                      isSelected ? 'bg-amber-400' : 'bg-transparent',
                    ].join(' ')}
                  />
                  <div className="w-7 h-7 rounded-md bg-[#F7F6F3] flex items-center justify-center flex-shrink-0">
                    <Icon size={14} className="text-[#555]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-[#1A1A1A] block truncate">
                      {block.label}
                    </span>
                    <span className="text-[10px] text-[#B0AFAB]">{block.steps.length} steps</span>
                  </div>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${blockStatusColor(status)}`} />
                </button>
              )
            })}
          </nav>
        </aside>

        {/* Main panel — execution trace */}
        <main className="flex-1 overflow-y-auto">
          {currentBlockDef && (
            <div className="max-w-3xl mx-auto px-8 py-6 space-y-6">
              {/* Top bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-[#1A1A1A]">{currentBlockDef.label}</h2>
                    <div className="flex items-center gap-3 mt-1">
                      {lastRunTimestamps[selectedBlock] && (
                        <span className="text-xs text-[#888884]">
                          Last run: {new Date(lastRunTimestamps[selectedBlock]).toLocaleString()}
                        </span>
                      )}
                      {lastRunDurations[selectedBlock] && (
                        <span className="text-xs text-[#B0AFAB]">
                          {lastRunDurations[selectedBlock]}ms
                        </span>
                      )}
                      <span
                        className={[
                          'inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full',
                          currentStatus === 'passed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          currentStatus === 'failed' ? 'bg-red-50 text-red-700 border border-red-200' :
                          currentStatus === 'running' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          'bg-gray-50 text-gray-500 border border-gray-200',
                        ].join(' ')}
                      >
                        {currentStatus}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => runBlock(selectedBlock)}
                  disabled={runningBlock !== null}
                  className="flex items-center gap-2 text-sm bg-[#1E3A5F] text-white px-4 py-2 rounded-lg hover:bg-[#2A4D7A] disabled:opacity-40 transition-colors"
                >
                  {runningBlock === selectedBlock ? (
                    <><Loader2 size={14} className="animate-spin" /> Running...</>
                  ) : (
                    <><Play size={14} /> Run Block</>
                  )}
                </button>
              </div>

              {/* Step cards */}
              <div className="space-y-3">
                {currentSteps.length > 0 ? (
                  currentSteps.map((event, idx) => {
                    const stepKey = `${selectedBlock}-${event.step}-${event.name}`
                    const isExpanded = expandedSteps.has(stepKey)
                    const hasDetail = event.input || event.output || event.error

                    return (
                      <div
                        key={stepKey}
                        className={[
                          'bg-white border rounded-xl overflow-hidden transition-colors',
                          event.status === 'running' ? 'border-amber-300 shadow-sm' :
                          event.status === 'error' ? 'border-red-200' :
                          'border-[#E8E7E3]',
                        ].join(' ')}
                      >
                        <button
                          onClick={() => hasDetail && toggleStep(stepKey)}
                          className="w-full flex items-center gap-3 px-5 py-3.5 text-left"
                        >
                          <span className="text-xs font-mono text-[#B0AFAB] w-5 text-right flex-shrink-0">
                            {event.step}
                          </span>
                          <span className="text-sm font-medium text-[#1A1A1A] flex-1 truncate">
                            {event.name}
                          </span>
                          {event.durationMs > 0 && (
                            <span className="text-xs text-[#B0AFAB] tabular-nums">
                              {event.durationMs}ms
                            </span>
                          )}
                          {stepStatusBadge(event.status)}
                          {hasDetail && (
                            isExpanded
                              ? <ChevronDown size={14} className="text-[#B0AFAB] flex-shrink-0" />
                              : <ChevronRight size={14} className="text-[#B0AFAB] flex-shrink-0" />
                          )}
                        </button>

                        {isExpanded && hasDetail && (
                          <div className="border-t border-[#F0EFE9] px-5 py-4 space-y-3">
                            {event.error && (
                              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                                <p className="text-xs font-medium text-red-800 mb-1">Error</p>
                                <pre className="text-xs text-red-700 whitespace-pre-wrap font-mono">
                                  {event.error}
                                </pre>
                              </div>
                            )}
                            {event.input && (
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-[#888884] font-medium mb-1.5">Input</p>
                                <pre className="text-xs text-[#555] bg-[#F7F6F3] rounded-lg px-4 py-3 overflow-x-auto font-mono whitespace-pre-wrap">
                                  {JSON.stringify(event.input, null, 2)}
                                </pre>
                              </div>
                            )}
                            {event.output && (
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-[#888884] font-medium mb-1.5">Output</p>
                                <pre className="text-xs text-[#555] bg-[#F7F6F3] rounded-lg px-4 py-3 overflow-x-auto font-mono whitespace-pre-wrap">
                                  {JSON.stringify(event.output, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                ) : currentStatus === 'idle' ? (
                  <div className="bg-white rounded-xl border border-[#E8E7E3] p-12 text-center">
                    <div className="w-12 h-12 rounded-full bg-[#F7F6F3] flex items-center justify-center mx-auto mb-3">
                      <Play size={20} className="text-[#C8C7C3] ml-0.5" />
                    </div>
                    <p className="text-sm text-[#888884]">
                      {selectedBlock === 'ingestion' && subThemes.length === 0
                        ? 'Enter a thesis above and decompose it to start searching'
                        : `Click "Run Block" to execute ${currentBlockDef.label}`
                      }
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
