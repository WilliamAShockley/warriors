'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Sunrise,
  RefreshCw,
  Mail,
  CalendarPlus,
  CornerUpLeft,
  Send,
  X,
  Check,
  AlertTriangle,
  Settings2,
  ShieldCheck,
} from 'lucide-react'
import { format } from 'date-fns'

type Category = 'email_reply' | 'calendar' | 'follow_up' | 'manual'

interface ActionDraft {
  id: string
  type: 'email' | 'follow_up' | 'calendar'
  emailTo: string | null
  emailSubject: string | null
  emailBody: string | null
  emailThreadId: string | null
  eventTitle: string | null
  eventStart: string | null
  eventEnd: string | null
  eventAttendees: string | null
  eventLocation: string | null
  eventDescription: string | null
  status: 'pending' | 'approved' | 'executed' | 'dismissed' | 'failed'
  executedAt: string | null
  executionResult: string | null
}

interface ReportItem {
  id: string
  sourceType: string
  sourceText: string
  sourceContext: string | null
  category: Category
  priority: number
  reasoning: string | null
  draft: ActionDraft | null
}

interface Report {
  id: string
  date: string
  status: string
  summary: string
  itemCount: number
  items: ReportItem[]
}

type Mode = 'manual' | 'auto'
interface AutonomySettings {
  enabled: boolean
  modes: { email: Mode; calendar: Mode; follow_up: Mode }
}
type AutonomyPatch = { enabled?: boolean; modes?: Partial<AutonomySettings['modes']> }

const CATEGORY_META: Record<Category, { label: string; className: string; icon: typeof Mail }> = {
  email_reply: { label: 'Email', className: 'bg-blue-50 text-blue-600', icon: Mail },
  follow_up: { label: 'Follow-up', className: 'bg-violet-50 text-violet-600', icon: CornerUpLeft },
  calendar: { label: 'Calendar', className: 'bg-amber-50 text-amber-600', icon: CalendarPlus },
  manual: { label: 'Manual', className: 'bg-[#F0EFEB] text-[#888884]', icon: Check },
}

