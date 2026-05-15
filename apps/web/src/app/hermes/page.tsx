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

type PastRun = {
  id: string
  block: string
  status: string
  steps: string
  durationMs: number | null
  startedAt: string
  completedAt: string | null
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
      {/* Foot / sandal */}
      <path d="M8 20c0-1 .5-2 2-3s3-1.5 4-3c.5-.8.5-1.5 0-2.5S12 9 12 7c0-1.5.5-3 2-4" />
      <path d="M7.5 20h6" />
      {/* Wing feathers */}
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
  const [pastRuns, setPastRuns] = useState<PastRun[]>([])

  // Load past runs on mount
  const loadPastRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/hermes/runs')
      if (res.ok) {
        const data: PastRun[] = await res.json()
        setPastRuns(data)

        // Populate statuses and timestamps from past runs
        const statuses: Record<string, BlockStatus> = {}
        const timestamps: Record<string, string> = {}
        const durations: Record<string, number> = {}
        const events: Record<string, StepEvent[]> = {}

        for (const run of data) {
          // Only use the most recent run per block
          if (!timestamps[run.block]) {
            statuses[run.block] = run.status as BlockStatus
            timestamps[run.block] = run.startedAt
            if (run.durationMs) durations[run.block] = run.durationMs
            try {
              events[run.block] = JSON.parse(run.steps)
            } catch { /* skip */ }
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

  // Toggle step expansion
  function toggleStep(key: string) {
    setExpandedSteps(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Run a block — streams NDJSON
  async function runBlock(blockId: string) {
    if (runningBlock) return

    setRunningBlock(blockId)
    setBlockStatuses(prev => ({ ...prev, [blockId]: 'running' }))
    setStepEvents(prev => ({ ...prev, [blockId]: [] }))
    setExpandedSteps(new Set())

    const startTime = Date.now()

    try {
      const res = await fetch(`/api/hermes/run/${blockId}`, { method: 'POST' })

      if (!res.body) {
        setBlockStatuses(prev => ({ ...prev, [blockId]: 'failed' }))
        setRunningBlock(null)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let hasFailed = false

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
              // Update existing step or add new one
              const idx = existing.findIndex(e => e.step === event.step)
              if (idx >= 0) {
                const updated = [...existing]
                updated[idx] = event
                return { ...prev, [blockId]: updated }
              }
              return { ...prev, [blockId]: [...existing, event] }
            })
          } catch { /* skip malformed lines */ }
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
    loadPastRuns()
  }

  const currentBlockDef = BLOCKS.find(b => b.id === selectedBlock)
  const currentSteps = stepEvents[selectedBlock] ?? []
  const currentStatus = blockStatuses[selectedBlock] ?? 'idle'

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
        <div>
          <h1 className="text-lg font-semibold text-white tracking-tight">Hermes</h1>
          <p className="text-xs text-white/50">Pipeline debugger</p>
        </div>
      </header>

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
                  {/* Amber left border on hover / active */}
                  <div
                    className={[
                      'absolute left-0 top-0 bottom-0 w-[3px] rounded-r transition-colors',
                      isSelected ? 'bg-amber-400' : 'bg-transparent group-hover:bg-amber-200',
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
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play size={14} />
                      Run Block
                    </>
                  )}
                </button>
              </div>

              {/* Step cards */}
              <div className="space-y-3">
                {currentBlockDef.steps.map((stepName, idx) => {
                  const stepNum = idx + 1
                  const event = currentSteps.find(e => e.step === stepNum)
                  const status: StepStatus = event?.status ?? 'pending'
                  const stepKey = `${selectedBlock}-${stepNum}`
                  const isExpanded = expandedSteps.has(stepKey)
                  const hasDetail = event && (event.input || event.output || event.error)

                  return (
                    <div
                      key={stepKey}
                      className={[
                        'bg-white border rounded-xl overflow-hidden transition-colors',
                        status === 'running' ? 'border-amber-300 shadow-sm' :
                        status === 'error' ? 'border-red-200' :
                        'border-[#E8E7E3]',
                      ].join(' ')}
                    >
                      <button
                        onClick={() => hasDetail && toggleStep(stepKey)}
                        className="w-full flex items-center gap-3 px-5 py-3.5 text-left"
                      >
                        <span className="text-xs font-mono text-[#B0AFAB] w-5 text-right flex-shrink-0">
                          {stepNum}
                        </span>
                        <span className="text-sm font-medium text-[#1A1A1A] flex-1">
                          {stepName}
                        </span>
                        {event?.durationMs !== undefined && event.durationMs > 0 && (
                          <span className="text-xs text-[#B0AFAB] tabular-nums">
                            {event.durationMs}ms
                          </span>
                        )}
                        {stepStatusBadge(status)}
                        {hasDetail && (
                          isExpanded
                            ? <ChevronDown size={14} className="text-[#B0AFAB] flex-shrink-0" />
                            : <ChevronRight size={14} className="text-[#B0AFAB] flex-shrink-0" />
                        )}
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && hasDetail && (
                        <div className="border-t border-[#F0EFE9] px-5 py-4 space-y-3">
                          {event?.error && (
                            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                              <p className="text-xs font-medium text-red-800 mb-1">Error</p>
                              <pre className="text-xs text-red-700 whitespace-pre-wrap font-mono">
                                {event.error}
                              </pre>
                            </div>
                          )}
                          {event?.input && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-[#888884] font-medium mb-1.5">Input</p>
                              <pre className="text-xs text-[#555] bg-[#F7F6F3] rounded-lg px-4 py-3 overflow-x-auto font-mono whitespace-pre-wrap">
                                {JSON.stringify(event.input, null, 2)}
                              </pre>
                            </div>
                          )}
                          {event?.output && (
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
                })}
              </div>

              {/* Empty state */}
              {currentSteps.length === 0 && currentStatus === 'idle' && (
                <div className="bg-white rounded-xl border border-[#E8E7E3] p-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-[#F7F6F3] flex items-center justify-center mx-auto mb-3">
                    <Play size={20} className="text-[#C8C7C3] ml-0.5" />
                  </div>
                  <p className="text-sm text-[#888884]">
                    Click &ldquo;Run Block&rdquo; to execute {currentBlockDef.label} and see step-by-step results
                  </p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
