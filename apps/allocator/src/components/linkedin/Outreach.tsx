'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Status = 'drafted' | 'queued' | 'sending' | 'sent' | 'accepted' | 'replied' | 'met' | 'passed' | 'failed'

type Prospect = {
  id: string
  slug: string
  url: string
  fullName: string | null
  firstName: string | null
  nameConfirmed: boolean
  headline: string | null
  note: string | null
  status: Status
  subject: string | null
  message: string
  rehearse: boolean
  sentMessage: string | null
  channel: string | null
  sentAt: string | null
  error: string | null
  events: { at: string; kind: string; detail?: string }[]
  createdAt: string
}

type Payload = {
  prospects: Prospect[]
  config: { template: string; subject: string; dailyCap: number }
  sentToday: number
  noteLimit: number
  subjectLimit: number
  store: 'database' | 'file'
  runner: { local: boolean; running: boolean; lastExit: string | null; seenAt: string | null }
}

const FILTERS: { key: string; label: string; match: (s: Status) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'todo', label: 'To send', match: (s) => s === 'drafted' },
  { key: 'moving', label: 'In flight', match: (s) => s === 'queued' || s === 'sending' },
  { key: 'sent', label: 'Sent', match: (s) => s === 'sent' },
  { key: 'answered', label: 'Answered', match: (s) => s === 'accepted' || s === 'replied' || s === 'met' },
  { key: 'failed', label: 'Failed', match: (s) => s === 'failed' },
  { key: 'passed', label: 'Passed', match: (s) => s === 'passed' },
]

const STATUS_WORD: Record<Status, string> = {
  drafted: 'Drafted',
  queued: 'Queued',
  sending: 'Sending now',
  sent: 'Sent',
  accepted: 'Accepted',
  replied: 'Replied',
  met: 'Met',
  passed: 'Passed',
  failed: 'Failed',
}

const CHANNEL_WORD: Record<string, string> = {
  sales_nav: 'Sales Navigator message',
  connect_note: 'connection request with a note',
  message: 'direct message',
  'by hand': 'sent by hand',
}

const OUTCOMES: Status[] = ['accepted', 'replied', 'met', 'passed']

const fill = (text: string, firstName: string | null) => text.replace(/\{\s*first_?name\s*\}/gi, (firstName ?? '').trim() || '…')

// How long since the sending machine last asked for work.
function macLine(seenAt: string | null): { text: string; stale: boolean } {
  if (!seenAt) return { text: 'Your Mac has not checked in yet', stale: true }
  const mins = Math.round((Date.now() - new Date(seenAt).getTime()) / 60000)
  if (mins <= 3) return { text: 'Your Mac is listening', stale: false }
  const ago = mins < 90 ? `${mins} min` : mins < 2880 ? `${Math.round(mins / 60)} hours` : `${Math.round(mins / 1440)} days`
  return { text: `Your Mac last checked in ${ago} ago · sends wait until it wakes`, stale: true }
}

const when = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const btn =
  'border border-ink px-4 py-2.5 font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-ink transition-colors duration-300 ease-editorial hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:border-hairline disabled:text-faint disabled:hover:bg-transparent disabled:hover:text-faint'
const quiet = 'eyebrow underline decoration-hairline underline-offset-4 hover:text-ink disabled:opacity-40'
const field =
  'w-full border-b border-hairline bg-transparent pb-1.5 font-serif text-[15px] text-ink placeholder:italic placeholder:text-faint focus:border-ink focus:outline-none'

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok && json?.ok !== false, json }
}

