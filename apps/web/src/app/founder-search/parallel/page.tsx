'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, ChevronDown, ChevronRight, CheckCircle } from 'lucide-react'

type Attempt = { output: string; confidence: string; run_id: string }

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  low: 'bg-red-50 text-red-700 border-red-200',
  unknown: 'bg-gray-50 text-gray-500 border-gray-200',
}

export default function ParallelFounderSearchPage() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [attemptNum, setAttemptNum] = useState(0)
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [candidates, setCandidates] = useState<Attempt[]>([])
  const [resolved, setResolved] = useState(false)
  const [showRequest, setShowRequest] = useState(false)
  const [showResponse, setShowResponse] = useState(false)
  const [debugRequest, setDebugRequest] = useState<object | null>(null)
  const [debugResponse, setDebugResponse] = useState<object | null>(null)

  async function run(e: React.FormEvent) {
    e.preventDefault()
    if (!url) return
    setLoading(true)
    setOutput('')
    setError('')
    setCandidates([])
    setResolved(false)
    setAttemptNum(0)
    setDebugRequest(null)
    setDebugResponse(null)

    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`
    const collected: Attempt[] = []

    for (let i = 0; i < 3; i++) {
      setAttemptNum(i + 1)
      try {
        const res = await fetch('/api/founder-search/parallel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: normalizedUrl }),
        })
        const data = await res.json()
        if (data._request) setDebugRequest(data._request)
        if (data._response) setDebugResponse(data._response)
        if (data.error) { setError(data.error); break }

        const attempt: Attempt = { output: data.output, confidence: data.confidence, run_id: data.run_id }
        collected.push(attempt)
        setCandidates([...collected])

        if (data.confidence === 'high') {
          setOutput(data.output)
          setResolved(true)
          break
        }
      } catch (err) {
        setError(String(err))
        break
      }
    }

    setLoading(false)
  }

  function selectCandidate(output: string) {
    setOutput(output)
    setResolved(true)
  }

  function renderOutput(text: string) {
    const safe = typeof text === 'string' ? text : JSON.stringify(text, null, 2)
    return safe.split('\n').map((line, i) => {
      if (line.startsWith('## ')) return <h3 key={i} className="font-semibold text-[#1A1A1A] mt-4 mb-1 text-sm first:mt-0">{line.slice(3)}</h3>
      if (line.startsWith('# ')) return <h2 key={i} className="font-semibold text-[#1A1A1A] mt-4 mb-1 first:mt-0">{line.slice(2)}</h2>
      if (line.trim() === '') return <div key={i} className="h-2" />
      return <p key={i} className="text-sm text-[#333] leading-relaxed">{line.replace(/\*\*(.*?)\*\*/g, '$1')}</p>
    })
  }

  const loadingMessage = attemptNum === 1
    ? 'Parallel is searching the web...'
    : `Low confidence — retrying (attempt ${attemptNum}/3)...`

  return (
    <div className="min-h-screen bg-[#F7F6F3]">
      <header className="px-10 pt-12 pb-6 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-black/5 transition-colors -ml-2">
          <ArrowLeft size={16} className="text-[#888884]" />
        </button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#1A1A1A]">Founder Search (Parallel Web Systems)</h1>
          <p className="text-sm text-[#888884] mt-0.5">Drop any URL and let Parallel find the founder</p>
        </div>
      </header>

      <main className="px-10 pb-10 max-w-2xl space-y-6">
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
            {loading ? `Attempt ${attemptNum}/3` : 'Search'}
          </button>
        </form>

        {loading && (
          <div className="bg-white border border-[#E8E7E3] rounded-2xl p-6 flex items-center gap-3">
            <div className="w-4 h-4 rounded-full border-2 border-[#1A1A1A] border-t-transparent animate-spin flex-shrink-0" />
            <p className="text-sm text-[#888884]">{loadingMessage}</p>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* High-confidence result */}
        {output && resolved && !loading && (
          <div className="bg-white border border-[#E8E7E3] rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle size={14} className="text-green-600" />
              <span className="text-xs text-green-700 font-medium">High confidence answer</span>
              {candidates.length > 1 && (
                <span className="text-xs text-[#B0AFAB]">· found on attempt {candidates.findIndex(c => c.output === output) + 1}</span>
              )}
            </div>
            {renderOutput(output)}
          </div>
        )}

        {/* Cap hit — show all candidates for selection */}
        {!resolved && !loading && candidates.length === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-[#888884]">
              Parallel returned 3 low-confidence results. Select the one you believe is correct:
            </p>
            {candidates.map((c, i) => (
              <div key={c.run_id} className="bg-white border border-[#E8E7E3] rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-[#F0EFE9] flex items-center justify-between">
                  <span className="text-xs font-medium text-[#1A1A1A]">Attempt {i + 1}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${CONFIDENCE_COLORS[c.confidence] ?? CONFIDENCE_COLORS.unknown}`}>
                      {c.confidence}
                    </span>
                    <button
                      onClick={() => selectCandidate(c.output)}
                      className="text-xs bg-[#1A1A1A] text-white px-3 py-1 rounded-lg hover:bg-[#333] transition-colors"
                    >
                      Select
                    </button>
                  </div>
                </div>
                <div className="p-5">{renderOutput(c.output)}</div>
              </div>
            ))}
          </div>
        )}

        {/* Debug section */}
        {(debugRequest || debugResponse) && !loading && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-[#888884] uppercase tracking-wide">Debug</p>
            {debugRequest && (
              <div className="bg-white border border-[#E8E7E3] rounded-xl overflow-hidden">
                <button onClick={() => setShowRequest(v => !v)} className="flex items-center gap-2 w-full px-4 py-3 text-xs text-[#555] hover:bg-[#F7F6F3] transition-colors">
                  {showRequest ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span className="font-medium">Request to Parallel</span>
                </button>
                {showRequest && (
                  <pre className="text-xs bg-[#F7F6F3] border-t border-[#E8E7E3] p-4 overflow-auto max-h-64 text-[#333] leading-relaxed">
                    {JSON.stringify(debugRequest, null, 2)}
                  </pre>
                )}
              </div>
            )}
            {debugResponse && (
              <div className="bg-white border border-[#E8E7E3] rounded-xl overflow-hidden">
                <button onClick={() => setShowResponse(v => !v)} className="flex items-center gap-2 w-full px-4 py-3 text-xs text-[#555] hover:bg-[#F7F6F3] transition-colors">
                  {showResponse ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span className="font-medium">Raw response from Parallel</span>
                </button>
                {showResponse && (
                  <pre className="text-xs bg-[#F7F6F3] border-t border-[#E8E7E3] p-4 overflow-auto max-h-96 text-[#333] leading-relaxed">
                    {JSON.stringify(debugResponse, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
