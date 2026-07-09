'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { todos as seedTodos, todoGroups } from '@/lib/data'

type UiTodo = {
  id: string
  text: string
  meta: string
  href?: string | null
  group: string
  status: 'open' | 'cleared'
}

const seedUi: UiTodo[] = seedTodos.map((t) => ({ ...t, status: 'open' }))

export default function Docket() {
  const [items, setItems] = useState<UiTodo[]>(seedUi)
  const [live, setLive] = useState(false)

  // Reconcile with the database when there is one; otherwise the seed stands.
  useEffect(() => {
    fetch('/api/todos')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.live) {
          setItems(data.todos)
          setLive(true)
        }
      })
      .catch(() => {})
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

  const open = items.filter((t) => t.status === 'open')
  const cleared = items.filter((t) => t.status === 'cleared')

  return (
    <>
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
                    <div className="min-w-0">
                      <p className="font-serif text-[17px] leading-snug text-ink">{t.text}</p>
                      {t.href ? (
                        <Link
                          href={t.href}
                          className="eyebrow mt-1.5 inline-block text-faint underline decoration-hairline underline-offset-4"
                        >
                          {t.meta}
                        </Link>
                      ) : (
                        <p className="eyebrow mt-1.5 text-faint">{t.meta}</p>
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
                    <p className="eyebrow mt-1.5 text-faint">{t.meta}</p>
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
