'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, ChevronDown, ChevronRight, Radar, X, ArrowRight, ArrowDown, ExternalLink, CheckCircle } from 'lucide-react'

type Theme = {
  id: string
  name: string
  description: string
  keywords: string | null
  enabled: boolean
  lastScannedAt: string | null
  _count: { hits: number }
}

type Hit = {
  id: string
  companyName: string
  url: string | null
  description: string
  matchReason: string
  source: string
  sourceUrl: string | null
  status: string
  theme: { name: string }
}

type StepData = {
  queries: { generated: string[] } | null
  sources: { parallel: number; hackerNews: number; googleNews: number; total: number } | null
  evaluation: { companiesFound: number; companies: { name: string; url: string | null }[] } | null
  dedup: { before: number; duplicatesRemoved: number; after: number } | null
  saved: { newHits: number } | null
}

type ActiveStep = 'queries' | 'sources' | 'evaluation' | 'dedup' | 'saved' | null

function StepCard({ number, title, status, children }: {
  number: number
  title: string
  status: 'pending' | 'running' | 'done'
  children?: React.ReactNode
}) {
  return (
    <div className={`bg-white border rounded-2xl overflow-hidden transition-colors ${status === 'running' ? 'border-[#1A1A1A]' : 'border-[#E8E7E3]'}`}>
      <div className="px-5 py-3 border-b border-[#F0EFE9] flex items-center gap-3">
        <span className="text-xs font-mono text-[#B0AFAB] w-5">{number}</span>
        <span className="text-sm font-medium text-[#1A1A1A] flex-1">{title}</span>
        {status === 'running' && (
          <div className="w-3.5 h-3.5 rounded-full border-2 border-[#1A1A1A] border-t-transparent animate-spin" />
        )}
        {status === 'done' && <CheckCircle size={14} className="text-green-600" />}
      </div>
      {children && <div className="p-5">{children}</div>}
    </div>
  )
}

