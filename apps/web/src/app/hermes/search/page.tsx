'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, Filter, X, Loader2 } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResult {
  id: string
  name: string
  company: string
  similarity: number
  score: number | null
  combinedScore: number
  cluster: string | null
  synthesizedBlob: string | null
  sourceType: string | null
}

interface ClusterOption {
  id: string
  label: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HermesSearchPage() {
  const router = useRouter()

  // Search state
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  // Filter state
  const [showFilters, setShowFilters] = useState(false)
  const [filterSourceType, setFilterSourceType] = useState('')
  const [filterCluster, setFilterCluster] = useState('')
  const [limit, setLimit] = useState(20)
  const [clusters, setClusters] = useState<ClusterOption[]>([])

  const inputRef = useRef<HTMLInputElement>(null)

  // Load clusters for filter dropdown
  useEffect(() => {
    fetch('/api/hermes/clusters')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setClusters(data.map((c: any) => ({ id: c.id, label: c.label })))
        }
      })
      .catch(() => {})
  }, [])

  // Focus search input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const runSearch = useCallback(async () => {
    const trimmed = query.trim()
    if (!trimmed) return

    setLoading(true)
    setError(null)
    setHasSearched(true)

    try {
      const params = new URLSearchParams({ q: trimmed, limit: String(limit) })
      if (filterCluster) params.set('cluster', filterCluster)
      if (filterSourceType) params.set('sourceType', filterSourceType)

      const res = await fetch(`/api/hermes/search?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Search failed' }))
        throw new Error(body.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      setResults(data.results || [])
    } catch (err: any) {
      setError(err.message)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [query, limit, filterCluster, filterSourceType])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') runSearch()
  }

  const clearFilters = () => {
    setFilterSourceType('')
    setFilterCluster('')
    setLimit(20)
  }

  const SOURCE_TYPES = [
    'linkedin_company',
    'linkedin_founder',
    'vc_website',
    'vc_portfolio',
    'techcrunch',
    'hackernews',
    'google_news',
    'monitor_hit',
  ]

  return (
    <div className="min-h-screen bg-[#F7F6F3]">
      {/* Header */}
      <header className="px-10 pt-10 pb-4">
        <button
          onClick={() => router.push('/hermes')}
          className="flex items-center gap-1.5 text-sm text-[#888884] hover:text-[#1A1A1A] transition mb-4"
        >
          <ArrowLeft size={14} /> Back to Hermes
        </button>
        <h1 className="text-2xl font-semibold tracking-tight text-[#1A1A1A]">
          Semantic Search
        </h1>
        <p className="text-sm text-[#888884] mt-1">
          Natural language search across all entities via vector embeddings
        </p>
      </header>

      {/* Search Bar */}
      <div className="px-10 pb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888884]"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='Search e.g. "tokenized private credit" or "defi lending protocol"'
              className="w-full pl-10 pr-4 py-2.5 bg-white rounded-lg border border-[#E8E8E4]
                         text-sm text-[#1A1A1A] placeholder:text-[#B8B8B4]
                         focus:outline-none focus:ring-2 focus:ring-[#1A1A1A]/10"
            />
          </div>
          <button
            onClick={runSearch}
            disabled={loading || !query.trim()}
            className="px-5 py-2.5 bg-[#1A1A1A] text-white text-sm font-medium rounded-lg
                       hover:bg-[#333] disabled:opacity-40 disabled:cursor-not-allowed
                       transition flex items-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Search
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-2.5 rounded-lg border text-sm transition ${
              showFilters || filterSourceType || filterCluster
                ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white'
                : 'border-[#E8E8E4] bg-white text-[#888884] hover:text-[#1A1A1A]'
            }`}
          >
            <Filter size={14} />
          </button>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="mt-3 p-4 bg-white rounded-lg border border-[#E8E8E4] flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs text-[#888884] mb-1">Source Type</label>
              <select
                value={filterSourceType}
                onChange={(e) => setFilterSourceType(e.target.value)}
                className="text-sm border border-[#E8E8E4] rounded-md px-2 py-1.5 bg-white text-[#1A1A1A]"
              >
                <option value="">All sources</option>
                {SOURCE_TYPES.map((st) => (
                  <option key={st} value={st}>
                    {st.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-[#888884] mb-1">Cluster</label>
              <select
                value={filterCluster}
                onChange={(e) => setFilterCluster(e.target.value)}
                className="text-sm border border-[#E8E8E4] rounded-md px-2 py-1.5 bg-white text-[#1A1A1A]"
              >
                <option value="">All clusters</option>
                {clusters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-[#888884] mb-1">Limit</label>
              <select
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value, 10))}
                className="text-sm border border-[#E8E8E4] rounded-md px-2 py-1.5 bg-white text-[#1A1A1A]"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {(filterSourceType || filterCluster || limit !== 20) && (
              <button
                onClick={clearFilters}
                className="text-xs text-[#888884] hover:text-[#1A1A1A] flex items-center gap-1 transition"
              >
                <X size={12} /> Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="px-10 pb-10">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20 text-[#888884]">
            <Loader2 size={20} className="animate-spin mr-2" />
            Embedding query and searching...
          </div>
        )}

        {!loading && hasSearched && results.length === 0 && !error && (
          <div className="text-center py-20 text-[#888884] text-sm">
            No results found. Try a different query or adjust filters.
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-[#888884] mb-2">
              {results.length} result{results.length !== 1 ? 's' : ''}
            </p>

            {results.map((r, idx) => (
              <div
                key={r.id}
                onClick={() => router.push(`/targets/${r.id}`)}
                className="bg-white rounded-lg border border-[#E8E8E4] p-4 hover:shadow-sm
                           cursor-pointer transition group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-[#B8B8B4] font-mono">
                        #{idx + 1}
                      </span>
                      <h3 className="font-medium text-[#1A1A1A] group-hover:underline truncate">
                        {r.company}
                      </h3>
                      {r.sourceType && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-[#F0F0EC] text-[#888884] rounded-full">
                          {r.sourceType.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-[#888884] mb-2">{r.name}</p>

                    {r.synthesizedBlob && (
                      <p className="text-xs text-[#A0A09C] leading-relaxed line-clamp-2">
                        {r.synthesizedBlob}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-2">
                      <ScoreBadge label="Sim" value={r.similarity} />
                      {r.score !== null && <ScoreBadge label="Score" value={r.score} />}
                      <ScoreBadge label="Rank" value={r.combinedScore} accent />
                    </div>
                    {r.cluster && (
                      <span className="text-[10px] text-[#888884] mt-1">
                        Cluster: {r.cluster}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!hasSearched && !loading && (
          <div className="text-center py-20">
            <Search size={32} className="mx-auto text-[#D4D4D0] mb-3" />
            <p className="text-sm text-[#888884]">
              Type a natural language query to search across all targets
            </p>
            <p className="text-xs text-[#B8B8B4] mt-1">
              Powered by Voyage AI embeddings and pgvector similarity search
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Score badge component
// ---------------------------------------------------------------------------

function ScoreBadge({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: boolean
}) {
  const pct = Math.round(value * 100)
  const color = accent
    ? 'bg-[#1A1A1A] text-white'
    : pct >= 70
      ? 'bg-emerald-50 text-emerald-700'
      : pct >= 40
        ? 'bg-amber-50 text-amber-700'
        : 'bg-[#F0F0EC] text-[#888884]'

  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${color}`}>
      {label}: {pct}%
    </span>
  )
}
