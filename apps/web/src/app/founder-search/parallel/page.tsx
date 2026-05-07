'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search } from 'lucide-react'

export default function ParallelFounderSearchPage() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')

  async function run(e: React.FormEvent) {
    e.preventDefault()
    if (!url) return
    setLoading(true)
    setOutput('')
    setError('')

    try {
      const res = await fetch('/api/founder-search/parallel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.startsWith('http') ? url : `https://${url}` }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setOutput(data.output ?? '')
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  function renderOutput(text: string) {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('## ')) return <h3 key={i} className="font-semibold text-[#1A1A1A] mt-4 mb-1 text-sm first:mt-0">{line.slice(3)}</h3>
      if (line.startsWith('# ')) return <h2 key={i} className="font-semibold text-[#1A1A1A] mt-4 mb-1 first:mt-0">{line.slice(2)}</h2>
      if (line.trim() === '') return <div key={i} className="h-2" />
      return <p key={i} className="text-sm text-[#333] leading-relaxed">{line.replace(/\*\*(.*?)\*\*/g, '$1')}</p>
    })
  }

  return (
    <div className="min-h-screen bg-[#F7F6F3]">
      <header className="px-10 pt-12 pb-6 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-black/5 transition-colors -ml-2"
        >
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
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        {url && (
          <p className="text-xs text-[#B0AFAB] font-mono">
            "Can you tell me who the founder of {url.startsWith('http') ? url : `https://${url}`} is?"
          </p>
        )}

        {loading && (
          <div className="bg-white border border-[#E8E7E3] rounded-2xl p-6 flex items-center gap-3">
            <div className="w-4 h-4 rounded-full border-2 border-[#1A1A1A] border-t-transparent animate-spin flex-shrink-0" />
            <p className="text-sm text-[#888884]">Parallel is searching the web...</p>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {output && !loading && (
          <div className="bg-white border border-[#E8E7E3] rounded-2xl p-6">
            {renderOutput(output)}
          </div>
        )}
      </main>
    </div>
  )
}