export default function MonitorPage() {
  const router = useRouter()
  const [themes, setThemes] = useState<Theme[]>([])
  const [hits, setHits] = useState<Hit[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [themesExpanded, setThemesExpanded] = useState(true)
  const [coldOutbound, setColdOutbound] = useState(false)
  const [scanning, setScanning] = useState<string | null>(null)
  const [acting, setActing] = useState(false)

  // Streaming step state
  const [activeStep, setActiveStep] = useState<ActiveStep>(null)
  const [stepData, setStepData] = useState<StepData>({ queries: null, sources: null, evaluation: null, dedup: null, saved: null })
  const [scanDone, setScanDone] = useState(false)
  const [scanTotalHits, setScanTotalHits] = useState(0)
  const showSteps = scanning || scanDone

  // New theme form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newKeywords, setNewKeywords] = useState('')

  // Ref to prevent stale closures in keyboard handler
  const hitsRef = useRef(hits)
  const currentIndexRef = useRef(currentIndex)
  hitsRef.current = hits
  currentIndexRef.current = currentIndex

  const loadThemes = useCallback(async () => {
    const res = await fetch('/api/monitor/themes')
    if (res.ok) setThemes(await res.json())
  }, [])

  const loadHits = useCallback(async () => {
    const res = await fetch('/api/monitor/hits')
    if (res.ok) {
      const data = await res.json()
      setHits(data)
      setCurrentIndex(0)
    }
  }, [])

  useEffect(() => { loadThemes(); loadHits() }, [loadThemes, loadHits])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const hit = hitsRef.current[currentIndexRef.current]
      if (!hit) return
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'r') { e.preventDefault(); handleAction('rejected') }
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'a') { e.preventDefault(); handleAction('approved') }
      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') { e.preventDefault(); skip() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function addTheme() {
    if (!newName.trim() || !newDesc.trim()) return
    await fetch('/api/monitor/themes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, description: newDesc, keywords: newKeywords || null }),
    })
    setNewName(''); setNewDesc(''); setNewKeywords(''); setShowAddForm(false)
    loadThemes()
  }

  async function toggleTheme(theme: Theme) {
    await fetch(`/api/monitor/themes/${theme.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !theme.enabled }),
    })
    loadThemes()
  }

  async function deleteTheme(theme: Theme) {
    if (!confirm(`Delete theme "${theme.name}" and all its hits?`)) return
    await fetch(`/api/monitor/themes/${theme.id}`, { method: 'DELETE' })
    loadThemes()
    loadHits()
  }

  async function scan(themeId?: string) {
    setScanning(themeId ?? 'all')
    setScanDone(false)
    setScanTotalHits(0)
    setStepData({ queries: null, sources: null, evaluation: null, dedup: null, saved: null })
    setActiveStep('queries')

    const res = await fetch('/api/monitor/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(themeId ? { themeId } : {}),
    })

    if (!res.body) {
      setScanning(null)
      setScanDone(true)
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let totalHits = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)
          switch (event.step) {
            case 'queries':
              setStepData(prev => ({ ...prev, queries: event.data }))
              setActiveStep('sources')
              break
            case 'sources':
              setStepData(prev => ({ ...prev, sources: event.data }))
              setActiveStep('evaluation')
              break
            case 'evaluation':
              setStepData(prev => ({ ...prev, evaluation: event.data }))
              setActiveStep('dedup')
              break
            case 'dedup':
              setStepData(prev => ({ ...prev, dedup: event.data }))
              setActiveStep('saved')
              break
            case 'saved':
              setStepData(prev => ({ ...prev, saved: event.data }))
              totalHits += event.data.newHits
              setActiveStep(null)
              break
            case 'done':
              totalHits += 0 // already counted in saved
              break
          }
        } catch { /* skip malformed lines */ }
      }
    }

    setScanTotalHits(totalHits)
    setActiveStep(null)
    setScanning(null)
    setScanDone(true)
    loadThemes()
    loadHits()
  }

  async function handleAction(status: 'approved' | 'rejected') {
    const hit = hitsRef.current[currentIndexRef.current]
    if (!hit || acting) return
    setActing(true)
    await fetch(`/api/monitor/hits/${hit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, runColdOutbound: status === 'approved' && coldOutbound }),
    })
    setActing(false)
    setHits(prev => {
      const next = prev.filter((_, i) => i !== currentIndexRef.current)
      if (currentIndexRef.current >= next.length) setCurrentIndex(Math.max(0, next.length - 1))
      return next
    })
    loadThemes()
  }

  function skip() {
    if (currentIndexRef.current < hitsRef.current.length - 1) setCurrentIndex(i => i + 1)
  }

  function getStepStatus(step: ActiveStep): 'pending' | 'running' | 'done' {
    if (!step) return 'pending'
    const ORDER: ActiveStep[] = ['queries', 'sources', 'evaluation', 'dedup', 'saved']
    const stepIdx = ORDER.indexOf(step)
    const activeIdx = activeStep ? ORDER.indexOf(activeStep) : (scanDone ? ORDER.length : -1)

    if (stepIdx < activeIdx) return 'done'
    if (stepIdx === activeIdx && scanning) return 'running'
    if (scanDone && stepData[step]) return 'done'
    // Special: if dedup is done and saved is null, it means 0 new hits — mark saved as done too
    if (step === 'saved' && scanDone && stepData.dedup && !stepData.saved) return 'done'
    return 'pending'
  }

  const currentHit = hits[currentIndex]
  const SOURCE_LABELS: Record<string, string> = { parallel: 'Parallel', hackernews: 'Hacker News', google_news: 'Google News' }
  const SOURCE_COLORS: Record<string, string> = {
    parallel: 'bg-purple-50 text-purple-700 border-purple-200',
    hackernews: 'bg-orange-50 text-orange-700 border-orange-200',
    google_news: 'bg-blue-50 text-blue-700 border-blue-200',
  }

  return (
    <div className="min-h-screen bg-[#F7F6F3]">
      <header className="px-10 pt-12 pb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/agents')} className="p-2 rounded-lg hover:bg-black/5 transition-colors -ml-2">
            <ArrowLeft size={16} className="text-[#888884]" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#1A1A1A]">Deal Monitor</h1>
            <p className="text-sm text-[#888884] mt-0.5">Discover companies matching your investment themes</p>
          </div>
        </div>
        <button
          onClick={() => scan()}
          disabled={scanning !== null}
          className="flex items-center gap-1.5 text-sm bg-[#1A1A1A] text-white px-4 py-2 rounded-lg hover:bg-[#333] disabled:opacity-40 transition-colors"
        >
          <Radar size={14} className={scanning === 'all' ? 'animate-spin' : ''} />
          {scanning === 'all' ? 'Scanning…' : 'Scan All'}
        </button>
      </header>

      <main className="px-10 pb-10 max-w-3xl space-y-6">
        {/* Theme management */}
        <div className="bg-white rounded-2xl border border-[#E8E7E3]">
          <button
            onClick={() => setThemesExpanded(!themesExpanded)}
            className="w-full flex items-center justify-between p-5"
          >
            <span className="font-medium text-[#1A1A1A]">Investment Themes</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#888884]">{themes.length} theme{themes.length !== 1 ? 's' : ''}</span>
              {themesExpanded ? <ChevronDown size={14} className="text-[#888884]" /> : <ChevronRight size={14} className="text-[#888884]" />}
            </div>
          </button>

          {themesExpanded && (
            <div className="border-t border-[#F0EFE9] px-5 pb-5 space-y-3">
              {themes.map(theme => (
                <div key={theme.id} className="flex items-center gap-3 py-2">
                  <button
                    onClick={() => toggleTheme(theme)}
                    className="flex-shrink-0 relative inline-flex items-center cursor-pointer"
                  >
                    <div className={`rounded-full transition-colors ${theme.enabled ? 'bg-[#1A1A1A]' : 'bg-[#E8E7E3]'}`} style={{ width: 32, height: 18 }} />
                    <div className={`absolute left-0.5 top-0.5 bg-white rounded-full shadow-sm transition-transform ${theme.enabled ? 'translate-x-3.5' : 'translate-x-0'}`} style={{ width: 14, height: 14 }} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#1A1A1A]">{theme.name}</span>
                      {theme._count.hits > 0 && (
                        <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full">
                          {theme._count.hits}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#888884] truncate">{theme.description}</p>
                  </div>
                  <button
                    onClick={() => scan(theme.id)}
                    disabled={scanning !== null}
                    className="text-xs text-[#888884] border border-[#E8E7E3] px-2 py-1 rounded-lg hover:border-[#C8C7C3] disabled:opacity-40 transition-colors"
                  >
                    {scanning === theme.id ? 'Scanning…' : 'Scan'}
                  </button>
                  <button onClick={() => deleteTheme(theme)} className="p-1 rounded-lg hover:bg-black/5 transition-colors">
                    <X size={12} className="text-[#888884]" />
                  </button>
                </div>
              ))}

              {showAddForm ? (
                <div className="space-y-2 pt-2 border-t border-[#F0EFE9]">
                  <input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Theme name (e.g. AI in Capital Markets)"
                    className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 focus:outline-none focus:border-[#1A1A1A]"
                  />
                  <textarea
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                    placeholder="Investment thesis (natural language description)"
                    rows={2}
                    className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 focus:outline-none focus:border-[#1A1A1A] resize-none"
                  />
                  <input
                    value={newKeywords}
                    onChange={e => setNewKeywords(e.target.value)}
                    placeholder="Keywords (optional, comma-separated)"
                    className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 focus:outline-none focus:border-[#1A1A1A]"
                  />
                  <div className="flex gap-2">
                    <button onClick={addTheme} className="text-xs bg-[#1A1A1A] text-white px-3 py-1.5 rounded-lg hover:bg-[#333] transition-colors">
                      Add Theme
                    </button>
                    <button onClick={() => setShowAddForm(false)} className="text-xs text-[#888884] px-3 py-1.5 rounded-lg hover:bg-black/5 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="flex items-center gap-1.5 text-xs text-[#888884] hover:text-[#1A1A1A] transition-colors pt-1"
                >
                  <Plus size={12} />
                  Add Theme
                </button>
              )}
            </div>
          )}
        </div>

        {/* Scan step cards — streamed live */}
        {showSteps && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-[#888884] uppercase tracking-wide">
              {scanning ? 'Scanning…' : `Scan complete — ${scanTotalHits} new hit${scanTotalHits !== 1 ? 's' : ''}`}
            </p>

            {/* Step 1: Generate queries */}
            <StepCard number={1} title="Generating search queries…" status={getStepStatus('queries')}>
              {stepData.queries && (
                <div className="flex flex-wrap gap-1.5">
                  {stepData.queries.generated.map((q, i) => (
                    <span key={i} className="text-xs bg-[#F0EFE9] text-[#555] px-2.5 py-1 rounded-full">
                      {q}
                    </span>
                  ))}
                </div>
              )}
            </StepCard>

            {/* Step 2: Fetch sources */}
            <StepCard number={2} title="Fetching from Parallel, Hacker News, Google News…" status={getStepStatus('sources')}>
              {stepData.sources && (
                <div className="flex gap-4 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-400" />
                    <span className="text-xs text-[#555]">Parallel: {stepData.sources.parallel} result{stepData.sources.parallel !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-orange-400" />
                    <span className="text-xs text-[#555]">Hacker News: {stepData.sources.hackerNews} result{stepData.sources.hackerNews !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    <span className="text-xs text-[#555]">Google News: {stepData.sources.googleNews} result{stepData.sources.googleNews !== 1 ? 's' : ''}</span>
                  </div>
                  <span className="text-xs text-[#B0AFAB]">{stepData.sources.total} total raw hits</span>
                </div>
              )}
            </StepCard>

            {/* Step 3: AI evaluation */}
            <StepCard number={3} title="AI evaluating & extracting companies…" status={getStepStatus('evaluation')}>
              {stepData.evaluation && (
                <div>
                  <p className="text-xs text-[#888884] mb-2">
                    {stepData.evaluation.companiesFound} real compan{stepData.evaluation.companiesFound !== 1 ? 'ies' : 'y'} identified
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {stepData.evaluation.companies.map((c, i) => (
                      <span key={i} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </StepCard>

            {/* Step 4: Dedup */}
            <StepCard number={4} title="Deduplicating against existing targets…" status={getStepStatus('dedup')}>
              {stepData.dedup && (
                <p className="text-xs text-[#555]">
                  {stepData.dedup.duplicatesRemoved > 0 ? (
                    <>{stepData.dedup.duplicatesRemoved} duplicate{stepData.dedup.duplicatesRemoved !== 1 ? 's' : ''} removed &rarr; <strong>{stepData.dedup.after}</strong> new</>
                  ) : (
                    <>No duplicates found &mdash; all {stepData.dedup.after} are new</>
                  )}
                </p>
              )}
            </StepCard>

            {/* Step 5: Save */}
            <StepCard number={5} title="Saving new hits…" status={getStepStatus('saved')}>
              {(stepData.saved || (scanDone && stepData.dedup && !stepData.saved)) && (
                <p className="text-sm text-[#1A1A1A]">
                  {stepData.saved ? (
                    <><strong>{stepData.saved.newHits}</strong> new hit{stepData.saved.newHits !== 1 ? 's' : ''} added to your review queue</>
                  ) : (
                    <>No new hits to add</>
                  )}
                </p>
              )}
            </StepCard>
          </div>
        )}

        {/* Swipe card */}
        {currentHit ? (
          <div className="space-y-4">
            <div className="text-xs text-[#888884] text-center">
              {currentIndex + 1} of {hits.length} pending
            </div>

            <div className="bg-white rounded-2xl border border-[#E8E7E3] p-6 space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-[#1A1A1A]">{currentHit.companyName}</h2>
                {currentHit.url && (
                  <a
                    href={currentHit.url.startsWith('http') ? currentHit.url : `https://${currentHit.url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1 mt-1"
                  >
                    {currentHit.url} <ExternalLink size={11} />
                  </a>
                )}
              </div>

              <p className="text-sm text-[#555] leading-relaxed">{currentHit.description}</p>

              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                <p className="text-xs font-medium text-emerald-800 mb-0.5">Match Reason</p>
                <p className="text-sm text-emerald-700">{currentHit.matchReason}</p>
              </div>

              <div className="flex items-center gap-2">
                <span className={`text-xs border px-2 py-0.5 rounded-full ${SOURCE_COLORS[currentHit.source] ?? 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                  {SOURCE_LABELS[currentHit.source] ?? currentHit.source}
                </span>
                <span className="text-xs bg-[#F0EFE9] text-[#888884] px-2 py-0.5 rounded-full">
                  {currentHit.theme.name}
                </span>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={coldOutbound}
                  onChange={e => setColdOutbound(e.target.checked)}
                  className="w-4 h-4 rounded border-[#E8E7E3] text-[#1A1A1A] focus:ring-[#1A1A1A]"
                />
                <span className="text-xs text-[#888884]">Run Cold Outbound on approve</span>
              </label>
            </div>

            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => handleAction('rejected')}
                disabled={acting}
                className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 disabled:opacity-40 transition-colors font-medium"
              >
                <X size={16} />
                Reject
                <kbd className="text-[10px] bg-red-100 px-1.5 py-0.5 rounded ml-1">&larr;</kbd>
              </button>
              <button
                onClick={skip}
                className="flex items-center gap-2 px-5 py-3 bg-[#F0EFE9] text-[#888884] border border-[#E8E7E3] rounded-xl hover:bg-[#E8E7E3] transition-colors"
              >
                <ArrowDown size={16} />
                Skip
                <kbd className="text-[10px] bg-[#E8E7E3] px-1.5 py-0.5 rounded ml-1">&darr;</kbd>
              </button>
              <button
                onClick={() => handleAction('approved')}
                disabled={acting}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl hover:bg-emerald-100 disabled:opacity-40 transition-colors font-medium"
              >
                Approve
                <ArrowRight size={16} />
                <kbd className="text-[10px] bg-emerald-100 px-1.5 py-0.5 rounded ml-1">&rarr;</kbd>
              </button>
            </div>
          </div>
        ) : (
          !showSteps && (
            <div className="bg-white rounded-2xl border border-[#E8E7E3] p-12 text-center">
              <Radar size={32} className="mx-auto text-[#C8C7C3] mb-3" />
              <p className="text-sm text-[#888884]">No pending hits. Scan your themes to discover new deals.</p>
            </div>
          )
        )}
      </main>
    </div>
  )
}