export default function Outreach() {
  const [data, setData] = useState<Payload | null>(null)
  const [urls, setUrls] = useState('')
  const [why, setWhy] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState<string | null>(null)
  const [draftOpen, setDraftOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/linkedin', { cache: 'no-store' })
      if (res.ok) setData(await res.json())
    } catch {}
  }, [])

  useEffect(() => {
    load()
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  // While anything is on its way, keep watching it.
  const inFlight = data?.prospects.some((p) => p.status === 'queued' || p.status === 'sending') ?? false
  useEffect(() => {
    if (!inFlight) return
    const t = setInterval(load, 2500)
    return () => clearInterval(t)
  }, [inFlight, load])
  useEffect(() => {
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  const counts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const f of FILTERS) out[f.key] = data?.prospects.filter((p) => f.match(p.status)).length ?? 0
    return out
  }, [data])

  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0]
    return data?.prospects.filter((p) => f.match(p.status)) ?? []
  }, [data, filter])

  async function file(e: React.FormEvent) {
    e.preventDefault()
    if (!urls.trim() || busy) return
    setBusy(true)
    const { ok, json } = await call('/api/linkedin', 'POST', { urls, note: why })
    setBusy(false)
    const bits: string[] = []
    if (json?.added?.length) bits.push(`${json.added.length} filed`)
    if (json?.duplicates?.length) bits.push(`${json.duplicates.length} already here`)
    if (json?.invalid?.length) bits.push(`not a profile URL: ${json.invalid.join(', ')}`)
    setNotice(bits.join(' · ') || json?.error || (ok ? null : 'Could not file that.'))
    if (json?.added?.length) {
      setUrls('')
      setWhy('')
      if (json.added.length === 1) setOpen(json.added[0].id)
      setFilter('all')
    }
    load()
  }

  if (!data) return <p className="dek mt-6">Opening the file…</p>

  const capLeft = Math.max(0, data.config.dailyCap - data.sentToday)
  const mac = macLine(data.runner.seenAt)

  return (
    <section>
      <form onSubmit={file} className="pt-5">
        <label className="eyebrow" htmlFor="li-urls">
          Add someone
        </label>
        <textarea
          id="li-urls"
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          rows={urls.includes('\n') ? 4 : 1}
          placeholder="linkedin.com/in/… (one, or a pasted list)"
          className={`${field} mt-2 resize-none`}
        />
        {urls.trim() && (
          <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why them (for your eyes only, optional)" className={`${field} mt-3 text-[14px]`} />
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          <button type="submit" disabled={!urls.trim() || busy} className={btn}>
            File it
          </button>
          {notice && <p className="font-serif text-[13px] italic text-stone">{notice}</p>}
        </div>
      </form>

      <div className="rule mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 pt-3">
        <p className="eyebrow">
          {data.sentToday} sent today · {capLeft} left of {data.config.dailyCap}
        </p>
        <p className={`eyebrow ${!data.runner.local && mac.stale ? 'text-oxblood' : 'text-faint'}`}>
          {data.runner.running ? 'The browser is working' : data.runner.local ? 'Sends from this machine' : mac.text}
        </p>
      </div>
      {data.runner.lastExit && data.runner.lastExit !== 'exit 0' && !data.runner.running && (
        <p className="mt-2 font-serif text-[13px] italic text-oxblood">
          The runner stopped early ({data.runner.lastExit}). Its log is at apps/linkedin-nav/outreach_logs/runner.log.
        </p>
      )}

      <StandingDraft
        open={draftOpen}
        onToggle={() => setDraftOpen((v) => !v)}
        config={data.config}
        noteLimit={data.noteLimit}
        onSaved={load}
      />

      <nav className="mt-6 flex flex-wrap gap-x-5 gap-y-2" aria-label="Filter by status">
        {FILTERS.filter((f) => f.key === 'all' || counts[f.key] > 0).map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={filter === f.key ? 'eyebrow-ink underline decoration-ink underline-offset-4' : 'eyebrow text-faint hover:text-ink'}
          >
            {f.label} {counts[f.key]}
          </button>
        ))}
      </nav>

      {data.prospects.length === 0 ? (
        <p className="dek mt-6">Nobody yet. Paste a profile URL above; a draft is written for each one, and nothing goes out until you send it.</p>
      ) : (
        <ul className="rule-masthead mt-3">
          {shown.map((p) => (
            <Row
              key={p.id}
              p={p}
              open={open === p.id}
              onToggle={() => setOpen(open === p.id ? null : p.id)}
              noteLimit={data.noteLimit}
              defaultSubject={data.config.subject}
              capLeft={capLeft}
              reload={load}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function StandingDraft({
  open,
  onToggle,
  config,
  noteLimit,
  onSaved,
}: {
  open: boolean
  onToggle: () => void
  config: Payload['config']
  noteLimit: number
  onSaved: () => void
}) {
  const [template, setTemplate] = useState(config.template)
  const [subject, setSubject] = useState(config.subject)
  const [cap, setCap] = useState(String(config.dailyCap))
  const [saved, setSaved] = useState(false)
  const dirty = template !== config.template || subject !== config.subject || cap !== String(config.dailyCap)

  async function save() {
    await call('/api/linkedin/config', 'POST', { template, subject, dailyCap: Number(cap) })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    onSaved()
  }

  return (
    <div className="mt-4">
      <button type="button" onClick={onToggle} aria-expanded={open} className={quiet}>
        The standing draft {open ? '−' : '+'}
      </button>
      {open && (
        <div className="mt-3">
          <p className="dek text-[13px]">
            Every new person starts from this. {'{firstName}'} fills in per person. Changing it does not touch drafts already filed.
          </p>
          <label className="eyebrow mt-4 block">
            Subject
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 block w-full border-b border-hairline bg-transparent pb-1.5 font-serif text-[15px] normal-case tracking-normal text-ink focus:border-ink focus:outline-none"
            />
          </label>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={5}
            aria-label="Standing draft"
            className="mt-3 w-full border border-hairline bg-transparent p-3 font-serif text-[15px] leading-relaxed text-ink focus:border-ink focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <Count n={template.length} limit={noteLimit} />
            <label className="eyebrow flex items-center gap-2">
              Daily cap
              <input
                value={cap}
                onChange={(e) => setCap(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                className="w-12 border-b border-hairline bg-transparent pb-0.5 text-center font-serif text-[14px] normal-case tracking-normal text-ink focus:border-ink focus:outline-none"
              />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-4">
            <button type="button" onClick={save} disabled={!dirty || !template.trim() || !subject.trim()} className={btn}>
              Keep it
            </button>
            {saved && <span className="eyebrow">Kept</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function Count({ n, limit }: { n: number; limit: number }) {
  return (
    <p className={`eyebrow ${n > limit ? 'text-oxblood' : 'text-faint'}`}>
      {n} / {limit}
      {n > limit && ' · too long for Sales Navigator'}
    </p>
  )
}

function Row({
  p,
  open,
  onToggle,
  noteLimit,
  defaultSubject,
  capLeft,
  reload,
}: {
  p: Prospect
  open: boolean
  onToggle: () => void
  noteLimit: number
  defaultSubject: string
  capLeft: number
  reload: () => void
}) {
  const [message, setMessage] = useState(p.message)
  const [subject, setSubject] = useState(p.subject ?? defaultSubject)
  const [firstName, setFirstName] = useState(p.firstName ?? '')
  const [confirming, setConfirming] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const touched = useRef(false)

  // Take the server's copy whenever the reader is not mid-edit (the runner
  // fills in the real name and headline after its visit).
  useEffect(() => {
    if (touched.current) return
    setMessage(p.message)
    setSubject(p.subject ?? defaultSubject)
    setFirstName(p.firstName ?? '')
  }, [p.message, p.subject, p.firstName, defaultSubject])

  // A note about the last action is stale once the row has moved on.
  useEffect(() => setErr(null), [p.status])

  const moving = p.status === 'queued' || p.status === 'sending'
  const gone = Boolean(p.sentAt)
  const editable = !moving && !gone
  const preview = fill(message, firstName || null)
  const name = p.fullName ?? p.slug

  async function save() {
    if (!touched.current) return true
    const { ok, json } = await call(`/api/linkedin/${p.id}`, 'PATCH', { message, subject, firstName })
    if (!ok) {
      setErr(json?.error ?? 'Could not save.')
      return false
    }
    touched.current = false
    return true
  }

  async function act(fn: () => Promise<{ ok: boolean; json: any }>) {
    setWorking(true)
    setErr(null)
    const { ok, json } = await fn()
    setWorking(false)
    setConfirming(false)
    if (!ok) setErr(json?.error ?? json?.runner?.reason ?? 'That did not go through.')
    else if (json?.runner && !json.runner.running && json.runner.reason) setErr(json.runner.reason)
    reload()
  }

  const send = (rehearse: boolean) =>
    act(async () => {
      if (!(await save())) return { ok: false, json: { error: 'Could not save the draft first.' } }
      return call(`/api/linkedin/${p.id}/send`, 'POST', { rehearse })
    })

  const mark = (status: Status) => act(() => call(`/api/linkedin/${p.id}`, 'PATCH', { status }))

  const lastEvent = p.events[p.events.length - 1]

  return (
    <li className="rule first:border-t-0">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-baseline justify-between gap-4 py-4 text-left">
        <span className="min-w-0">
          <span className="block truncate font-serif text-[18px] font-medium leading-snug tracking-tight text-ink">{name}</span>
          {p.headline && <span className="mt-0.5 block truncate font-serif text-[13px] italic text-stone">{p.headline}</span>}
        </span>
        <span className={`eyebrow shrink-0 text-right ${p.status === 'failed' ? 'text-oxblood' : p.status === 'drafted' ? 'text-faint' : 'text-ink'}`}>
          {STATUS_WORD[p.status]}
          {p.rehearse && moving ? ' · rehearsal' : ''}
          {p.sentAt && <span className="block text-faint">{when(p.sentAt)}</span>}
        </span>
      </button>

      {open && (
        <div className="pb-6">
          <p className="flex flex-wrap gap-x-5 gap-y-1">
            <a href={p.url} target="_blank" rel="noreferrer" className={quiet}>
              Open the profile ↗
            </a>
            {p.note && <span className="font-serif text-[13px] italic text-stone">{p.note}</span>}
          </p>

          {p.error && <p className="mt-3 font-serif text-[14px] leading-relaxed text-oxblood">{p.error}</p>}

          {gone ? (
            <div className="mt-4">
              <p className="eyebrow">
                What was sent · {CHANNEL_WORD[p.channel ?? ''] ?? p.channel ?? 'unknown path'} · {when(p.sentAt)}
              </p>
              <div className="mt-2 border-l border-ink pl-4">
                {p.subject && <p className="font-serif text-[15px] font-medium text-ink">{p.subject}</p>}
                <p className="mt-1 whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-ink">{p.sentMessage}</p>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
                <span className="eyebrow text-faint">Mark</span>
                {(['sent', ...OUTCOMES] as Status[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={working}
                    onClick={() => mark(s)}
                    aria-pressed={p.status === s}
                    className={p.status === s ? 'eyebrow-ink underline decoration-ink underline-offset-4' : quiet}
                  >
                    {s === 'sent' ? 'No answer yet' : STATUS_WORD[s]}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <label className="eyebrow flex items-center gap-3">
                First name
                <input
                  value={firstName}
                  disabled={!editable}
                  onChange={(e) => {
                    touched.current = true
                    setFirstName(e.target.value)
                  }}
                  onBlur={save}
                  placeholder="read from the profile"
                  className="w-44 border-b border-hairline bg-transparent pb-0.5 font-serif text-[14px] normal-case tracking-normal text-ink placeholder:italic placeholder:text-faint focus:border-ink focus:outline-none"
                />
                {!p.nameConfirmed && firstName && <span className="normal-case tracking-normal text-faint">a guess · checked against the profile</span>}
              </label>
              <label className="eyebrow mt-4 flex items-center gap-3">
                Subject
                <input
                  value={subject}
                  disabled={!editable}
                  onChange={(e) => {
                    touched.current = true
                    setSubject(e.target.value)
                  }}
                  onBlur={save}
                  className="min-w-0 flex-1 border-b border-hairline bg-transparent pb-0.5 font-serif text-[15px] normal-case tracking-normal text-ink focus:border-ink focus:outline-none disabled:text-stone"
                />
              </label>
              <textarea
                value={message}
                disabled={!editable}
                onChange={(e) => {
                  touched.current = true
                  setMessage(e.target.value)
                }}
                onBlur={save}
                rows={5}
                aria-label={`Draft for ${name}`}
                className="mt-3 w-full border border-hairline bg-transparent p-3 font-serif text-[15px] leading-relaxed text-ink focus:border-ink focus:outline-none disabled:text-stone"
              />
              <div className="mt-1.5 flex justify-between gap-4">
                <Count n={preview.length} limit={noteLimit} />
              </div>
              {/\{\s*first_?name\s*\}/i.test(message) && (
                <p className="mt-3 whitespace-pre-wrap border-l border-hairline pl-4 font-serif text-[14px] italic leading-relaxed text-stone">{preview}</p>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                {moving ? (
                  <>
                    <p className="font-serif text-[14px] italic text-stone">
                      {p.status === 'sending' ? 'The browser has it now.' : 'Waiting for the browser.'}
                    </p>
                    {p.status === 'queued' && (
                      <button type="button" disabled={working} onClick={() => mark('drafted')} className={quiet}>
                        Cancel
                      </button>
                    )}
                  </>
                ) : confirming ? (
                  <>
                    <button type="button" disabled={working} onClick={() => send(false)} className={`${btn} bg-ink text-paper`}>
                      Yes, send to {firstName || name}
                    </button>
                    <button type="button" onClick={() => setConfirming(false)} className={quiet}>
                      Not yet
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" disabled={working || !message.trim() || !subject.trim() || capLeft === 0} onClick={() => setConfirming(true)} className={btn}>
                      Send
                    </button>
                    <button type="button" disabled={working || !message.trim()} onClick={() => send(true)} className={quiet} title="Runs the browser up to the typed message, then stops without sending">
                      Rehearse
                    </button>
                    <button type="button" disabled={working} onClick={() => mark('sent')} className={quiet}>
                      I sent it myself
                    </button>
                    <button type="button" disabled={working} onClick={() => mark(p.status === 'passed' ? 'drafted' : 'passed')} className={quiet}>
                      {p.status === 'passed' ? 'Bring back' : 'Pass'}
                    </button>
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => act(() => call(`/api/linkedin/${p.id}`, 'DELETE'))}
                      className={`${quiet} hover:text-oxblood`}
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
              {capLeft === 0 && !moving && <p className="mt-2 font-serif text-[13px] italic text-stone">Today&rsquo;s cap is spent. Raise it in the standing draft, or send tomorrow.</p>}
            </div>
          )}

          {err && <p className="mt-3 font-serif text-[13px] italic text-oxblood">{err}</p>}

          {lastEvent && (
            <ol className="mt-5 space-y-0.5">
              {p.events
                .slice(-6)
                .reverse()
                .map((e, i) => (
                  <li key={`${e.at}-${i}`} className="eyebrow text-faint">
                    {when(e.at)} · {e.kind}
                    {e.detail ? ` · ${e.detail}` : ''}
                  </li>
                ))}
            </ol>
          )}
        </div>
      )}
    </li>
  )
}
