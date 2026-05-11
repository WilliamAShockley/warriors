'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Play, ChevronDown, ChevronRight, CheckCircle, ExternalLink, Send } from 'lucide-react'
import SendEmailModal from '@/components/SendEmailModal'

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  low: 'bg-red-50 text-red-700 border-red-200',
  unknown: 'bg-gray-50 text-gray-500 border-gray-200',
}

type Steps = {
  parallel?: { content: string; confidence: string; runId: string }
  extraction?: { founderName: string | null }
  email?: { guessed: string | null }
  draft?: { subject: string | null; body: string | null }
}

type RunResult = {
  targetId: string
  steps: Steps
  debug: { request?: object; response?: object }
  error?: string
}

function StepCard({ number, title, status, children }: {
  number: number
  title: string
  status: 'pending' | 'running' | 'done' | 'error'
  children?: React.ReactNode
}) {
  return (
    <div className="bg-white border border-[#E8E7E3] rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[#F0EFE9] flex items-center gap-3">
        <span className="text-xs font-mono text-[#B0AFAB] w-5">{number}</span>
        <span className="text-sm font-medium text-[#1A1A1A] flex-1">{title}</span>
        {status === 'running' && (
          <div className="w-3.5 h-3.5 rounded-full border-2 border-[#1A1A1A] border-t-transparent animate-spin" />
        )}
        {status === 'done' && <CheckCircle size={14} className="text-green-600" />}
        {status === 'error' && <span className="text-xs text-red-500 font-medium">Failed</span>}
      </div>
      {children && <div className="p-5">{children}</div>}
    </div>
  )
}

