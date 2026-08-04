'use client'

import { useEffect, useState } from 'react'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Google sign-in errors land back here as ?error=…
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('error')
    if (code === 'uninvited') setError('That account is not on the circulation list.')
    else if (code === 'signin') setError('Google sign-in did not take. Try again.')
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      window.location.href = '/'
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Something went wrong.')
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center pb-32 pt-14">
      <header className="text-center">
        <p className="eyebrow">Private Circulation</p>
        <h1 className="mt-3 font-serif text-[40px] font-semibold leading-none tracking-tight">
          The Allocator
        </h1>
        <p className="dek mt-2">For the reader it was prepared for.</p>
      </header>

      <div className="rule-masthead mt-8" />

      <form onSubmit={handleSubmit} className="pt-10">
        <label className="eyebrow-ink" htmlFor="password">
          The Word
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          className="mt-3 w-full border-b border-ink bg-transparent pb-2 font-serif text-[18px] text-ink focus:outline-none"
        />
        {error && <p className="dek mt-4 text-oxblood">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="mt-8 w-full border border-ink py-3.5 font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-ink transition-colors duration-300 ease-editorial hover:bg-ink hover:text-paper disabled:opacity-40"
        >
          {loading ? 'One moment' : 'Enter'}
        </button>
      </form>

      <div className="mt-10 flex items-center gap-4">
        <div className="h-px flex-1 bg-hairline" />
        <span className="eyebrow text-faint">or</span>
        <div className="h-px flex-1 bg-hairline" />
      </div>

      <a
        href="/api/auth/signin"
        className="mt-6 block w-full border border-hairline py-3.5 text-center font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-ink transition-colors duration-300 ease-editorial hover:border-ink"
      >
        Sign In with Google
      </a>
      <p className="dek mt-3 text-center text-[13px]">
        By invitation — a listed account opens its own desk.
      </p>
    </main>
  )
}
