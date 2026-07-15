'use client'

import { useEffect, useState } from 'react'

export default function ColophonForm() {
  const [name, setName] = useState('')
  const [account, setAccount] = useState<string | null>(null)
  const [live, setLive] = useState(true)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return
        setName(data.name ?? '')
        setAccount(data.account ?? null)
        setLive(Boolean(data.live))
      })
      .catch(() => {})
  }, [])

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setState('saving')
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await res.json()
      setState(data?.ok ? 'saved' : 'failed')
    } catch {
      setState('failed')
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      className="pt-8"
    >
      <label className="eyebrow-ink" htmlFor="reader-name">
        The Reader
      </label>
      <p className="dek mt-1.5 text-[13px]">
        The name on the morning greeting, and how Apollo addresses its briefings.
      </p>
      <input
        id="reader-name"
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setState('idle')
        }}
        placeholder="Your name"
        className="mt-4 w-full border-b border-ink bg-transparent pb-2 font-serif text-[18px] text-ink placeholder:italic placeholder:text-faint focus:outline-none"
      />

      {live && (
        <div className="pt-8">
          <p className="eyebrow-ink">The Account</p>
          {account ? (
            <p className="body-copy mt-2">
              Connected as <span className="italic">{account}</span>. The calendar and the
              mail desk — reading and sending — both run through this account.
            </p>
          ) : (
            <p className="body-copy mt-2">
              No Google account connected. Connect one and the Brief gains your calendar;
              the desk gains your mail.
            </p>
          )}
          <p className="mt-3">
            <a
              href="/api/auth/google"
              className="eyebrow-ink underline decoration-hairline underline-offset-4"
            >
              {account ? 'Reconnect · or switch to another account' : 'Connect a Google account'}
            </a>
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={state === 'saving' || !name.trim()}
        className="mt-9 w-full border border-ink py-3.5 font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-ink transition-colors duration-300 ease-editorial hover:bg-ink hover:text-paper disabled:opacity-40"
      >
        {state === 'saving' ? 'One moment' : 'Set It Down'}
      </button>

      {state === 'saved' && (
        <p className="dek mt-4 text-center text-[13px]">
          Noted. The next greeting carries it.
        </p>
      )}
      {state === 'failed' && (
        <p className="dek mt-4 text-center text-[13px] text-oxblood">
          That did not take — the backend may not be connected.
        </p>
      )}
    </form>
  )
}
