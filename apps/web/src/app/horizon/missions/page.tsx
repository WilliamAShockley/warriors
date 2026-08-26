'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type MissionRow = {
  id: string
  title: string
  type: string
  status: string
  createdAt: string
  campaign?: { name: string; status: string } | null
  pendingApprovals: Array<{ id: string; kind: string }>
  stateCounts: Record<string, number>
}

const STATUS_COLOR: Record<string, string> = {
  running: 'text-[#4f9e64]',
  'awaiting-approval': 'text-[#e8b04b]',
  paused: 'text-[#8a919c]',
  completed: 'text-[#7d94c0]',
  failed: 'text-[#d16a6a]',
  created: 'text-[#9aa0ab]',
}

export default function MissionsPage() {
  const [missions, setMissions] = useState<MissionRow[]>([])
  useEffect(() => {
    fetch('/api/horizon/missions').then((r) => r.json()).then((d) => setMissions(d.missions ?? []))
  }, [])

  return (
    <div className="h-full overflow-y-auto p-4 text-[13px]">
      <div className="text-[#565c66] mb-3">{missions.length} missions</div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left text-[#565c66] text-[11px] uppercase">
            <th className="py-1 pr-4">mission</th>
            <th className="py-1 pr-4">status</th>
            <th className="py-1 pr-4">campaign</th>
            <th className="py-1 pr-4">pipeline</th>
            <th className="py-1 pr-4">pending</th>
            <th className="py-1">created</th>
          </tr>
        </thead>
        <tbody>
          {missions.map((m) => (
            <tr key={m.id} className="border-t border-[#1d2127] hover:bg-[#12151a]">
              <td className="py-1.5 pr-4">
                <Link href={`/horizon/missions/${m.id}`} className="text-[#8fa3c0] hover:underline">{m.title}</Link>
              </td>
              <td className={`py-1.5 pr-4 ${STATUS_COLOR[m.status] ?? ''}`}>{m.status}</td>
              <td className="py-1.5 pr-4 text-[#9aa0ab]">{m.campaign?.name ?? '—'}</td>
              <td className="py-1.5 pr-4 text-[#9aa0ab]">
                {Object.entries(m.stateCounts).map(([k, v]) => `${k}:${v}`).join(' ') || '—'}
              </td>
              <td className="py-1.5 pr-4 text-[#e8b04b]">
                {m.pendingApprovals.map((a) => a.kind).join(', ') || '—'}
              </td>
              <td className="py-1.5 text-[#565c66]">{new Date(m.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
