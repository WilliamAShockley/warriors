'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, RefreshCw, ExternalLink } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type NewsItem = {
  id: string
  headline: string
  url: string
  source: string
  publishedAt: string
  target: { id: string; name: string; company: string }
}

type Target = { id: string; name: string; company: string }

export default function NewsPage() {
  const router = useRouter()
  const [items, setItems] = useState<NewsItem[]>([])
  const [targets, setTargets] = useState<Target[]>([])
  const [selectedTarget, setSelectedTarget] = useState<string>('all')
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    const [newsRes, targetsRes] = await Promise.all([
      fetch('/api/news'),
      fetch('/api/targets'),
    ])
    const [newsData, targetsData] = await Promise.all([newsRes.json(), targetsRes.json()])
    setItems(newsData)
    setTargets(targetsData)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function refreshTarget(targetId: string) {
    setRefreshing(targetId)
    await fetch(`/api/news/refresh/${targetId}`, { method: 'POST' })
    await load()
    setRefreshing(null)
  }

  async function refreshAll() {
    setRefreshing('all')
    await Promise.all(targets.map(t => fetch(`/api/news/refresh/${t.id}`, { method: 'POST' })))
    await load()
    setRefreshing(null)
  }

  const filtered = selectedTarget === 'all'
    ? items
    : items.filter(i => i.target.id === selectedTarget)

  // Build unique target list from news items + full target list
  const targetMap = new Map<string, Target>()
  targets.forEach(t => targetMap.set(t.id, t))
  const targetsWithNews = [...new Set(items.map(i => i.target.id))]
    .map(id => targetMap.get(id))
    .filter((t): t is Target => !!t)

  return (
    <div className="min-h-screen bg-[#F7F6F3] flex flex-col">
      <div className="flex items-center gap-3 px-8 pt-10 pb-4">
        <button onClick={() => router.push('/')} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
          <ArrowLeft size={16} className="text-[#888884]" />
        </button>
        <h1 className="text-lg font-semibold text-[#1A1A1A]">News</h1>
        <span className="text-sm text-[#888884]">{filtered.length} items</span>
        <button
          onClick={refreshAll}
          disabled={refreshing === 'all' || targets.length === 0}
          className="ml-auto flex items-center gap-1.5 text-xs text-[#888884] bg-white border border-[#E8E7E3] px-3 py-1.5 rounded-lg hover:border-[#C8C7C3] transition-colors disabled:opacity-50"
        >
          <RefreshCw size={11} className={refreshing === 'all' ? 'animate-spin' : ''} />
          Refresh all
        </button>
      </div>

      <div className="border-b border-[#E8E7E3] mx-8" />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-52 flex-shrink-0 border-r border-[#E8E7E3] overflow-y-auto py-3">
          <button
            onClick={() => setSelectedTarget('all')}
            className={`w-full text-left px-5 py-2 text-sm transition-colors ${
              selectedTarget === 'all'
                ? 'text-[#1A1A1A] font-medium bg-white'
                : 'text-[#888884] hover:text-[#1A1A1A]'
            }`}
          >
            All companies
            <span className="ml-1.5 text-xs text-[#B0AFAB]">{items.length}</span>
          </button>

          {targetsWithNews.map(t => {
            const count = items.filter(i => i.target.id === t.id).length
            return (
              <div key={t.id} className="flex items-center group">
                <button
                  onClick={() => setSelectedTarget(t.id)}
                  className={`flex-1 text-left px-5 py-2 text-sm transition-colors truncate ${
                    selectedTarget === t.id
                      ? 'text-[#1A1A1A] font-medium bg-white'
                      : 'text-[#888884] hover:text-[#1A1A1A]'
                  }`}
                >
                  {t.company}
                  <span className="ml-1.5 text-xs text-[#B0AFAB]">{count}</span>
                </button>
                <button
                  onClick={() => refreshTarget(t.id)}
                  disabled={!!refreshing}
                  className="opacity-0 group-hover:opacity-100 pr-3 transition-opacity disabled:opacity-30"
                  title="Refresh news"
                >
                  <RefreshCw size={10} className={`text-[#B0AFAB] ${refreshing === t.id ? 'animate-spin' : ''}`} />
                </button>
              </div>
            )
          })}

          {/* Targets with no news yet */}
          {targets
            .filter(t => !targetsWithNews.find(tw => tw.id === t.id))
            .map(t => (
              <div key={t.id} className="flex items-center group">
                <span className="flex-1 px-5 py-2 text-sm text-[#C8C7C3] truncate">{t.company}</span>
                <button
                  onClick={() => refreshTarget(t.id)}
                  disabled={!!refreshing}
                  className="opacity-0 group-hover:opacity-100 pr-3 transition-opacity disabled:opacity-30"
                  title="Fetch news"
                >
                  <RefreshCw size={10} className={`text-[#B0AFAB] ${refreshing === t.id ? 'animate-spin' : ''}`} />
                </button>
              </div>
            ))}
        </div>

        {/* Feed */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-sm text-[#888884]">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <p className="text-sm text-[#888884]">
                {targets.length === 0
                  ? 'Add targets to start seeing news'
                  : 'No news yet — click refresh to fetch'}
              </p>
            </div>
          ) : (
            filtered.map((item, i) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-start gap-4 px-8 py-4 hover:bg-white/70 transition-colors border-b border-[#E8E7E3] group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 mb-1">
                    <p className="text-sm text-[#1A1A1A] leading-snug flex-1">{item.headline}</p>
                    <ExternalLink size={12} className="text-[#C8C7C3] group-hover:text-[#888884] flex-shrink-0 mt-0.5 transition-colors" />
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedTarget === 'all' && (
                      <span className="text-xs text-[#888884] bg-[#F0EFE9] px-2 py-0.5 rounded-full flex-shrink-0">
                        {item.target.company}
                      </span>
                    )}
                    <span className="text-xs text-[#B0AFAB]">{item.source}</span>
                    <span className="text-xs text-[#B0AFAB]">·</span>
                    <span className="text-xs text-[#B0AFAB]">
                      {formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </a>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
