'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * Approval queue — all pending Approvals rendered by kind, plus the LinkedIn /
 * manual-send queue, CSV sourcing upload, and the voice-profile setting.
 * This screen is the ONLY place approvals get resolved.
 */

type TargetRow = { membershipId: string; name: string; email?: string; company?: string; role?: string; linkedinUrl?: string; enrichment?: unknown }
type DraftCheck = { id: string; pass: boolean; detail?: string }
type DraftRow = { membershipId: string; person: string; company?: string; drafts: Array<{ touchIndex: number; channel: string; subject?: string; body: string; editedBody?: string; checks?: DraftCheck[]; checksPassed?: boolean; repaired?: boolean }> }
type ApprovalRow = {
  id: string
  kind: string
  status: string
  createdAt: string
  mission: { id: string; title: string }
  detail: TargetRow[] | { messageStrategy?: string; sequence?: unknown } | { total?: number; sample: DraftRow[] } | null
}
type QueueTouch = {
  touchId: string; campaign: string; person: string; linkedinUrl?: string; email?: string
  channel: string; touchIndex: number; placementState: string; placementError?: string
  subject?: string; draftText: string
}
type MissionOpt = { id: string; title: string }

const box = 'border border-[#22262c] rounded bg-[#101317]'
const btn = 'border border-[#2c313a] rounded px-2 py-0.5 text-[12px] hover:bg-[#181b20]'
const btnGo = 'border border-[#2c4a34] text-[#4f9e64] rounded px-2 py-0.5 text-[12px] hover:bg-[#121a14]'
const btnNo = 'border border-[#3a2c2c] text-[#d16a6a] rounded px-2 py-0.5 text-[12px] hover:bg-[#1f1517]'

