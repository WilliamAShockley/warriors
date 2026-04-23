'use client'

import { useState } from 'react'
import { X, Send, AlertCircle } from 'lucide-react'

type Props = {
  targetId: string
  targetName: string
  targetEmail: string
  onClose: () => void
  onSent: () => void
}

export default function SendEmailModal({ targetId, targetName, targetEmail, onClose, onSent }: Props) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!subject.trim() || !body.trim()) return
    setLoading(true)
    setError(null)

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
        throw new Error(data.error || 'Failed to send')
      }

      onSent()
    } catch (err: any) {
      setError(err.message ?? 'Failed to send email')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#E8E7E3]">
          <div>
            <h2 className="font-semibold text-[#1A1A1A]">Send Email</h2>
            <p className="text-xs text-[#888884] mt-0.5">
              To {targetName} &lt;{targetEmail}&gt;
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
            <X size={16} className="text-[#888884]" />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <div>
            <label className="text-xs text-[#888884] block mb-1">Subject *</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] transition-colors"
              placeholder="Following up on our conversation..."
            />
          </div>

          <div>
            <label className="text-xs text-[#888884] block mb-1">Message *</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              rows={8}
              className="w-full text-sm border border-[#E8E7E3] rounded-lg px-3 py-2 outline-none focus:border-[#1A1A1A] transition-colors resize-none leading-relaxed"
              placeholder="Hi — great speaking with you earlier this week..."
            />
          </div>

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
              disabled={loading || !subject.trim() || !body.trim()}
              className="flex-1 text-sm py-2 rounded-lg bg-[#1A1A1A] text-white hover:bg-[#333] disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
            >
              <Send size={13} />
              {loading ? 'Sending...' : 'Send Email'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}