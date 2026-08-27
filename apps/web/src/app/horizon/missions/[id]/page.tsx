'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type Detail = {
  mission: { id: string; title: string; instruction: string; status: string; createdAt: string; campaign?: { name: string; status: string; sequence?: unknown } | null }
  events: Array<{ id: string; kind: string; payload: Record<string, unknown> | null; actor: string; createdAt: string }>
  approvals: Array<{ id: string; kind: string; status: string; createdAt: string }>
  report: { members: number; sends: number; replies: number; outcomes: Record<string, number>; states: Record<string, number> } | null
  linkedinPaused: boolean
}

const STAGES = ['sourced', 'enriched', 'drafted', 'approved', 'queued', 'sent', 'replied', 'closed']

export default function MissionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [d, setD] = useState<Detail | null>(null)

  const load = useCallback(() => {
    fetch(`/api/horizon/missions/${id}`).then((r) => r.json()).then(setD)
  }, [id])
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t) }, [load])

  const act = async (action: string) => {
    await fetch(`/api/horizon/missions/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
    })
    load()
  }

  if (!d) return <div className="p-4 text-[#565c66] text-[13px]">loading…</div>
  const total = d.report?.members ?? 0
  const states = d.report?.states ?? {}
  const pending = d.approvals.filter((a) => a.status === 'pending')

  return (
    <div className="h-full overflow-y-auto p-4 text-[13px] max-w-4xl">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-[15px] text-[#e6e8ec]">{d.mission.title}</h1>
        <span className="text-[#e8b04b]">{d.mission.status}</span>
        {d.linkedinPaused && <span className="text-[#d16a6a] text-[11px]">[linkedin channel paused]</span>}
        <span className="ml-auto flex gap-2 text-[12px]">
          {d.mission.status === 'running' && <button onClick={() => act('pause')} className="border border-[#2c313a] rounded px-2 py-0.5 hover:bg-[#181b20]">pause</button>}
          {d.mission.status === 'paused' && <button onClick={() => act('resume')} className="border border-[#2c313a] rounded px-2 py-0.5 hover:bg-[#181b20]">resume</button>}
          {d.linkedinPaused && <button onClick={() => act('resume-linkedin')} className="border border-[#2c313a] rounded px-2 py-0.5 hover:bg-[#181b20]">resume linkedin</button>}
          {!['completed', 'failed'].includes(d.mission.status) && (
            <button
              onClick={() => { if (confirm('Cancel this mission? Open memberships will be closed.')) act('cancel') }}
              className="border border-[#3a2c2c] text-[#d16a6a] rounded px-2 py-0.5 hover:bg-[#1f1517]"
            >cancel</button>
          )}
        </span>
      </div>
      <div className="mt-1 text-[#565c66] text-[12px]">“{d.mission.instruction}”</div>

      {/* progress bar by pipeline stage */}
      {total > 0 && (
        <div className="mt-4">
          <div className="flex h-3 w-full overflow-hidden rounded border border-[#22262c]">
            {STAGES.map((s, i) => {
              const n = states[s] ?? 0
              if (!n) return null
              const hues = ['#3d434c', '#4a5568', '#5a6e8c', '#6e86a8', '#e8b04b', '#4f9e64', '#7d94c0', '#8a919c']
              return <div key={s} title={`${s}: ${n}`} style={{ width: `${(n / total) * 100}%`, background: hues[i] }} />
            })}
          </div>
          <div className="mt-1 text-[11px] text-[#565c66]">
            {STAGES.filter((s) => states[s]).map((s) => `${s} ${states[s]}`).join(' · ')}
            {states['excluded'] ? ` · excluded ${states['excluded']}` : ''}
            &nbsp;— sends {d.report?.sends ?? 0}, replies {d.report?.replies ?? 0}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="mt-4 border border-[#3a3320] bg-[#171408] rounded p-3">
          <div className="text-[#e8b04b] text-[12px] mb-1">pending approvals</div>
          {pending.map((a) => (
            <Link key={a.id} href={`/horizon/approvals?approval=${a.id}`} className="block text-[#8fa3c0] hover:underline text-[12px]">
              → {a.kind}
            </Link>
          ))}
        </div>
      )}

      {/* run timeline, newest first */}
      <div className="mt-5 text-[#565c66] text-[11px] uppercase">timeline</div>
      <div className="mt-1 space-y-1">
        {d.events.map((e) => (
          <div key={e.id} className="flex gap-3 border-t border-[#16191e] py-1">
            <span className="text-[#565c66] text-[11px] w-32 shrink-0">{new Date(e.createdAt).toLocaleString()}</span>
            <span className={`w-36 shrink-0 text-[12px] ${e.kind === 'error' ? 'text-[#d16a6a]' : e.kind === 'approval-requested' ? 'text-[#e8b04b]' : 'text-[#9aa0ab]'}`}>
              {e.kind}{(e.payload as { flag?: string })?.flag === 'operator-attention' ? ' ★' : ''}
            </span>
            <span className="text-[#aeb4bd] text-[12px] break-all">{e.payload ? JSON.stringify(e.payload) : ''}</span>
            <span className="ml-auto text-[#3d434c] text-[11px]">{e.actor}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