function ApprovalsInner() {
  const searchParams = useSearchParams()
  const highlight = searchParams.get('approval')
  const [approvals, setApprovals] = useState<ApprovalRow[]>([])
  const [touches, setTouches] = useState<QueueTouch[]>([])
  const [missions, setMissions] = useState<MissionOpt[]>([])
  const [note, setNote] = useState('')

  // per-approval edit state
  const [included, setIncluded] = useState<Record<string, Set<string>>>({})
  const [strategyEdits, setStrategyEdits] = useState<Record<string, string>>({})
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({}) // key: approvalId/membershipId/touchIndex

  // sourcing upload
  const [csvMission, setCsvMission] = useState('')
  const [csvText, setCsvText] = useState('')

  // voice profile
  const [voice, setVoice] = useState('')

  const load = useCallback(async () => {
    const [a, q, m, v] = await Promise.all([
      fetch('/api/horizon/approvals').then((r) => r.json()),
      fetch('/api/horizon/linkedin-queue').then((r) => r.json()),
      fetch('/api/horizon/missions').then((r) => r.json()),
      fetch('/api/horizon/settings').then((r) => r.json()),
    ])
    setApprovals(a.approvals ?? [])
    setTouches(q.touches ?? [])
    setMissions((m.missions ?? []).map((x: { id: string; title: string }) => ({ id: x.id, title: x.title })))
    setVoice(v.voiceProfile ?? '')
    // default include-all for target lists
    const inc: Record<string, Set<string>> = {}
    for (const ap of a.approvals ?? []) {
      if (ap.kind === 'target-list' && Array.isArray(ap.detail)) {
        inc[ap.id] = new Set((ap.detail as TargetRow[]).map((t) => t.membershipId))
      }
    }
    setIncluded((prev) => ({ ...inc, ...prev }))
  }, [])
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t) }, [load])

  const flash = (msg: string) => { setNote(msg); setTimeout(() => setNote(''), 4000) }

  const resolve = async (ap: ApprovalRow, status: 'approved' | 'rejected') => {
    const body: Record<string, unknown> = { status }
    if (ap.kind === 'target-list') body.includedMembershipIds = Array.from(included[ap.id] ?? [])
    if (ap.kind === 'message-strategy' && strategyEdits[ap.id] !== undefined) body.messageStrategy = strategyEdits[ap.id]
    if (ap.kind === 'draft-batch') {
      const edits: Array<{ membershipId: string; touchIndex: number; body: string }> = []
      for (const [key, val] of Object.entries(draftEdits)) {
        const [apId, membershipId, touchIndex] = key.split('/')
        if (apId === ap.id) edits.push({ membershipId, touchIndex: Number(touchIndex), body: val })
      }
      body.draftEdits = edits
    }
    const res = await fetch(`/api/horizon/approvals/${ap.id}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }).then((r) => r.json())
    flash(res.ok ? `${ap.kind} ${status}` : `error: ${res.error}`)
    load()
  }

  const markSent = async (touchId: string) => {
    const res = await fetch(`/api/horizon/linkedin-queue/${touchId}/mark-sent`, { method: 'POST' }).then((r) => r.json())
    flash(res.ok ? 'marked sent' : `error: ${res.error}`)
    load()
  }

  const copyDraft = async (t: QueueTouch) => {
    await navigator.clipboard.writeText(`${t.subject ? t.subject + '\n\n' : ''}${t.draftText}`)
    flash('draft copied')
  }

  const uploadCsv = async () => {
    if (!csvMission || !csvText.trim()) return flash('pick a mission and paste rows')
    const res = await fetch(`/api/horizon/missions/${csvMission}/source`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csv: csvText }),
    }).then((r) => r.json())
    flash(res.error ? `error: ${res.error}` : `imported ${res.imported} (new ${res.created}, matched ${res.matched}, excluded ${res.excluded})`)
    if (!res.error) setCsvText('')
    load()
  }

  const saveVoice = async () => {
    await fetch('/api/horizon/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ voiceProfile: voice }) })
    flash('voice profile saved')
  }

  const dueTouches = useMemo(() => touches.filter((t) => t.placementState === 'queued'), [touches])
  const inFlight = useMemo(() => touches.filter((t) => t.placementState !== 'queued'), [touches])

  return (
    <div className="h-full overflow-y-auto p-4 text-[13px] space-y-6 max-w-5xl">
      {note && <div className="fixed top-10 right-4 bg-[#1b1f26] border border-[#2c313a] rounded px-3 py-1.5 text-[12px] text-[#e8b04b] z-10">{note}</div>}

      {/* ── pending approvals ── */}
      <section>
        <div className="text-[#565c66] text-[11px] uppercase mb-2">pending approvals — {approvals.length}</div>
        {approvals.length === 0 && <div className="text-[#3d434c] text-[12px]">none.</div>}
        <div className="space-y-4">
          {approvals.map((ap) => (
            <div key={ap.id} className={`${box} p-3 ${highlight === ap.id ? 'border-[#e8b04b]' : ''}`}>
              <div className="flex items-baseline gap-3">
                <span className="text-[#e8b04b]">{ap.kind}</span>
                <span className="text-[#9aa0ab]">{ap.mission.title}</span>
                <span className="ml-auto flex gap-2">
                  <button className={btnGo} onClick={() => resolve(ap, 'approved')}>approve</button>
                  <button className={btnNo} onClick={() => resolve(ap, 'rejected')}>reject</button>
                </span>
              </div>

              {ap.kind === 'target-list' && Array.isArray(ap.detail) && (
                <div className="mt-2 max-h-72 overflow-y-auto">
                  <table className="w-full text-[12px]">
                    <thead><tr className="text-left text-[#565c66] text-[10px] uppercase">
                      <th className="pr-2">in</th><th className="pr-3">name</th><th className="pr-3">company</th><th className="pr-3">role</th><th className="pr-3">email</th><th>enrichment</th>
                    </tr></thead>
                    <tbody>
                      {(ap.detail as TargetRow[]).map((t) => {
                        const set = included[ap.id] ?? new Set<string>()
                        const on = set.has(t.membershipId)
                        return (
                          <tr key={t.membershipId} className={`border-t border-[#16191e] ${on ? '' : 'opacity-40'}`}>
                            <td className="pr-2 py-0.5">
                              <input type="checkbox" checked={on} onChange={() => {
                                setIncluded((prev) => {
                                  const next = new Set(prev[ap.id] ?? [])
                                  if (on) next.delete(t.membershipId); else next.add(t.membershipId)
                                  return { ...prev, [ap.id]: next }
                                })
                              }} />
                            </td>
                            <td className="pr-3">{t.name}</td>
                            <td className="pr-3 text-[#9aa0ab]">{t.company ?? '—'}</td>
                            <td className="pr-3 text-[#9aa0ab]">{t.role ?? '—'}</td>
                            <td className="pr-3 text-[#565c66]">{t.email ?? '—'}</td>
                            <td className="text-[#565c66] truncate max-w-56">{t.enrichment ? JSON.stringify((t.enrichment as { fields?: unknown }).fields ?? t.enrichment).slice(0, 80) : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div className="mt-1 text-[11px] text-[#565c66]">{(included[ap.id] ?? new Set()).size} of {(ap.detail as TargetRow[]).length} included</div>
                </div>
              )}

              {ap.kind === 'message-strategy' && !Array.isArray(ap.detail) && (
                <div className="mt-2">
                  <textarea
                    className="w-full h-28 bg-[#0d0f12] border border-[#22262c] rounded p-2 text-[12px] text-[#d6d8dd] outline-none"
                    defaultValue={(ap.detail as { messageStrategy?: string })?.messageStrategy ?? ''}
                    onChange={(e) => setStrategyEdits((prev) => ({ ...prev, [ap.id]: e.target.value }))}
                  />
                  <div className="text-[11px] text-[#565c66]">
                    sequence: {JSON.stringify((ap.detail as { sequence?: unknown })?.sequence ?? [])}
                  </div>
                </div>
              )}

              {ap.kind === 'draft-batch' && !Array.isArray(ap.detail) && (
                <div className="mt-2 space-y-3 max-h-96 overflow-y-auto">
                  <div className="text-[11px] text-[#565c66]">
                    sample of {(ap.detail as { total?: number })?.total ?? '?'} drafted members — edits apply in place
                    {((ap.detail as { failingChecks?: number })?.failingChecks ?? 0) > 0 && (
                      <span className="text-[#d16a6a]"> · {(ap.detail as { failingChecks?: number }).failingChecks} member(s) failed checks (listed first)</span>
                    )}
                  </div>
                  {((ap.detail as { sample: DraftRow[] })?.sample ?? []).map((s) => (
                    <div key={s.membershipId} className="border border-[#1d2127] rounded p-2">
                      <div className="text-[#8fa3c0] text-[12px]">{s.person} <span className="text-[#565c66]">{s.company}</span></div>
                      {s.drafts.map((dr) => (
                        <div key={dr.touchIndex} className="mt-1">
                          <div className="text-[11px] text-[#565c66]">
                            touch {dr.touchIndex + 1} · {dr.channel}{dr.subject ? ` · ${dr.subject}` : ''}
                            {dr.checksPassed === true && <span className="text-[#4f9e64]"> · checks ✓{dr.repaired ? ' (repaired)' : ''}</span>}
                            {dr.checksPassed === false && <span className="text-[#d16a6a]"> · checks ✗</span>}
                          </div>
                          {dr.checksPassed === false && (
                            <div className="text-[11px] text-[#d16a6a] space-x-2">
                              {(dr.checks ?? []).filter((c) => !c.pass).map((c) => (
                                <span key={c.id} title={c.detail} className="border border-[#3a2c2c] rounded px-1">{c.id}</span>
                              ))}
                            </div>
                          )}
                          <textarea
                            className="w-full h-20 bg-[#0d0f12] border border-[#22262c] rounded p-2 text-[12px] text-[#aeb4bd] outline-none"
                            defaultValue={dr.editedBody ?? dr.body}
                            onChange={(e) => setDraftEdits((prev) => ({ ...prev, [`${ap.id}/${s.membershipId}/${dr.touchIndex}`]: e.target.value }))}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                  <div className="text-[11px] text-[#e8b04b]">approving this batch grants the release — sends begin.</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── linkedin / manual send queue ── */}
      <section id="linkedin">
        <div className="text-[#565c66] text-[11px] uppercase mb-2">
          send queue — {dueTouches.length} due{inFlight.length ? `, ${inFlight.length} in flight` : ''}
        </div>
        {touches.length === 0 && <div className="text-[#3d434c] text-[12px]">empty.</div>}
        <div className="space-y-2">
          {touches.map((t) => (
            <div key={t.touchId} className={`${box} p-2`}>
              <div className="flex items-baseline gap-3 text-[12px]">
                <span className={t.channel === 'linkedin' ? 'text-[#7d94c0]' : 'text-[#4f9e64]'}>{t.channel}</span>
                <span>{t.person}</span>
                <span className="text-[#565c66]">{t.campaign} · touch {t.touchIndex + 1}</span>
                <span className={`text-[11px] ${t.placementState === 'placed' ? 'text-[#e8b04b]' : t.placementError ? 'text-[#d16a6a]' : 'text-[#565c66]'}`}>
                  {t.placementState}{t.placementError ? ` (${t.placementError})` : ''}
                </span>
                <span className="ml-auto flex gap-2">
                  {t.linkedinUrl && <a href={t.linkedinUrl} target="_blank" rel="noreferrer" className={btn}>open</a>}
                  <button className={btn} onClick={() => copyDraft(t)}>copy</button>
                  <button className={btnGo} onClick={() => markSent(t.touchId)}>mark sent</button>
                </span>
              </div>
              <pre className="mt-1 whitespace-pre-wrap text-[11px] text-[#8a919c]">{t.subject ? `${t.subject}\n` : ''}{t.draftText}</pre>
            </div>
          ))}
        </div>
      </section>

      {/* ── csv sourcing ── */}
      <section>
        <div className="text-[#565c66] text-[11px] uppercase mb-2">sourcing import (csv / pasted list)</div>
        <div className={`${box} p-3 space-y-2`}>
          <select
            value={csvMission}
            onChange={(e) => setCsvMission(e.target.value)}
            className="bg-[#0d0f12] border border-[#22262c] rounded px-2 py-1 text-[12px]"
          >
            <option value="">select mission…</option>
            {missions.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={'name,email,linkedinUrl,company,notes\nJane Doe,jane@acme.dev,https://linkedin.com/in/jane,Acme,met at conf'}
            className="w-full h-28 bg-[#0d0f12] border border-[#22262c] rounded p-2 text-[12px] text-[#d6d8dd] outline-none placeholder-[#3d434c]"
          />
          <button className={btnGo} onClick={uploadCsv}>import → sourcing</button>
        </div>
      </section>

      {/* ── voice profile ── */}
      <section>
        <div className="text-[#565c66] text-[11px] uppercase mb-2">voice profile (used by the drafting stage)</div>
        <div className={`${box} p-3 space-y-2`}>
          <textarea
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            className="w-full h-28 bg-[#0d0f12] border border-[#22262c] rounded p-2 text-[12px] text-[#d6d8dd] outline-none"
          />
          <button className={btn} onClick={saveVoice}>save</button>
        </div>
      </section>
    </div>
  )
}

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<div className="p-4 text-[#565c66] text-[13px]">loading…</div>}>
      <ApprovalsInner />
    </Suspense>
  )
}
