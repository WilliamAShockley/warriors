'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Sparkles, Plus, Trash2, ExternalLink, Mail, RefreshCw, Send, Zap, ChevronDown, Star, Copy, Check } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { STAGES, ACTIVITY_TYPES, cn } from '@/lib/utils'
import LogActivityModal from '@/components/LogActivityModal'
import EditTargetModal from '@/components/EditTargetModal'
import SendEmailModal from '@/components/SendEmailModal'
import RunSkillModal from '@/components/RunSkillModal'

type Activity = {
  id: string
  type: string
  description: string
  date: string
}

type Target = {
  id: string
  name: string
  company: string
  email: string | null
  linkedin: string | null
  stage: string
  status: string
  lastContacted: string | null
  notes: string | null
  starred: boolean
  starRank: number | null
  createdAt: string
  updatedAt: string
  activities: Activity[]
}

type OutreachFounder = {
  name: string
  role: string
  emailGuesses: string[]
}

type OutreachData = {
  summary: string
  founders: OutreachFounder[]
  fundingStage: string
}

const STATUS_LABELS: Record<string, { label: string; classes: string }> = {
  green: { label: 'Recent', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  yellow: { label: 'Nudge', classes: 'bg-green-50 text-green-700 border-green-200' },
  red: { label: 'Needs Attention', classes: 'bg-red-50 text-red-700 border-red-200' },
}

const ACTIVITY_ICONS: Record<string, string> = {
  meeting: '📅',
  email: '✉️',
  call: '📞',
  note: '📝',
  research: '🔍',
  intro: '🤝',
}

export default function TargetDetail() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [target, setTarget] = useState<Target | null>(null)
  const [summary, setSummary] = useState<string>('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [showLogActivity, setShowLogActivity] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showSendEmail, setShowSendEmail] = useState(false)
  const [gmailSyncing, setGmailSyncing] = useState(false)
  const [gmailSyncResult, setGmailSyncResult] = useState<number | null>(null)
  const [gmailConnected, setGmailConnected] = useState(false)
  const [skills, setSkills] = useState<{ id: string; name: string; description: string; section: string }[]>([])
  const [showSkillsMenu, setShowSkillsMenu] = useState(false)
  const [runningSkill, setRunningSkill] = useState<{ id: string; name: string; description: string; section: string } | null>(null)
  const [outreachData, setOutreachData] = useState<OutreachData | null>(null)
  const [outreachLoading, setOutreachLoading] = useState(false)
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null)

  const loadTarget = useCallback(async () => {
    const res = await fetch(`/api/targets/${id}`)
    if (!res.ok) return router.push('/targets')
    setTarget(await res.json())
  }, [id, router])

  useEffect(() => {
    loadTarget()
    fetch('/api/gmail/status').then(r => r.json()).then(d => setGmailConnected(d.connected))
    fetch('/api/skills').then(r => r.json()).then(d => setSkills(d.filter((s: { section: string }) => s.section === 'targets' || s.section === 'global')))
  }, [loadTarget])

  useEffect(() => {
    if (target?.stage === 'outreach' && !outreachData && !outreachLoading) {
      setOutreachLoading(true)
      fetch(`/api/outreach/${id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { setOutreachData(d); setOutreachLoading(false) })
        .catch(() => setOutreachLoading(false))
    }
  }, [target?.stage, id, outreachData, outreachLoading])

  async function refreshOutreach() {
    setOutreachLoading(true)
    setOutreachData(null)
    const res = await fetch(`/api/outreach/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: true }),
    })
    setOutreachData(res.ok ? await res.json() : null)
    setOutreachLoading(false)
  }

  function copyEmail(email: string) {
    navigator.clipboard.writeText(email)
    setCopiedEmail(email)
    setTimeout(() => setCopiedEmail(null), 1500)
  }

  async function loadSummary() {
    setSummaryLoading(true)
    setSummary('')
    const res = await fetch(`/api/targets/${id}/summary`)
    const data = await res.json()
    setSummary(data.summary)
    setSummaryLoading(false)
  }

  async function syncGmail() {
    setGmailSyncing(true)
    setGmailSyncResult(null)
    const res = await fetch(`/api/gmail/sync/${id}`, { method: 'POST' })
    const data = await res.json()
    setGmailSyncResult(data.synced)
    setGmailSyncing(false)
    loadTarget()
  }

  async function deleteActivity(activityId: string) {
    await fetch(`/api/activities?id=${activityId}`, { method: 'DELETE' })
    loadTarget()
  }

  async function updateStatus(status: string) {
    await fetch(`/api/targets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    loadTarget()
  }

  async function toggleStar() {
    if (!target) return
    const starred = !target.starred
    await fetch(`/api/targets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred, starRank: starred ? Date.now() : null }),
    })
    loadTarget()
  }

  if (!target) {
    return (
      <div className="min-h-screen bg-[#F7F6F3] flex items-center justify-center">
        <span className="text-sm text-[#888884]">Loading...</span>
      </div>
    )
  }

  const statusInfo = STATUS_LABELS[target.status]
  const canSendEmail = gmailConnected && target.email

  return (
    <div className="min-h-screen bg-[#F7F6F3]">
      {/* Header */}
      <div className="flex items-center gap-3 px-8 pt-10 pb-4">
        <button
          onClick={() => router.push('/targets')}
          className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
        >
          <ArrowLeft size={16} className="text-[#888884]" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-[#1A1A1A]">{target.name}</h1>
            <span className="text-[#888884] text-base">{target.company}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Star */}
          <button
            onClick={toggleStar}
            className="p-1.5 rounded-lg hover:bg-amber-50 transition-colors"
            title={target.starred ? 'Remove from Top Companies' : 'Add to Top Companies'}
          >
            <Star
              size={15}
              className={target.starred ? 'fill-amber-400 text-amber-400' : 'text-[#C8C7C3] hover:text-amber-400'}
            />
          </button>
          {/* Status selector */}
          {(['green', 'yellow', 'red'] as const).map((s) => (
            <button
              key={s}
              onClick={() => updateStatus(s)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full border transition-all',
                target.status === s
                  ? STATUS_LABELS[s].classes
                  : 'bg-white border-[#E8E7E3] text-[#888884] hover:border-[#C8C7C3]'
              )}
            >
              {STATUS_LABELS[s].label}
            </button>
          ))}
          {canSendEmail && (
            <button
              onClick={() => setShowSendEmail(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#1A1A1A] text-white hover:bg-[#333] transition-colors"
            >
              <Send size={12} />
              Send Email
            </button>
          )}
          {skills.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowSkillsMenu(v => !v)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white border border-[#E8E7E3] text-[#888884] hover:border-[#C8C7C3] transition-colors"
              >
                <Zap size={12} />
                Skills
                <ChevronDown size={11} />
              </button>
              {showSkillsMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSkillsMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-[#E8E7E3] rounded-xl shadow-lg z-20 py-1">
                    {skills.map(skill => (
                      <button
                        key={skill.id}
                        onClick={() => { setRunningSkill(skill); setShowSkillsMenu(false) }}
                        className="w-full text-left px-3 py-2 hover:bg-[#F7F6F3] transition-colors"
                      >
                        <p className="text-sm text-[#1A1A1A]">{skill.name}</p>
                        {skill.description && <p className="text-xs text-[#888884] mt-0.5">{skill.description}</p>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <button
            onClick={() => setShowEdit(true)}
            className="text-xs px-3 py-1.5 rounded-lg bg-white border border-[#E8E7E3] text-[#888884] hover:border-[#C8C7C3] transition-colors"
          >
            Edit
          </button>
        </div>
      </div>

      <div className="border-b border-[#E8E7E3] mx-8" />

      <div className="max-w-3xl px-8 py-6 space-y-6">
        {/* Meta row */}
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-xs text-[#888884] bg-[#F0EFE9] px-2.5 py-1 rounded-full">
            {STAGES[target.stage] ?? target.stage}
          </span>
          {target.lastContacted && (
            <span className="text-xs text-[#888884]">
              Last contacted {formatDistanceToNow(new Date(target.lastContacted), { addSuffix: true })}
            </span>
          )}
          {target.email && (
            <a
              href={`mailto:${target.email}`}
              className="flex items-center gap-1 text-xs text-[#888884] hover:text-[#1A1A1A] transition-colors"
            >
              <Mail size={12} /> {target.email}
            </a>
          )}
          {target.linkedin && (
            <a
              href={target.linkedin}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-[#888884] hover:text-[#1A1A1A] transition-colors"
            >
              <ExternalLink size={12} /> LinkedIn
            </a>
          )}
        </div>

        {/* AI Summary */}
        <div className="bg-white border border-[#E8E7E3] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-[#888884] uppercase tracking-wide">Summary</span>
            <button
              onClick={loadSummary}
              disabled={summaryLoading}
              className="flex items-center gap-1.5 text-xs text-[#888884] hover:text-[#1A1A1A] transition-colors disabled:opacity-50"
            >
              <Sparkles size={12} />
              {summaryLoading ? 'Generating...' : summary ? 'Refresh' : 'Generate with Claude'}
            </button>
          </div>
          {summary ? (
            <p className="text-sm text-[#1A1A1A] leading-relaxed">{summary}</p>
          ) : (
            <p className="text-sm text-[#B0AFAB] italic">
              {summaryLoading
                ? 'Claude is thinking...'
                : 'Click "Generate with Claude" to get a briefing on this contact.'}
            </p>
          )}
        </div>

        {/* Notes */}
        {target.notes && (
          <div className="bg-white border border-[#E8E7E3] rounded-2xl p-5">
            <span className="text-xs font-medium text-[#888884] uppercase tracking-wide block mb-2">Notes</span>
            <p className="text-sm text-[#1A1A1A] leading-relaxed whitespace-pre-wrap">{target.notes}</p>
          </div>
        )}

        {/* Outreach Intel */}
        {target.stage === 'outreach' && (
          <div className="bg-white border border-[#E8E7E3] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-[#888884] uppercase tracking-wide">Outreach Intel</span>
              <button
                onClick={refreshOutreach}
                disabled={outreachLoading}
                className="flex items-center gap-1.5 text-xs text-[#888884] hover:text-[#1A1A1A] transition-colors disabled:opacity-50"
              >
                <RefreshCw size={12} className={outreachLoading ? 'animate-spin' : ''} />
                {outreachLoading ? 'Researching...' : outreachData ? 'Refresh' : 'Generate'}
              </button>
            </div>

            {outreachLoading && (
              <p className="text-sm text-[#B0AFAB] italic">Claude is researching {target.company}...</p>
            )}

            {!outreachLoading && !outreachData && (
              <p className="text-sm text-[#B0AFAB] italic">Generating outreach intel automatically...</p>
            )}

            {outreachData && (
              <div className="space-y-4">
                {/* Summary */}
                <p className="text-sm text-[#1A1A1A] leading-relaxed">{outreachData.summary}</p>

                {/* Funding stage */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#888884]">Funding stage:</span>
                  <span className="text-xs font-medium text-[#1A1A1A] bg-[#F0EFE9] px-2 py-0.5 rounded-full">
                    {outreachData.fundingStage}
                  </span>
                </div>

                {/* Founders */}
                {outreachData.founders.length > 0 && (
                  <div>
                    <span className="text-xs text-[#888884] block mb-2">Founders</span>
                    <div className="space-y-3">
                      {outreachData.founders.map((founder) => (
                        <div key={founder.name} className="border border-[#E8E7E3] rounded-xl p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className="text-sm font-medium text-[#1A1A1A]">{founder.name}</span>
                              <span className="text-xs text-[#888884] ml-2">{founder.role}</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {founder.emailGuesses.map((email) => (
                              <button
                                key={email}
                                onClick={() => copyEmail(email)}
                                className="flex items-center gap-1 text-xs bg-[#F7F6F3] border border-[#E8E7E3] px-2 py-1 rounded-lg hover:border-[#C8C7C3] transition-colors font-mono"
                              >
                                {copiedEmail === email ? (
                                  <Check size={10} className="text-emerald-500" />
                                ) : (
                                  <Copy size={10} className="text-[#888884]" />
                                )}
                                {email}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Gmail Sync */}
        {gmailConnected && (
          <div className="flex items-center justify-between bg-white border border-[#E8E7E3] rounded-2xl px-5 py-4">
            <div className="flex items-center gap-2">
              <Mail size={14} className="text-[#888884]" />
              <span className="text-sm text-[#1A1A1A]">Gmail sync</span>
              {gmailSyncResult !== null && (
                <span className="text-xs text-[#888884]">
                  {gmailSyncResult === 0 ? '— up to date' : `— ${gmailSyncResult} new email${gmailSyncResult !== 1 ? 's' : ''} logged`}
                </span>
              )}
            </div>
            <button
              onClick={syncGmail}
              disabled={gmailSyncing}
              className="flex items-center gap-1.5 text-xs text-[#1A1A1A] bg-[#F7F6F3] border border-[#E8E7E3] px-3 py-1.5 rounded-lg hover:border-[#C8C7C3] transition-colors disabled:opacity-50"
            >
              <RefreshCw size={11} className={gmailSyncing ? 'animate-spin' : ''} />
              {gmailSyncing ? 'Syncing...' : 'Sync now'}
            </button>
          </div>
        )}

        {/* Send Email inline hint when no Gmail */}
        {!gmailConnected && target.email && (
          <div className="bg-white border border-[#E8E7E3] rounded-2xl px-5 py-4">
            <div className="flex items-center gap-2">
              <Send size={14} className="text-[#888884]" />
              <span className="text-sm text-[#888884]">
                Connect Gmail in{' '}
                <button
                  onClick={() => router.push('/settings')}
                  className="underline hover:text-[#1A1A1A] transition-colors"
                >
                  Settings
                </button>
                {' '}to send emails directly from Warriors
              </span>
            </div>
          </div>
        )}

        {/* Activity Log */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-[#888884] uppercase tracking-wide">Activity</span>
            <button
              onClick={() => setShowLogActivity(true)}
              className="flex items-center gap-1 text-xs text-[#1A1A1A] bg-white border border-[#E8E7E3] px-2.5 py-1 rounded-lg hover:border-[#C8C7C3] transition-colors"
            >
              <Plus size={12} /> Log Activity
            </button>
          </div>

          {target.activities.length === 0 ? (
            <div className="bg-white border border-[#E8E7E3] rounded-2xl p-5 text-center">
              <p className="text-sm text-[#B0AFAB]">No activity yet. Log your first touchpoint.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {target.activities.map((activity) => (
                <div
                  key={activity.id}
                  className="group bg-white border border-[#E8E7E3] rounded-xl px-4 py-3 flex items-start gap-3"
                >
                  <span className="text-base leading-none mt-0.5">
                    {ACTIVITY_ICONS[activity.type] ?? '•'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-[#888884] capitalize">{activity.type}</span>
                      <span className="text-xs text-[#B0AFAB]">
                        {format(new Date(activity.date), 'MMM d, yyyy')}
                      </span>
                    </div>
                    <p className="text-sm text-[#1A1A1A]">{activity.description}</p>
                  </div>
                  <button
                    onClick={() => deleteActivity(activity.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 transition-all"
                  >
                    <Trash2 size={12} className="text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showLogActivity && (
        <LogActivityModal
          targetId={target.id}
          onClose={() => setShowLogActivity(false)}
          onCreated={() => { setShowLogActivity(false); loadTarget() }}
        />
      )}

      {showEdit && (
        <EditTargetModal
          target={target}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); loadTarget() }}
        />
      )}

      {showSendEmail && target.email && (
        <SendEmailModal
          targetId={target.id}
          targetName={target.name}
          targetEmail={target.email}
          onClose={() => setShowSendEmail(false)}
          onSent={() => { setShowSendEmail(false); loadTarget() }}
        />
      )}

      {runningSkill && (
        <RunSkillModal
          skill={runningSkill}
          targetId={target.id}
          onClose={() => setRunningSkill(null)}
          onLogActivity={() => { setRunningSkill(null); loadTarget() }}
        />
      )}
    </div>
  )
}