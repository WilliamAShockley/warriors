'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type Brief = {
  id: string
  content: string
  updatedAt: string
  target: { id: string; name: string; company: string; status: string }
}

type Target = { id: string; name: string; company: string; status: string }

const STATUS_DOT: Record<string, string> = {
  green: 'bg-emerald-400',
  yellow: 'bg-green-300',
  red: 'bg-red-400',
}

function MarkdownContent({ content }: { content: string }) {
  // Simple markdown renderer for the brief
  const lines = content.split('\n')
  return (
    <div className="text-sm text-[#1A1A1A] leading-relaxed space-y-2">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return <h3 key={i} className="font-semibold text-[#1A1A1A] mt-4 mb-1 first:mt-0">{line.slice(3)}</h3>
        }
        if (line.startsWith('**') && line.endsWith('**')) {
          return <p key={i} className="font-medium">{line.slice(2, -2)}</p>
        }
        if (line.trim() === '') return <div key={i} className="h-1" />
        return <p key={i} className="text-[#444]">{line.replace(/\*\*(.*?)\*\*/g, '$1')}</p>
      })}
    </div>
  )
}

export default function ResearchPage() {
  const router = useRouter()
  const [briefs, setBriefs] = useState<Brief[]>([])
  const [targets, setTargets] = useState<Target[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [generating, setGenerating] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    const [briefsRes, targetsRes] = await Promise.all([
      fetch('/api/research'),
      fetch('/api/targets'),
    ])
    const [briefsData, targetsData] = await Promise.all([briefsRes.json(), targetsRes.json()])
    setBriefs(briefsData)
    setTargets(targetsData)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function generateBrief(targetId: string) {
    setGenerating(targetId)
    await fetch(`/api/research/brief/${targetId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: true }),
    })
    await load()
    setExpanded(targetId)
    setGenerating(null)
  }

  const briefMap = new Map(briefs.map(b => [b.target.id, b]))

  // Targets without briefs
  const targetsWithoutBrief = targets.filter(t => !briefMap.has(t.id))

  return (
    <div className="min-h-screen bg-[#F7F6F3] flex flex-col">
      <div className="flex items-center gap-3 px-8 pt-10 pb-4">
        <button onClick={() => router.push('/')} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
          <ArrowLeft size={16} className="text-[#888884]" />
        </button>
        <h1 className="text-lg font-semibold text-[#1A1A1A]">Research</h1>
        <span className="text-sm text-[#888884]">{briefs.length} brief{briefs.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="border-b border-[#E8E7E3] mx-8" />

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-3 max-w-3xl">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm text-[#888884]">Loading...</div>
        ) : (
          <>
            {/* Briefs */}
            {briefs.map(brief => {
              const isExpanded = expanded === brief.target.id
              return (
                <div key={brief.id} className="bg-white border border-[#E8E7E3] rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setExpanded(isExpanded ? null : brief.target.id)}
                    className="w-full flex items-center gap-3 px-5 py-4 hover:bg-[#F7F6F3] transition-colors"
                  >
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[brief.target.status] ?? 'bg-gray-300'}`} />
                    <div className="flex-1 text-left min-w-0">
                      <span className="font-medium text-[#1A1A1A] text-sm">{brief.target.company}</span>
                      <span className="text-[#888884] text-sm ml-2">{brief.target.name}</span>
                    </div>
                    <span className="text-xs text-[#B0AFAB] flex-shrink-0">
                      {formatDistanceToNow(new Date(brief.updatedAt), { addSuffix: true })}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); generateBrief(brief.target.id) }}
                      disabled={generating === brief.target.id}
                      className="p-1 rounded hover:bg-[#E8E7E3] transition-colors disabled:opacity-50 ml-1"
                      title="Regenerate brief"
                    >
                      <RefreshCw size={11} className={`text-[#888884] ${generating === brief.target.id ? 'animate-spin' : ''}`} />
                    </button>
                    {isExpanded ? (
                      <ChevronUp size={14} className="text-[#888884] flex-shrink-0" />
                    ) : (
                      <ChevronDown size={14} className="text-[#888884] flex-shrink-0" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-[#F0EFE9] pt-4">
                      <MarkdownContent content={brief.content} />
                    </div>
                  )}
                </div>
              )
            })}

            {/* Targets without briefs */}
            {targetsWithoutBrief.map(target => (
              <div key={target.id} className="bg-white border border-dashed border-[#E8E7E3] rounded-2xl px-5 py-4 flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[target.status] ?? 'bg-gray-300'}`} />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-[#C8C7C3] text-sm">{target.company}</span>
                  <span className="text-[#C8C7C3] text-sm ml-2">{target.name}</span>
                </div>
                <button
                  onClick={() => generateBrief(target.id)}
                  disabled={generating === target.id}
                  className="flex items-center gap-1.5 text-xs text-[#888884] bg-[#F7F6F3] border border-[#E8E7E3] px-3 py-1.5 rounded-lg hover:border-[#C8C7C3] transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={11} className={generating === target.id ? 'animate-spin' : ''} />
                  {generating === target.id ? 'Generating...' : 'Generate brief'}
                </button>
              </div>
            ))}

            {targets.length === 0 && (
              <div className="flex items-center justify-center h-40">
                <p className="text-sm text-[#888884]">Add targets to generate company briefs</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
