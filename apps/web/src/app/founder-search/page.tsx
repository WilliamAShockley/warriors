'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, ChevronDown, ChevronRight, Play, RefreshCw } from 'lucide-react'

type CompareResult = {
  url: string
  domain: string
  exa: { results: { findSimilar: unknown[]; search: unknown[] } | null; elapsed: number; error?: string }
  tavily: { results: unknown[] | null; elapsed: number; error?: string }
  parallel: { results: unknown[] | null; elapsed: number; error?: string }
}

type Review = {
  id: string
  targetId: string
  candidates: { output: string; confidence: string; run_id: string }[]
  target: { id: string; company: string; websiteUrl: string | null }
}

const SERVICES = [
  { key: 'exa', label: 'Exa', description: 'Neural/semantic search' },
  { key: 'tavily', label: 'Tavily', description: 'Keyword search' },
  { key: 'parallel', label: 'Parallel AI', description: 'Deep web research' },
] as const

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  low: 'bg-red-50 text-red-700 border-red-200',
  unknown: 'bg-gray-50 text-gray-500 border-gray-200',
}

export default function FounderSearchPage() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CompareResult | null>(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const [reviews, setReviews] = useState<Review[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanQueue, setScanQueue] = useState<{ id: string; company: string; websiteUrl: string }[]>([])
  const [scanStatuses, setScanStatuses] = useState<Record<string, 'pending' | 'scanning' | 'saved' | 'review' | 'error'>>({})
  const [expandedReview, setExpandedReview] = useState<Record<string, boolean>>({})

  const loadReviews = useCallback(async () => {
    setReviewsLoading(true)
    const res = await fetch('/api/founder-search/reviews')
    const data = await res.json()
    setReviews(Array.isArray(data) ? data : [])
    setReviewsLoading(false)
  }, [])

  useEffect(() => { loadReviews() }, [loadReviews])

  async function runScan() {
    // First fetch the queue so we can show it
    const queueRes = await fetch('/api/founder-search/scan')
    const queue = await queueRes.json()
    if (!Array.isArray(queue) || queue.length === 0) {
      setScanQueue([])
      setScanStatuses({})
      setScanning(false)
      return
    }
    setScanQueue(queue)
    setScanStatuses(Object.fromEntries(queue.map((t: any) => [t.id, 'scanning' as const])))
    setScanning(true)

    // Run the scan and update statuses when done
    const res = await fetch('/api/founder-search/scan', { method: 'POST' })
    const data = await res.json()
    const newStatuses: Record<string, 'pending' | 'scanning' | 'saved' | 'review' | 'error'> = {}
    for (const r of (data.results ?? [])) {
      const target = queue.find((t: any) => t.company === r.company)
      if (target) newStatuses[target.id] = r.result === 'saved' ? 'saved' : 'review'
    }
    setScanStatuses(newStatuses)
    setScanning(false)
    loadReviews()
  }

  async function approveReview(id: string, output: string) {
    await fetch(`/api/founder-search/reviews/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', output }),
    })
    setReviews(prev => prev.filter(r => r.id !== id))
  }

  async function denyReview(id: string) {
    await fetch(`/api/founder-search/reviews/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deny' }),
    })
    setReviews(prev => prev.filter(r => r.id !== id))
  }

  async function run(e: React.FormEvent) {
    e.preventDefault()
    if (!url) return
    setLoading(true)
    setResult(null)
    setError('')
    setExpanded({})
    try {
      const res = await fetch('/api/founder-search/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.startsWith('http') ? url : `https://${url}` }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setResult(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  function toggle(key: string) {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function getResultCount(key: string): number {
    if (!result) return 0
    const d = result[key as keyof CompareResult] as any
    if (key === 'exa') return (d.results?.findSimilar?.length ?? 0) + (d.results?.search?.length ?? 0)
    return d.results?.length ?? 0
  }

  return (
    <div className="min-h-screen bg-[#F7F6F3]">
      <header className="px-10 pt-12 pb-6 flex items-center gap-3">
        <button onClick={() => router.push('/')} className="p-2 rounded-lg hover:bg-black/5 transition-colors -ml-2">
          <ArrowLeft size={16} className="text-[#888884]" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-[#1A1A1A]">Founder Search</h1>
          <p className="text-sm text-[#888884] mt-0.5">Compare Exa, Tavily, and Parallel AI</p>
        </div>
        <button
          onClick={() => router.push('/founder-search/parallel')}
          className="text-xs text-[#888884] hover:text-[#1A1A1A] transition-colors px-3 py-1.5 border border-[#E8E7E3] rounded-lg bg-white"
        >
          Parallel only →
        </button>
      </header>

      <main className="px-10 pb-10 max-w-5xl space-y-10">

        {/* Pending Reviews */}
        {(reviews.length > 0 || reviewsLoading) && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#1A1A1A]">Pending Reviews</h2>
                <p className="text-xs text-[#888884] mt-0.5">Parallel returned low-confidence results — pick the correct answer or deny all</p>
              </div>
              <button onClick={loadReviews} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
                <RefreshCw size={13} className={`text-[#888884] ${reviewsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {reviews.map(review => (
              <div key={review.id} className="bg-white border border-[#E8E7E3] rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-[#F0EFE9] flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-[#1A1A1A]">{review.target.company}</span>
                    {review.target.websiteUrl && (
                      <span className="text-xs text-[#B0AFAB] ml-2 font-mono">{review.target.websiteUrl}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExpandedReview(p => ({ ...p, [review.id]: !p[review.id] }))}
                      className="text-xs text-[#888884] hover:text-[#1A1A1A] flex items-center gap-1 transition-colors"
                    >
                      {expandedReview[review.id] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      {review.candidates.length} candidates
                    </button>
                    <button
                      onClick={() => denyReview(review.id)}
                      className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Deny all
                    </button>
                  </div>
                </div>

                {expandedReview[review.id] && (
                  <div className="divide-y divide-[#F0EFE9]">
                    {review.candidates.map((c, i) => (
                      <div key={c.run_id} className="px-5 py-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[#888884]">Attempt {i + 1}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${CONFIDENCE_COLORS[c.confidence] ?? CONFIDENCE_COLORS.unknown}`}>
                              {c.confidence}
                            </span>
                          </div>
                          <button
                            onClick={() => approveReview(review.id, c.output)}
                            className="text-xs bg-[#1A1A1A] text-white px-3 py-1 rounded-lg hover:bg-[#333] transition-colors"
                          >
                            Select this
                          </button>
                        </div>
                        <p className="text-xs text-[#555] leading-relaxed">{c.output.split('\n')[0]}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {/* Scan */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#1A1A1A]">Auto-Scan Targets</h2>
              <p className="text-xs text-[#888884] mt-0.5">Finds targets with a website URL but no founder — runs Parallel and saves high-confidence results automatically</p>
            </div>
            <button
              onClick={runScan}
              disabled={scanning}
              className="flex items-center gap-2 text-sm bg-[#1A1A1A] text-white px-4 py-2 rounded-xl hover:bg-[#333] disabled:opacity-40 transition-colors"
            >
              <Play size={13} />
              {scanning ? 'Scanning...' : 'Run Scan'}
            </button>
          </div>

          {scanQueue.length === 0 && !scanning && (
            <p className="text-xs text-[#B0AFAB]">No targets to process — add a target with a website URL and no founder to get started.</p>
          )}

          {scanQueue.length > 0 && (
            <div className="bg-white border border-[#E8E7E3] rounded-xl divide-y divide-[#F0EFE9]">
              {scanQueue.map(t => {
                const status = scanStatuses[t.id]
                return (
                  <div key={t.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <span className="text-sm font-medium text-[#1A1A1A]">{t.company}</span>
                      <span className="text-xs text-[#B0AFAB] ml-2 font-mono">{t.websiteUrl}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {status === 'scanning' && (
                        <>
                          <div className="w-3 h-3 rounded-full border-2 border-[#1A1A1A] border-t-transparent animate-spin" />
                          <span className="text-xs text-[#888884]">Searching...</span>
                        </>
                      )}
                      {status === 'saved' && <span className="text-xs text-green-600 font-medium">Founder saved</span>}
                      {status === 'review' && <span className="text-xs text-yellow-600 font-medium">Queued for review</span>}
                      {status === 'error' && <span className="text-xs text-red-500">Error</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Compare tool */}
        <section className="space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-[#1A1A1A]">Compare Providers</h2>
            <p className="text-xs text-[#888884] mt-0.5">Test a URL against Exa, Tavily, and Parallel simultaneously</p>
          </div>

          <form onSubmit={run} className="flex gap-3">
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://vers.sh"
              className="flex-1 text-sm border border-[#E8E7E3] bg-white rounded-xl px-4 py-3 outline-none focus:border-[#1A1A1A] transition-colors"
            />
            <button
              type="submit"
              disabled={loading || !url}
              className="flex items-center gap-2 text-sm bg-[#1A1A1A] text-white px-5 py-3 rounded-xl hover:bg-[#333] disabled:opacity-40 transition-colors"
            >
              <Search size={14} />
              {loading ? 'Searching...' : 'Compare'}
            </button>
          </form>

          {error && (
            <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>
          )}

          {loading && (
            <div className="grid grid-cols-3 gap-4">
              {SERVICES.map(s => (
                <div key={s.key} className="bg-white border border-[#E8E7E3] rounded-2xl p-5">
                  <p className="font-medium text-sm text-[#1A1A1A] mb-3">{s.label}</p>
                  <div className="flex items-center gap-2 text-xs text-[#888884]">
                    <div className="w-3 h-3 rounded-full border-2 border-[#888884] border-t-transparent animate-spin" />
                    Searching...
                  </div>
                </div>
              ))}
            </div>
          )}

          {result && (
            <>
              <p className="text-xs text-[#B0AFAB]">Raw results for <span className="font-mono">{result.domain}</span></p>
              <div className="grid grid-cols-3 gap-4">
                {SERVICES.map(s => {
                  const data = result[s.key as keyof CompareResult] as any
                  const isExpanded = expanded[s.key]
                  const count = getResultCount(s.key)
                  return (
                    <div key={s.key} className="bg-white border border-[#E8E7E3] rounded-2xl overflow-hidden">
                      <div className="px-5 py-4 border-b border-[#F0EFE9] flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm text-[#1A1A1A]">{s.label}</p>
                          <p className="text-xs text-[#B0AFAB] mt-0.5">{s.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-[#888884]">{count} results</p>
                          {data.elapsed && <p className="text-xs text-[#B0AFAB]">{(data.elapsed / 1000).toFixed(1)}s</p>}
                        </div>
                      </div>
                      {data.error ? (
                        <p className="text-xs text-red-500 p-4">{data.error}</p>
                      ) : (
                        <div className="p-3 space-y-1">
                          <button
                            onClick={() => toggle(s.key)}
                            className="flex items-center gap-1 text-xs text-[#888884] hover:text-[#1A1A1A] transition-colors w-full"
                          >
                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            {isExpanded ? 'Hide' : 'Show'} raw JSON
                          </button>
                          {isExpanded && (
                            <pre className="text-xs bg-[#F7F6F3] rounded-lg p-3 overflow-auto max-h-96 text-[#333] leading-relaxed">
                              {JSON.stringify(data.results, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
