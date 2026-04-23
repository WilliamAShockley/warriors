'use client'

import { useState, useEffect } from 'react'
import { X, Copy, Check, Plus } from 'lucide-react'

type Skill = {
  id: string
  name: string
  description: string
  section: string
}

type Props = {
  skill: Skill
  targetId?: string
  onClose: () => void
  onLogActivity?: (description: string) => void
}

export default function RunSkillModal({ skill, targetId, onClose, onLogActivity }: Props) {
  const [output, setOutput] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [logging, setLogging] = useState(false)

  useEffect(() => {
    run()
  }, [])

  async function run() {
    setLoading(true)
    setOutput('')
    try {
      const res = await fetch(`/api/skills/${skill.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId }),
      })
      const data = await res.json()
      setOutput(data.output ?? data.error ?? 'No output.')
    } catch (err) {
      setOutput(`Error: ${String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function logAsActivity() {
    if (!onLogActivity || !targetId) return
    setLogging(true)
    await fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetId,
        type: 'note',
        description: `[${skill.name}]\n${output.slice(0, 500)}`,
        date: new Date().toISOString(),
      }),
    })
    setLogging(false)
    onLogActivity(output)
  }

  function renderOutput(text: string) {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('## ')) return <h3 key={i} className="font-semibold text-[#1A1A1A] mt-4 mb-1 text-sm first:mt-0">{line.slice(3)}</h3>
      if (line.startsWith('# ')) return <h2 key={i} className="font-semibold text-[#1A1A1A] mt-4 mb-1 first:mt-0">{line.slice(2)}</h2>
      if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-medium text-sm">{line.slice(2, -2)}</p>
      if (line.trim() === '') return <div key={i} className="h-2" />
      return <p key={i} className="text-sm text-[#333] leading-relaxed">{line.replace(/\*\*(.*?)\*\*/g, '$1')}</p>
    })
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#E8E7E3] flex-shrink-0">
          <div>
            <h2 className="font-semibold text-[#1A1A1A]">{skill.name}</h2>
            {skill.description && <p className="text-xs text-[#888884] mt-0.5">{skill.description}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
            <X size={16} className="text-[#888884]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-[#888884]">
              <div className="w-3 h-3 rounded-full border-2 border-[#888884] border-t-transparent animate-spin" />
              Running skill...
            </div>
          ) : (
            <div>{renderOutput(output)}</div>
          )}
        </div>

        {!loading && output && (
          <div className="px-6 py-4 border-t border-[#E8E7E3] flex items-center gap-2 flex-shrink-0">
            <button
              onClick={run}
              className="text-xs text-[#888884] border border-[#E8E7E3] px-3 py-1.5 rounded-lg hover:border-[#C8C7C3] transition-colors"
            >
              Regenerate
            </button>
            <button
              onClick={copy}
              className="flex items-center gap-1.5 text-xs text-[#888884] border border-[#E8E7E3] px-3 py-1.5 rounded-lg hover:border-[#C8C7C3] transition-colors"
            >
              {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            {onLogActivity && targetId && (
              <button
                onClick={logAsActivity}
                disabled={logging}
                className="ml-auto flex items-center gap-1.5 text-xs bg-[#1A1A1A] text-white px-3 py-1.5 rounded-lg hover:bg-[#333] disabled:opacity-40 transition-colors"
              >
                <Plus size={11} />
                {logging ? 'Logging...' : 'Log as activity'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
