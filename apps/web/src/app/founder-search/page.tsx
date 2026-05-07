'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, ChevronDown, ChevronRight } from 'lucide-react'

type CompareResult = {
  url: string
  domain: string
  exa: {
    results: { findSimilar: unknown[]; search: unknown[] } | null
    elapsed: number
    error?: string
  }
  tavily: {
    results: unknown[] | null
    elapsed: number
    error?: string
  }
  parallel: {
    results: unknown[] | null
    elapsed: number
    error?: string
  }
}

const SERVICES = [
  { key: 'exa', label: 'Exa', description: 'Neural/semantic search' },
  { key: 'tavily', label: 'Tavily', description: 'Keyword search' },
  { key: 'parallel', label: 'Parallel AI', description: 'Deep web research' },
] as const

export default function FounderSearchPage() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CompareResult | null>(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

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
        <button
          onClick={() => router.push('/')}
          className="p-2 rounded-lg hover:bg-black/5 transition-colors -ml-2"
        >
          <ArrowLeft size={16} className="text-[#888884]" />
        </button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#1A1A1A]">Founder Search</h1>
          <p className="text-sm text-[#888884] mt-0.5">Compare Exa, Tavily, and Parallel AI</p>
        </div>
      </header>

      <main className="px-10 pb-10 max-w-5xl space-y-6">
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
          <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {error}
          </div>
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
      </main>
    </div>
  )
}
