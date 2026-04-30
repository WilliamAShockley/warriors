'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, ChevronDown, ChevronRight, Play, Pencil, Trash2 } from 'lucide-react'
import AgentModal from '@/components/AgentModal'

type AgentRun = {
  id: string
  status: string
  output: string
  trigger: string
  targetId: string | null
  createdAt: string
}

type Agent = {
  id: string
  name: string
  description: string
  prompt: string
  triggerType: string
  intervalSeconds: number | null
  eventType: string | null
  scope: string
  model: string
  enabled: boolean
  lastRunAt: string | null
  createdAt: string
  runs: AgentRun[]
}

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual',
  continuous: 'Continuous',
  scheduled: 'Scheduled',
  event: 'Event',
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function AgentsPage() {
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentModal, setAgentModal] = useState<{ open: boolean; agent?: Agent }>({ open: false })
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const res = await fetch('/api/agents')
    if (res.ok) setAgents(await res.json())
  }, [])

  useEffect(() => { load() }, [load])

  async function toggle(agent: Agent) {
    await fetch(`/api/agents/${agent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !agent.enabled }),
    })
    load()
  }

  async function runNow(agent: Agent) {
    setRunning(s => new Set(s).add(agent.id))
    await fetch(`/api/agents/${agent.id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    setRunning(s => { const n = new Set(s); n.delete(agent.id); return n })
    load()
  }

  async function remove(agent: Agent) {
    if (!confirm(`Delete agent "${agent.name}"?`)) return
    await fetch(`/api/agents/${agent.id}`, { method: 'DELETE' })
    load()
  }

  function toggleRuns(id: string) {
    setExpandedRuns(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  return (
    <div className="min-h-screen bg-[#F7F6F3]">
      <header className="px-10 pt-12 pb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="p-2 rounded-lg hover:bg-black/5 transition-colors -ml-2"
          >
            <ArrowLeft size={16} className="text-[#888884]" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#1A1A1A]">Agents</h1>
            <p className="text-sm text-[#888884] mt-0.5">Autonomous LLM automations</p>
          </div>
        </div>
        <button
          onClick={() => setAgentModal({ open: true })}
          className="flex items-center gap-1.5 text-sm bg-[#1A1A1A] text-white px-4 py-2 rounded-lg hover:bg-[#333] transition-colors"
        >
          <Plus size={14} />
          New Agent
        </button>
      </header>

      <main className="px-10 pb-10 space-y-3 max-w-3xl">
        {agents.length === 0 && (
          <div className="text-center py-16 text-[#888884] text-sm">
            No agents yet. Create one to get started.
          </div>
        )}

        {agents.map(agent => (
          <div key={agent.id} className="bg-white rounded-2xl border border-[#E8E7E3]">
            <div className="p-5">
              <div className="flex items-start gap-3">
                {/* Toggle */}
                <button
                  onClick={() => toggle(agent)}
                  className="mt-0.5 flex-shrink-0 relative inline-flex items-center cursor-pointer"
                  title={agent.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                >
                  <div className={[
                    'w-9 h-5 rounded-full transition-colors',
                    agent.enabled ? 'bg-[#1A1A1A]' : 'bg-[#E8E7E3]',
                  ].join(' ')} />
                  <div className={[
                    'absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform',
                    agent.enabled ? 'translate-x-4' : 'translate-x-0',
                  ].join(' ')} />
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-[#1A1A1A]">{agent.name}</span>
                    <span className="text-xs bg-[#F0EFE9] text-[#888884] px-2 py-0.5 rounded-full">
                      {TRIGGER_LABELS[agent.triggerType] ?? agent.triggerType}
                    </span>
                    <span className="text-xs bg-[#F0EFE9] text-[#888884] px-2 py-0.5 rounded-full">
                      {agent.scope}
                    </span>
                  </div>
                  {agent.description && (
                    <p className="text-sm text-[#888884] mt-0.5 leading-snug">{agent.description}</p>
                  )}
                  {agent.lastRunAt && (
                    <p className="text-xs text-[#B0AFAB] mt-1">Last run {timeAgo(agent.lastRunAt)}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => runNow(agent)}
                    disabled={running.has(agent.id)}
                    className="flex items-center gap-1 text-xs text-[#888884] border border-[#E8E7E3] px-2.5 py-1.5 rounded-lg hover:border-[#C8C7C3] disabled:opacity-40 transition-colors"
                  >
                    <Play size={11} />
                    {running.has(agent.id) ? 'Running…' : 'Run Now'}
                  </button>
                  <button
                    onClick={() => setAgentModal({ open: true, agent })}
                    className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
                  >
                    <Pencil size={13} className="text-[#888884]" />
                  </button>
                  <button
                    onClick={() => remove(agent)}
                    className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
                  >
                    <Trash2 size={13} className="text-[#888884]" />
                  </button>
                </div>
              </div>

              {/* Runs toggle */}
              {agent.runs.length > 0 && (
                <button
                  onClick={() => toggleRuns(agent.id)}
                  className="flex items-center gap-1 text-xs text-[#888884] mt-3 hover:text-[#1A1A1A] transition-colors"
                >
                  {expandedRuns.has(agent.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  {agent.runs.length} run{agent.runs.length !== 1 ? 's' : ''}
                </button>
              )}
            </div>

            {/* Run history */}
            {expandedRuns.has(agent.id) && (
              <div className="border-t border-[#F0EFE9] px-5 pb-4 space-y-2 pt-3">
                {agent.runs.map(run => (
                  <div key={run.id} className="flex items-start gap-2">
                    <span className={[
                      'text-xs font-medium mt-0.5 flex-shrink-0 w-14',
                      run.status === 'success' ? 'text-emerald-600' : 'text-red-500',
                    ].join(' ')}>
                      {run.status}
                    </span>
                    <span className="text-xs text-[#B0AFAB] flex-shrink-0 mt-0.5 w-16">{timeAgo(run.createdAt)}</span>
                    <span className="text-xs text-[#888884] flex-shrink-0 mt-0.5 w-12">{run.trigger}</span>
                    <span className="text-xs text-[#1A1A1A] leading-relaxed line-clamp-2">
                      {run.output.slice(0, 200)}{run.output.length > 200 ? '…' : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </main>

      {agentModal.open && (
        <AgentModal
          agent={agentModal.agent}
          onClose={() => setAgentModal({ open: false })}
          onSaved={() => { setAgentModal({ open: false }); load() }}
        />
      )}
    </div>
  )
}
