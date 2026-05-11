'use client'

import { useState, useEffect } from 'react'
import { X, FileText, ChevronDown } from 'lucide-react'

type EmailDraft = {
  id: string
  name: string
  subject: string
  body: string
}

type Props = {
  targetId: string
  targetName: string
  targetEmail: string
  initialSubject?: string
  initialBody?: string
  onClose: () => void
  onSent: () => void
}

export default function SendEmailModal({ targetId, targetName, targetEmail, initialSubject, initialBody, onClose, onSent }: Props) {
  const [subject, setSubject] = useState(initialSubject ?? '')
  const [body, setBody] = useState(initialBody ?? '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState<EmailDraft[]>([])
  const [showDrafts, setShowDrafts] = useState(false)
  const [targetCompany, setTargetCompany] = useState('')

  useEffect(() => {
    // Load drafts
    fetch('/api/email-drafts')
      .then((r) => r.json())
      .then((d) => setDrafts(d))
      .catch(() => {})

    // Load target to get company name for placeholder substitution
    fetch(`/api/targets/${targetId}`)
      .then((r) => r.json())
      .then((t) => setTargetCompany(t.company ?? ''))
      .catch(() => {})
  }, [targetId])

  function applyDraft(draft: EmailDraft) {
    const replacePlaceholders = (text: string) =>
      text
        .replace(/\{\{name\}\}/gi, targetName)
        .replace(/\{\{company\}\}/gi, targetCompany)

    setSubject(replacePlaceholders(draft.subject))
    setBody(replacePlaceholders(draft.body))
    setShowDrafts(false)
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!subject.trim()) return
    setSending(true)
    setError('')

    try {
      const res = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId,
          to: targetEmail,
          subject: subject.trim(),
          bodyText: body.trim(),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to send')
        setSending(false)
        return
      }

      onSent()
    } catch {
      setError('Network error')
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#E8E7E3]">
          <div>
            <h2 className="font-semibold text-[#1A1A1A]">Send Email</h2>
            <p className="text-xs text-[#888884] mt-0.5">To: {targetName} &lt;{targetEmail}&gt;</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
            <X size={16} className="text-[#888884]" />
          </button>
        </div>

        <form onSubmit={send} className="px-6 py-5 space-y-4">
          {/* Draft picker */}
          {drafts.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowDrafts((v) => !v)}
                className="flex items-center gap-2 text-xs text-[#888884] bg-[#F7F6F3] border border-[#E8E7E3] px-3 py-1.5 rounded-lg hover:border-[#C8C7C3] transition-colors"
              >
                <FileText size={12} />
                Use a draft template
                <ChevronDown size={11} />
              </button>
              {showDrafts && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowDrafts(false)} />
                  <div className="absolute left-0 top-full mt-1 w-72 bg-white border border-[#E8E7E3] rounded-xl shadow-lg z-20 py-1 max-h-60 overflow-y-auto">
                    {drafts.map((draft) => (
                      <button
                        key={draft.id}
                        type="button"
                        onClick={() => applyDraft(draft)}
                        className="w-full text-left px-3 py-2 hover:bg-[#F7F6F3] transition-colors"
                      >
                        <p className="text-sm text-[#1A1A1A]">{draft.name}</p>
                        <p className="text-xs text-[#888884] truncate mt-0.5">{draft.subject}</p>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div>
            <label className="text-xs text-[#888884] block mb-1">Subject *</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] transition-colors"
              placeholder="Subject line..."
            />
          </div>

          <div>
            <label className="text-xs text-[#888884] block mb-1">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] transition-colors resize-none"
              placeholder="Write your message..."
            />
          </div>

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-sm py-2 rounded-lg border border-[#E8E7E3] text-[#888884] hover:border-[#C8C7C3] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending || !subject.trim()}
              className="flex-1 text-sm py-2 rounded-lg bg-[#1A1A1A] text-white hover:bg-[#333] disabled:opacity-40 transition-colors"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}