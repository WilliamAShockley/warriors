'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { todos as seedTodos, todoGroups } from '@/lib/data'

type UiUpdate = { id: string; text: string; filedOn: string }

type UiTodo = {
  id: string
  text: string
  meta: string
  href?: string | null
  group: string
  status: 'open' | 'cleared'
  updates?: UiUpdate[]
}

const seedUi: UiTodo[] = seedTodos.map((t) => ({ ...t, status: 'open', updates: [] }))

export default function Docket() {
  // Starts empty — the seeded docket appears only once the backend
  // declares itself mock (zero-env demo), never as a flash on a live desk.
  const [items, setItems] = useState<UiTodo[]>([])
  const [live, setLive] = useState(false)
  const [draft, setDraft] = useState('')

  // Inline amendment: tap an item's text to reword it in place. An edit is
  // a correction — it never re-commissions the desk.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  // The running log: dated status updates under a small disclosure per item.
  const [logOpenId, setLogOpenId] = useState<string | null>(null)
  const [logDraft, setLogDraft] = useState('')

  // Reconcile with the database when there is one; the seed stands only
  // for the zero-env demo (or an unreachable backend).
  useEffect(() => {
    fetch('/api/todos')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.live) {
          setItems(data.todos)
          setLive(true)
        } else {
          setItems(seedUi)
        }
      })
      .catch(() => setItems(seedUi))
  }, [])

  const toggle = (id: string) => {
    setItems((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: t.status === 'open' ? 'cleared' : 'open' } : t
      )
    )
    if (live) {
      fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }).catch(() => {})
    }
  }

  const add = async () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    if (live) {
      try {
        const res = await fetch('/api/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        const data = await res.json()
        if (data?.todo) {
          setItems((prev) => [...prev, data.todo])
          return
        }
      } catch {}
    }
    // Mock mode (or a failed write): the item still lands, session-only.
    setItems((prev) => [
      ...prev,
      { id: `local-${prev.length}-${text.length}`, text, meta: '', group: 'Today', status: 'open' },
    ])
  }

  const beginEdit = (t: UiTodo) => {
    setEditingId(t.id)
    setEditText(t.text)
  }

  const saveEdit = () => {
    const id = editingId
    const text = editText.trim()
    setEditingId(null)
    if (!id || !text) return
    const before = items.find((t) => t.id === id)
    if (!before || before.text === text) return
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, text } : t)))
    if (live) {
      fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, text }),
      }).catch(() => {})
    }
  }

  const fileUpdate = async (id: string) => {
    const text = logDraft.trim()
    if (!text) return
    setLogDraft('')
    if (live) {
      try {
        const res = await fetch('/api/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, update: text }),
        })
        const data = await res.json()
        if (data?.update) {
          setItems((prev) =>
            prev.map((t) => (t.id === id ? { ...t, updates: [...(t.updates ?? []), data.update] } : t))
          )
          return
        }
      } catch {}
    }
    // Mock mode (or a failed write): the update still lands, session-only.
    const filedOn = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' }).format(new Date())
    setItems((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, updates: [...(t.updates ?? []), { id: `local-u-${Date.now()}`, text, filedOn }] }
          : t
      )
    )
  }

  // Close an item out and file it to The File as a note. The item leaves
  // the docket immediately either way; in mock mode the move is session-only.
  const moveToNotes = (id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
    if (logOpenId === id) {
      setLogOpenId(null)
      setLogDraft('')
    }
    if (live) {
      fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, moveToNotes: true }),
      }).catch(() => {})
    }
  }

  const open = items.filter((t) => t.status === 'open')
  const cleared = items.filter((t) => t.status === 'cleared')

  return (
    <>
      {/* Capture */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        className="mt-7 border border-hairline focus-within:border-ink"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Put something on the docket…"
          className="w-full bg-transparent p-4 font-serif text-[15px] leading-relaxed text-ink placeholder:italic placeholder:text-faint focus:outline-none"
        />
        <div className="flex items-center justify-between border-t border-hairline px-4 py-2.5">
          <span className="eyebrow text-faint">Files under Today; ages from there</span>
          <button type="submit" className="eyebrow-ink underline decoration-hairline underline-offset-4">
            Add It
          </button>
        </div>
      </form>

      {open.length === 0 && cleared.length === 0 && (
        <p className="dek pt-10 text-center">The docket is clear. Enjoy it while it lasts.</p>
      )}

      {todoGroups.map((group) => {
        const groupItems = open.filter((t) => t.group === group)
        if (groupItems.length === 0) return null
        return (
          <section key={group} className="pt-8">
            <p className="eyebrow-ink">{group}</p>
            <ul className="mt-1">
              {groupItems.map((t) => (
                <li key={t.id} className="rule first:border-t-0">
                  <div className="flex items-start gap-4 py-4">
                    <button
                      onClick={() => toggle(t.id)}
                      aria-label="Clear"
                      className="mt-1 h-[18px] w-[18px] shrink-0 rounded-full border border-stone transition-colors duration-300 ease-editorial"
                    />
                    <div className="min-w-0 flex-1">
                      {editingId === t.id ? (
                        <input
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onBlur={saveEdit}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              saveEdit()
                            }
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          autoFocus
                          aria-label="Amend the item"
                          className="w-full border-b border-hairline bg-transparent pb-0.5 font-serif text-[17px] leading-snug text-ink focus:border-ink focus:outline-none"
                        />
                      ) : (
                        <p
                          onClick={() => beginEdit(t)}
                          title="Tap to amend"
                          className="cursor-text font-serif text-[17px] leading-snug text-ink"
                        >
                          {t.text}
                        </p>
                      )}
                      {t.meta &&
                        (t.href ? (
                          <Link
                            href={t.href}
                            className="eyebrow mt-1.5 inline-block text-faint underline decoration-hairline underline-offset-4"
                          >
                            {t.meta}
                          </Link>
                        ) : (
                          <p className="eyebrow mt-1.5 text-faint">{t.meta}</p>
                        ))}

                      {/* The running log — latest update at a glance, the rest under the disclosure */}
                      {(t.updates?.length ?? 0) > 0 && logOpenId !== t.id && (
                        <p className="mt-2 font-serif text-[13.5px] italic leading-snug text-stone">
                          ↳ {t.updates![t.updates!.length - 1].text}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-4">
                        <button
                          onClick={() => {
                            setLogOpenId(logOpenId === t.id ? null : t.id)
                            setLogDraft('')
                          }}
                          className="eyebrow text-faint underline decoration-hairline underline-offset-4"
                        >
                          {logOpenId === t.id
                            ? 'Close the Log'
                            : t.updates?.length
                              ? `Updates · ${t.updates.length} ▾`
                              : 'Add an Update ▾'}
                        </button>
                        <button
                          onClick={() => moveToNotes(t.id)}
                          title="Close it out and file it as a note"
                          className="eyebrow text-faint underline decoration-hairline underline-offset-4"
                        >
                          Move to Notes
                        </button>
                      </div>

                      {logOpenId === t.id && (
                        <div className="mt-3 border-l border-hairline pl-4">
                          {(t.updates?.length ?? 0) > 0 && (
                            <ul>
                              {t.updates!.map((u) => (
                                <li key={u.id} className="py-2 first:pt-0">
                                  <p className="eyebrow text-faint">{u.filedOn}</p>
                                  <p className="mt-1 font-serif text-[14px] leading-relaxed text-ink">
                                    {u.text}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          )}
                          <form
                            onSubmit={(e) => {
                              e.preventDefault()
                              fileUpdate(t.id)
                            }}
                            className="flex items-end gap-3 pb-1 pt-2"
                          >
                            <input
                              value={logDraft}
                              onChange={(e) => setLogDraft(e.target.value)}
                              placeholder="e.g. waiting on Breck to respond on dates, then text Alanna"
                              className="w-full border-b border-hairline bg-transparent pb-1.5 font-serif text-[14px] leading-snug text-ink placeholder:italic placeholder:text-faint focus:border-ink focus:outline-none"
                            />
                            <button
                              type="submit"
                              disabled={!logDraft.trim()}
                              className="eyebrow-ink shrink-0 underline decoration-hairline underline-offset-4 disabled:opacity-40"
                            >
                              File It
                            </button>
                          </form>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="rule mt-1" />
          </section>
        )
      })}

      {/* Cleared today — restorable until midnight files it to the record */}
      {cleared.length > 0 && (
        <section className="pt-9">
          <p className="eyebrow text-oxblood">Cleared Today</p>
          <p className="dek mt-1.5 text-[13px]">
            Still here at midnight, it is filed to the record.
          </p>
          <ul className="mt-2">
            {cleared.map((t) => (
              <li key={t.id} className="rule first:border-t-0">
                <div className="flex items-start gap-4 py-4">
                  <button
                    onClick={() => toggle(t.id)}
                    aria-label="Restore"
                    title="Restore to the docket"
                    className="mt-1 h-[18px] w-[18px] shrink-0 rounded-full border border-ink bg-ink transition-colors duration-300 ease-editorial"
                  />
                  <div className="min-w-0">
                    <p className="font-serif text-[17px] leading-snug text-faint line-through decoration-hairline">
                      {t.text}
                    </p>
                    {t.meta && <p className="eyebrow mt-1.5 text-faint">{t.meta}</p>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="rule mt-1" />
        </section>
      )}

      {open.length > 0 && (
        <p className="dek pb-4 pt-8 text-center">
          {`${open.length} item${open.length === 1 ? '' : 's'} standing between you and a clear desk.`}
        </p>
      )}
    </>
  )
}
