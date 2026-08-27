'use client'

import { useEffect, useState } from 'react'

type Invite = { id: string; email: string; signedIn: boolean }

// The Circulation List, operator's eyes only (the API refuses everyone
// else, and this section simply doesn't render for them). Signup is
// self-serve by default; the list binds when the instance runs closed
// (INVITE_ONLY=true) — kept current either way so flipping the switch
// later locks to a list that already exists.
export default function CirculationList() {
  const [visible, setVisible] = useState(false)
  const [inviteOnly, setInviteOnly] = useState(false)
  const [invites, setInvites] = useState<Invite[]>([])
  const [owners, setOwners] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    fetch('/api/invites')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || !data.live) return
        setVisible(true)
        setInviteOnly(Boolean(data.inviteOnly))
        setInvites(data.invites ?? [])
        setOwners(data.owners ?? [])
      })
      .catch(() => {})
  }, [])

  const add = async () => {
    const email = draft.trim().toLowerCase()
    if (!email) return
    setNote('')
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (data?.ok && data?.invite) {
        setInvites((prev) =>
          prev.some((i) => i.email === data.invite.email)
            ? prev
            : [...prev, { ...data.invite, signedIn: false }]
        )
        setDraft('')
      } else {
        setNote(data?.error ?? 'That did not take.')
      }
    } catch {
      setNote('Could not reach the desk.')
    }
  }

  const remove = async (email: string) => {
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, remove: true }),
      })
      const data = await res.json()
      if (data?.ok) setInvites((prev) => prev.filter((i) => i.email !== email))
    } catch {}
  }

  if (!visible) return null

  return (
    <>
      <div className="rule mt-12" />
      <section className="pt-10">
        <p className="eyebrow-ink">The Circulation</p>
        <p className="dek mt-1.5 text-[13px]">
          {inviteOnly
            ? 'This edition circulates by invitation — only the list below (and the owners) may open a desk.'
            : 'This edition circulates openly — anyone who signs in with Google gets a desk of their own. The list below binds only if you close circulation (INVITE_ONLY).'}
        </p>
        {owners.length > 0 && (
          <p className="eyebrow mt-3 text-faint">
            Owners · {owners.join(' · ')}
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
          className="mt-4 flex items-end gap-3"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="name@firm.com"
            type="email"
            className="w-full border-b border-hairline bg-transparent pb-1.5 font-serif text-[15px] text-ink placeholder:italic placeholder:text-faint focus:border-ink focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="eyebrow-ink shrink-0 underline decoration-hairline underline-offset-4 disabled:opacity-40"
          >
            Invite
          </button>
        </form>
        {note && <p className="dek mt-3 text-[13px] text-oxblood">{note}</p>}

        {invites.length > 0 && (
          <ul className="mt-2">
            {invites.map((i) => (
              <li key={i.id} className="rule flex items-baseline justify-between gap-4 py-3.5 first:border-t-0">
                <div className="min-w-0">
                  <p className="truncate font-serif text-[15px] text-ink">{i.email}</p>
                  <p className="eyebrow mt-1 text-faint">{i.signedIn ? 'Signed in' : 'Not yet arrived'}</p>
                </div>
                <button
                  onClick={() => remove(i.email)}
                  className="eyebrow shrink-0 text-faint underline decoration-hairline underline-offset-4 hover:text-oxblood"
                >
                  Strike
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
