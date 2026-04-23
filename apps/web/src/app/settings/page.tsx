'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, CheckCircle, Mail, Unlink, Plus, Pencil, Trash2, Zap } from 'lucide-react'
import { Suspense } from 'react'
import SkillModal from '@/components/SkillModal'

type Skill = {
  id: string
  name: string
  description: string
  prompt: string
  section: string
  model: string
}

const SECTION_LABELS: Record<string, string> = {
  targets: 'Targets',
  research: 'Research',
  news: 'News',
  global: 'Global',
}

function SettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; email?: string } | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [skills, setSkills] = useState<Skill[]>([])
  const [skillModal, setSkillModal] = useState<{ open: boolean; skill?: Skill }>({ open: false })

  const justConnected = searchParams.get('gmail') === 'connected'

  async function loadStatus() {
    const res = await fetch('/api/gmail/status')
    setGmailStatus(await res.json())
  }

  async function loadSkills() {
    const res = await fetch('/api/skills')
    setSkills(await res.json())
  }

  useEffect(() => {
    loadStatus()
    loadSkills()
  }, [])

  async function disconnect() {
    setDisconnecting(true)
    await fetch('/api/gmail/status', { method: 'DELETE' })
    await loadStatus()
    setDisconnecting(false)
  }

  async function deleteSkill(id: string) {
    await fetch(`/api/skills/${id}`, { method: 'DELETE' })
    loadSkills()
  }

  // Group skills by section
  const grouped = skills.reduce<Record<string, Skill[]>>((acc, skill) => {
    const key = skill.section
    if (!acc[key]) acc[key] = []
    acc[key].push(skill)
    return acc
  }, {})

  const sectionOrder = ['targets', 'research', 'news', 'global']

  return (
    <div className="min-h-screen bg-[#F7F6F3]">
      <div className="flex items-center gap-3 px-8 pt-10 pb-4">
        <button
          onClick={() => router.push('/')}
          className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
        >
          <ArrowLeft size={16} className="text-[#888884]" />
        </button>
        <h1 className="text-lg font-semibold text-[#1A1A1A]">Settings</h1>
      </div>

      <div className="border-b border-[#E8E7E3] mx-8" />

      <div className="max-w-xl px-8 py-8 space-y-6">
        {justConnected && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-xl">
            <CheckCircle size={15} />
            Gmail connected successfully.
          </div>
        )}

        {/* Gmail */}
        <div className="bg-white border border-[#E8E7E3] rounded-2xl p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#F7F6F3] flex items-center justify-center">
                <Mail size={15} className="text-[#1A1A1A]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#1A1A1A]">Gmail</p>
                <p className="text-xs text-[#888884] mt-0.5">
                  {gmailStatus?.connected
                    ? `Connected as ${gmailStatus.email}`
                    : 'Sync emails with your targets'}
                </p>
              </div>
            </div>

            {gmailStatus?.connected ? (
              <button
                onClick={disconnect}
                disabled={disconnecting}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                <Unlink size={12} />
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            ) : (
              <a
                href="/api/auth/gmail"
                className="text-xs bg-[#1A1A1A] text-white px-3 py-1.5 rounded-lg hover:bg-[#333] transition-colors"
              >
                Connect Gmail
              </a>
            )}
          </div>
        </div>

        {/* Skills */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-[#888884]" />
              <h2 className="text-sm font-semibold text-[#1A1A1A]">Skills</h2>
            </div>
            <button
              onClick={() => setSkillModal({ open: true })}
              className="flex items-center gap-1.5 text-xs bg-[#1A1A1A] text-white px-3 py-1.5 rounded-lg hover:bg-[#333] transition-colors"
            >
              <Plus size={12} />
              New Skill
            </button>
          </div>

          {skills.length === 0 ? (
            <div className="bg-white border border-[#E8E7E3] rounded-2xl p-6 text-center">
              <p className="text-sm text-[#B0AFAB]">No skills yet. Create your first reusable prompt.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sectionOrder.filter(s => grouped[s]?.length).map(section => (
                <div key={section}>
                  <p className="text-xs font-medium text-[#888884] uppercase tracking-wide mb-2">
                    {SECTION_LABELS[section] ?? section}
                  </p>
                  <div className="space-y-1">
                    {grouped[section].map(skill => (
                      <div
                        key={skill.id}
                        className="group bg-white border border-[#E8E7E3] rounded-xl px-4 py-3 flex items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#1A1A1A]">{skill.name}</p>
                          {skill.description && (
                            <p className="text-xs text-[#888884] mt-0.5 truncate">{skill.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setSkillModal({ open: true, skill })}
                            className="p-1.5 rounded-lg hover:bg-[#F0EFE9] transition-colors"
                          >
                            <Pencil size={13} className="text-[#888884]" />
                          </button>
                          <button
                            onClick={() => deleteSkill(skill.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={13} className="text-red-400" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {skillModal.open && (
        <SkillModal
          skill={skillModal.skill}
          onClose={() => setSkillModal({ open: false })}
          onSaved={() => { setSkillModal({ open: false }); loadSkills() }}
        />
      )}
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  )
}