export default function ColdOutboundPage() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [result, setResult] = useState<RunResult | null>(null)
  const [error, setError] = useState('')
  const [showRequest, setShowRequest] = useState(false)
  const [showResponse, setShowResponse] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [sent, setSent] = useState(false)

  // Check if all steps passed — founder found, email guessed, and draft generated
  const allStepsPassed = result &&
    result.steps.extraction?.founderName &&
    result.steps.email?.guessed &&
    result.steps.draft?.subject &&
    result.steps.draft?.body

  async function run(e: React.FormEvent) {
    e.preventDefault()
    if (!url) return
    setLoading(true)
    setResult(null)
    setError('')
    setCurrentStep(1)
    setSent(false)
    setShowEmailModal(false)

    try {
      const res = await fetch('/api/agents/cold-outbound/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.startsWith('http') ? url : `https://${url}` }),
      })
      const data: RunResult = await res.json()
      if (data.error && !data.steps) {
        setError(data.error)
      } else {
        setResult(data)
        if (data.error) setError(data.error)
        // Auto-open review modal if all steps passed
        if (data.steps.extraction?.founderName &&
            data.steps.email?.guessed &&
            data.steps.draft?.subject &&
            data.steps.draft?.body) {
          setShowEmailModal(true)
        }
      }
    } catch (err) {
      setError(String(err))
    }

    setCurrentStep(0)
    setLoading(false)
  }

  function stepStatus(step: number): 'pending' | 'running' | 'done' | 'error' {
    if (loading && currentStep === 1) {
      return 'running'
    }
    if (error && !result) return 'error'
    if (!result) return 'pending'
    const s = result.steps
    if (step === 1) return s.parallel ? 'done' : 'pending'
    if (step === 2) return s.extraction ? 'done' : 'pending'
    if (step === 3) return s.email ? 'done' : 'pending'
    if (step === 4) return s.draft?.subject ? 'done' : (s.draft ? 'done' : 'pending')
    return 'pending'
  }

  return (
    <div className="min-h-screen bg-[#F7F6F3]">
      <header className="px-10 pt-12 pb-6 flex items-center gap-3">
        <button onClick={() => router.push('/agents')} className="p-2 rounded-lg hover:bg-black/5 transition-colors -ml-2">
          <ArrowLeft size={16} className="text-[#888884]" />
        </button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#1A1A1A]">Cold Outbound</h1>
          <p className="text-sm text-[#888884] mt-0.5">URL &rarr; founder &rarr; email &rarr; draft from template 001</p>
        </div>
      </header>

      <main className="px-10 pb-10 max-w-2xl space-y-6">
        {/* URL Input */}
        <form onSubmit={run} className="flex gap-3">
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://virgil.ai"
            className="flex-1 text-sm border border-[#E8E7E3] bg-white rounded-xl px-4 py-3 outline-none focus:border-[#1A1A1A] transition-colors"
          />
          <button
            type="submit"
            disabled={loading || !url}
            className="flex items-center gap-2 text-sm bg-[#1A1A1A] text-white px-5 py-3 rounded-xl hover:bg-[#333] disabled:opacity-40 transition-colors"
          >
            <Play size={14} />
            {loading ? 'Running...' : 'Run'}
          </button>
        </form>

        {error && !result && (
          <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* Step cards — show when loading or have results */}
        {(loading || result) && (
          <div className="space-y-3">
            {/* Step 1: Parallel search */}
            <StepCard number={1} title="Searching for CEO via Parallel..." status={stepStatus(1)}>
              {result?.steps.parallel && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${CONFIDENCE_COLORS[result.steps.parallel.confidence] ?? CONFIDENCE_COLORS.unknown}`}>
                      {result.steps.parallel.confidence}
                    </span>
                    <span className="text-xs text-[#B0AFAB]">run_id: {result.steps.parallel.runId}</span>
                  </div>
                  <div className="text-sm text-[#333] leading-relaxed whitespace-pre-wrap max-h-48 overflow-auto">
                    {result.steps.parallel.content}
                  </div>
                </div>
              )}
            </StepCard>

            {/* Step 2: Name extraction */}
            <StepCard number={2} title="Extracting CEO name..." status={stepStatus(2)}>
              {result?.steps.extraction && (
                <p className="text-sm text-[#1A1A1A]">
                  {result.steps.extraction.founderName ? (
                    <span>CEO: <strong>{result.steps.extraction.founderName}</strong></span>
                  ) : (
                    <span className="text-[#888884]">No CEO/founder name found</span>
                  )}
                </p>
              )}
            </StepCard>

            {/* Step 3: Email guess */}
            <StepCard number={3} title="Guessing email address..." status={stepStatus(3)}>
              {result?.steps.email && (
                <p className="text-sm text-[#1A1A1A]">
                  {result.steps.email.guessed ? (
                    <span>Email: <strong>{result.steps.email.guessed}</strong></span>
                  ) : (
                    <span className="text-[#888884]">Could not guess email</span>
                  )}
                </p>
              )}
            </StepCard>

            {/* Step 4: Draft email */}
            <StepCard number={4} title="Drafting email from template 001..." status={stepStatus(4)}>
              {result?.steps.draft && result.steps.draft.subject && (
                <div className="space-y-2">
                  <p className="text-sm text-[#1A1A1A]">
                    <strong>Subject:</strong> {result.steps.draft.subject}
                  </p>
                  <div className="bg-[#F7F6F3] border border-[#E8E7E3] rounded-lg p-3 text-sm text-[#333] leading-relaxed whitespace-pre-wrap max-h-48 overflow-auto">
                    {result.steps.draft.body}
                  </div>
                </div>
              )}
              {result?.steps.draft && !result.steps.draft.subject && (
                <p className="text-sm text-[#888884]">No template &quot;001&quot; found or missing data</p>
              )}
            </StepCard>
          </div>
        )}

        {/* Action buttons */}
        {result?.targetId && !loading && (
          <div className="flex gap-3">
            {allStepsPassed && !sent && (
              <button
                onClick={() => setShowEmailModal(true)}
                className="flex-1 flex items-center gap-2 text-sm text-white bg-[#1A1A1A] px-4 py-3 rounded-xl hover:bg-[#333] transition-colors justify-center"
              >
                <Send size={14} />
                Review &amp; Send
              </button>
            )}
            {sent && (
              <div className="flex-1 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 px-4 py-3 rounded-xl justify-center">
                <CheckCircle size={14} />
                Email sent
              </div>
            )}
            <button
              onClick={() => router.push(`/targets/${result.targetId}`)}
              className="flex items-center gap-2 text-sm text-[#1A1A1A] border border-[#E8E7E3] bg-white px-4 py-3 rounded-xl hover:border-[#C8C7C3] transition-colors justify-center flex-1"
            >
              <ExternalLink size={14} />
              View Target
            </button>
          </div>
        )}

        {/* Debug section */}
        {result?.debug && (result.debug.request || result.debug.response) && !loading && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-[#888884] uppercase tracking-wide">Debug</p>
            {result.debug.request && (
              <div className="bg-white border border-[#E8E7E3] rounded-xl overflow-hidden">
                <button onClick={() => setShowRequest(v => !v)} className="flex items-center gap-2 w-full px-4 py-3 text-xs text-[#555] hover:bg-[#F7F6F3] transition-colors">
                  {showRequest ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span className="font-medium">Request to Parallel</span>
                </button>
                {showRequest && (
                  <pre className="text-xs bg-[#F7F6F3] border-t border-[#E8E7E3] p-4 overflow-auto max-h-64 text-[#333] leading-relaxed">
                    {JSON.stringify(result.debug.request, null, 2)}
                  </pre>
                )}
              </div>
            )}
            {result.debug.response && (
              <div className="bg-white border border-[#E8E7E3] rounded-xl overflow-hidden">
                <button onClick={() => setShowResponse(v => !v)} className="flex items-center gap-2 w-full px-4 py-3 text-xs text-[#555] hover:bg-[#F7F6F3] transition-colors">
                  {showResponse ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span className="font-medium">Raw response from Parallel</span>
                </button>
                {showResponse && (
                  <pre className="text-xs bg-[#F7F6F3] border-t border-[#E8E7E3] p-4 overflow-auto max-h-96 text-[#333] leading-relaxed">
                    {JSON.stringify(result.debug.response, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Email review & send modal */}
      {showEmailModal && result && allStepsPassed && (
        <SendEmailModal
          targetId={result.targetId}
          targetName={result.steps.extraction!.founderName!}
          targetEmail={result.steps.email!.guessed!}
          initialSubject={result.steps.draft!.subject!}
          initialBody={result.steps.draft!.body!}
          onClose={() => setShowEmailModal(false)}
          onSent={() => {
            setShowEmailModal(false)
            setSent(true)
          }}
        />
      )}
    </div>
  )
}