function priorityDot(p: number): string {
  if (p >= 5) return 'bg-red-500'
  if (p === 4) return 'bg-orange-400'
  if (p === 3) return 'bg-amber-400'
  return 'bg-[#C8C7C3]'
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  // datetime-local wants yyyy-MM-ddTHH:mm in local time
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function MorningReportSection() {
  const [report, setReport] = useState<Report | null>(null)
  const [settings, setSettings] = useState<AutonomySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [busyDraft, setBusyDraft] = useState<string | null>(null)
  const [editing, setEditing] = useState<Record<string, Partial<ActionDraft>>>({})

  const fetchAll = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([
        fetch('/api/morning-report').then((res) => (res.ok ? res.json() : null)),
        fetch('/api/morning-report/settings').then((res) => (res.ok ? res.json() : null)),
      ])
      setReport(r)
      setSettings(s)
    } catch (e) {
      console.error('Failed to load morning report:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const generate = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/morning-report', { method: 'POST' })
      if (res.ok) setReport(await res.json())
    } catch (e) {
      console.error('Failed to generate report:', e)
    } finally {
      setGenerating(false)
    }
  }

  const saveSettings = async (patch: AutonomyPatch) => {
    if (!settings) return
    const next: AutonomySettings = {
      enabled: patch.enabled ?? settings.enabled,
      modes: { ...settings.modes, ...(patch.modes ?? {}) },
    }
    setSettings(next) // optimistic
    try {
      await fetch('/api/morning-report/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch (e) {
      console.error('Failed to save settings:', e)
      fetchAll()
    }
  }

  const patchDraft = async (draftId: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/morning-report/drafts/${draftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok ? res.json() : null
  }

  const updateDraftInState = (draftId: string, patch: Partial<ActionDraft>) => {
    setReport((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) =>
              it.draft?.id === draftId ? { ...it, draft: { ...it.draft, ...patch } as ActionDraft } : it,
            ),
          }
        : prev,
    )
  }

  const dismissDraft = async (draftId: string) => {
    setBusyDraft(draftId)
    updateDraftInState(draftId, { status: 'dismissed' })
    await patchDraft(draftId, { status: 'dismissed' })
    setBusyDraft(null)
  }

  const saveEdits = async (draft: ActionDraft) => {
    const edits = editing[draft.id]
    if (!edits) return
    setBusyDraft(draft.id)
    const updated = await patchDraft(draft.id, edits)
    if (updated) updateDraftInState(draft.id, updated)
    setEditing((prev) => {
      const { [draft.id]: _, ...rest } = prev
      return rest
    })
    setBusyDraft(null)
  }

  const approveDraft = async (draft: ActionDraft) => {
    setBusyDraft(draft.id)
    // Persist any pending edits first.
    if (editing[draft.id]) {
      const updated = await patchDraft(draft.id, editing[draft.id])
      if (updated) updateDraftInState(draft.id, updated)
      setEditing((prev) => {
        const { [draft.id]: _, ...rest } = prev
        return rest
      })
    }
    try {
      const res = await fetch(`/api/morning-report/drafts/${draft.id}/approve`, { method: 'POST' })
      const data = await res.json()
      if (data.draft) updateDraftInState(draft.id, data.draft)
    } catch (e) {
      console.error('Failed to approve draft:', e)
    } finally {
      setBusyDraft(null)
    }
  }

  if (loading) {
    return <div className="text-center py-16 text-sm text-[#888884]">Loading...</div>
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-lg font-semibold text-[#1A1A1A] flex items-center gap-2">
          <Sunrise size={18} className="text-amber-500" />
          Morning Report
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="p-2 rounded-lg text-[#888884] hover:bg-[#F0EFEB] hover:text-[#1A1A1A] transition-colors"
            title="Autonomy settings"
          >
            <Settings2 size={16} />
          </button>
          <button
            onClick={generate}
            disabled={generating}
            className="px-3 py-2 bg-[#1A1A1A] text-white text-sm font-medium rounded-xl hover:bg-[#333] transition-colors disabled:opacity-40 flex items-center gap-2"
          >
            <RefreshCw size={14} className={generating ? 'animate-spin' : ''} />
            {generating ? 'Generating...' : 'Generate now'}
          </button>
        </div>
      </div>
      <p className="text-sm text-[#888884] mb-4">
        Your open items across every section, triaged with drafts ready for approval.
      </p>

      {showSettings && settings && (
        <AutonomyPanel settings={settings} onChange={saveSettings} />
      )}

      {!report ? (
        <div className="text-center py-16">
          <p className="text-sm text-[#888884]">
            No report yet. Hit <span className="font-medium text-[#1A1A1A]">Generate now</span> to build your first one.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-[#E8E7E3] p-5 mb-5">
            <div className="text-xs text-[#A8A7A3] uppercase tracking-wider mb-2">
              {format(new Date(report.date), 'EEEE, MMMM d')} · {report.itemCount} items
            </div>
            <p className="text-sm text-[#1A1A1A] leading-relaxed whitespace-pre-wrap">
              {report.summary || 'No summary.'}
            </p>
          </div>

          <div className="space-y-2">
            {report.items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                busy={busyDraft === item.draft?.id}
                edits={item.draft ? editing[item.draft.id] : undefined}
                onEdit={(patch) =>
                  item.draft &&
                  setEditing((prev) => ({
                    ...prev,
                    [item.draft!.id]: { ...prev[item.draft!.id], ...patch },
                  }))
                }
                onSaveEdits={() => item.draft && saveEdits(item.draft)}
                onApprove={() => item.draft && approveDraft(item.draft)}
                onDismiss={() => item.draft && dismissDraft(item.draft.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function AutonomyPanel({
  settings,
  onChange,
}: {
  settings: AutonomySettings
  onChange: (patch: AutonomyPatch) => void
}) {
  const types: { key: keyof AutonomySettings['modes']; label: string }[] = [
    { key: 'email', label: 'Email replies' },
    { key: 'follow_up', label: 'Follow-ups' },
    { key: 'calendar', label: 'Calendar events' },
  ]
  return (
    <div className="bg-white rounded-2xl border border-[#E8E7E3] p-5 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck size={16} className="text-emerald-500" />
        <span className="text-sm font-medium text-[#1A1A1A]">Autonomy</span>
      </div>

      <label className="flex items-center justify-between py-2 cursor-pointer">
        <div>
          <div className="text-sm text-[#1A1A1A]">Master switch</div>
          <div className="text-xs text-[#888884]">
            When off, every action waits for your approval — no matter the settings below.
          </div>
        </div>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          className="h-5 w-5 accent-[#1A1A1A]"
        />
      </label>

      <div className="border-t border-[#F0EFEB] mt-2 pt-2">
        {types.map((t) => (
          <div key={t.key} className="flex items-center justify-between py-2">
            <span className={`text-sm ${settings.enabled ? 'text-[#1A1A1A]' : 'text-[#A8A7A3]'}`}>
              {t.label}
            </span>
            <select
              value={settings.modes[t.key]}
              disabled={!settings.enabled}
              onChange={(e) => onChange({ modes: { [t.key]: e.target.value as Mode } })}
              className="text-sm border border-[#E8E7E3] rounded-lg px-2 py-1 bg-white text-[#1A1A1A] disabled:opacity-40"
            >
              <option value="manual">Ask me</option>
              <option value="auto">Auto-send</option>
            </select>
          </div>
        ))}
      </div>
      <p className="text-xs text-[#A8A7A3] mt-2">
        Defaults are conservative: master off, everything set to ask. Flip a type to “Auto-send” once
        you trust it.
      </p>
    </div>
  )
}

function ItemCard({
  item,
  busy,
  edits,
  onEdit,
  onSaveEdits,
  onApprove,
  onDismiss,
}: {
  item: ReportItem
  busy: boolean
  edits: Partial<ActionDraft> | undefined
  onEdit: (patch: Partial<ActionDraft>) => void
  onSaveEdits: () => void
  onApprove: () => void
  onDismiss: () => void
}) {
  const meta = CATEGORY_META[item.category]
  const Icon = meta.icon
  const draft = item.draft

  return (
    <div className="bg-white rounded-xl border border-[#E8E7E3] px-4 py-3">
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${priorityDot(item.priority)}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-[#1A1A1A] leading-snug">{item.sourceText}</span>
            <span className={`text-[11px] px-1.5 py-0.5 rounded-md font-medium flex items-center gap-1 ${meta.className}`}>
              <Icon size={11} />
              {meta.label}
            </span>
          </div>
          {item.sourceContext && (
            <div className="text-xs text-[#A8A7A3] mt-0.5">{item.sourceContext}</div>
          )}
          {item.reasoning && (
            <div className="text-xs text-[#888884] mt-1 italic">{item.reasoning}</div>
          )}
        </div>
      </div>

      {draft && draft.status !== 'dismissed' && (
        <DraftBlock
          draft={draft}
          busy={busy}
          edits={edits}
          onEdit={onEdit}
          onSaveEdits={onSaveEdits}
          onApprove={onApprove}
          onDismiss={onDismiss}
        />
      )}
      {draft && draft.status === 'dismissed' && (
        <div className="mt-2 text-xs text-[#A8A7A3]">Draft dismissed.</div>
      )}
    </div>
  )
}

function DraftBlock({
  draft,
  busy,
  edits,
  onEdit,
  onSaveEdits,
  onApprove,
  onDismiss,
}: {
  draft: ActionDraft
  busy: boolean
  edits: Partial<ActionDraft> | undefined
  onEdit: (patch: Partial<ActionDraft>) => void
  onSaveEdits: () => void
  onApprove: () => void
  onDismiss: () => void
}) {
  const executed = draft.status === 'executed'
  const failed = draft.status === 'failed'
  const isCalendar = draft.type === 'calendar'
  const v = <K extends keyof ActionDraft>(k: K): ActionDraft[K] =>
    (edits && k in edits ? (edits[k] as ActionDraft[K]) : draft[k])

  const inputClass =
    'w-full bg-[#FAFAF8] border border-[#E8E7E3] rounded-lg px-2.5 py-1.5 text-sm text-[#1A1A1A] outline-none focus:border-[#C8C7C3]'

  return (
    <div className="mt-3 ml-5 border-l-2 border-[#F0EFEB] pl-3">
      {executed && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 mb-2">
          <Check size={13} /> {draft.executionResult ?? 'Done'}
          {draft.executedAt && <span className="text-[#A8A7A3]"> · {format(new Date(draft.executedAt), 'MMM d, h:mm a')}</span>}
        </div>
      )}
      {failed && (
        <div className="flex items-center gap-1.5 text-xs text-red-500 mb-2">
          <AlertTriangle size={13} /> {draft.executionResult ?? 'Failed'}
        </div>
      )}

      {isCalendar ? (
        <div className="space-y-2">
          <input
            className={inputClass}
            value={v('eventTitle') ?? ''}
            disabled={executed}
            onChange={(e) => onEdit({ eventTitle: e.target.value })}
            placeholder="Event title"
          />
          <div className="flex gap-2">
            <input
              type="datetime-local"
              className={inputClass}
              value={toLocalInput(v('eventStart'))}
              disabled={executed}
              onChange={(e) => onEdit({ eventStart: new Date(e.target.value).toISOString() })}
            />
            <input
              type="datetime-local"
              className={inputClass}
              value={toLocalInput(v('eventEnd'))}
              disabled={executed}
              onChange={(e) => onEdit({ eventEnd: new Date(e.target.value).toISOString() })}
            />
          </div>
          {draft.eventLocation && (
            <div className="text-xs text-[#888884]">Location: {draft.eventLocation}</div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <input
            className={inputClass}
            value={v('emailTo') ?? ''}
            disabled={executed}
            onChange={(e) => onEdit({ emailTo: e.target.value })}
            placeholder="recipient@email.com"
          />
          <input
            className={inputClass}
            value={v('emailSubject') ?? ''}
            disabled={executed}
            onChange={(e) => onEdit({ emailSubject: e.target.value })}
            placeholder="Subject"
          />
          <textarea
            className={`${inputClass} min-h-[96px] resize-y leading-relaxed`}
            value={v('emailBody') ?? ''}
            disabled={executed}
            onChange={(e) => onEdit({ emailBody: e.target.value })}
            placeholder="Body"
          />
        </div>
      )}

      {!executed && (
        <div className="flex items-center gap-2 mt-2.5">
          <button
            onClick={onApprove}
            disabled={busy}
            className="px-3 py-1.5 bg-[#1A1A1A] text-white text-xs font-medium rounded-lg hover:bg-[#333] transition-colors disabled:opacity-40 flex items-center gap-1.5"
          >
            {isCalendar ? <CalendarPlus size={13} /> : <Send size={13} />}
            {isCalendar ? 'Approve & add' : 'Approve & send'}
          </button>
          {edits && Object.keys(edits).length > 0 && (
            <button
              onClick={onSaveEdits}
              disabled={busy}
              className="px-3 py-1.5 bg-white border border-[#E8E7E3] text-[#1A1A1A] text-xs font-medium rounded-lg hover:border-[#C8C7C3] transition-colors disabled:opacity-40"
            >
              Save edits
            </button>
          )}
          <button
            onClick={onDismiss}
            disabled={busy}
            className="px-3 py-1.5 text-[#888884] text-xs font-medium rounded-lg hover:bg-[#F0EFEB] transition-colors disabled:opacity-40 flex items-center gap-1.5"
          >
            <X size={13} />
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
