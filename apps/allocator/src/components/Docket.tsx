'use client'

import Link from 'next/link'
import { useState } from 'react'
import clsx from 'clsx'
import { todos, todoGroups } from '@/lib/data'

export default function Docket() {
  const [done, setDone] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const remaining = todos.length - done.size

  return (
    <>
      {todoGroups.map((group) => {
        const items = todos.filter((t) => t.group === group)
        return (
          <section key={group} className="pt-8">
            <p className="eyebrow-ink">{group}</p>
            <ul className="mt-1">
              {items.map((t) => {
                const isDone = done.has(t.id)
                return (
                  <li key={t.id} className="rule first:border-t-0">
                    <div className="flex items-start gap-4 py-4">
                      <button
                        onClick={() => toggle(t.id)}
                        aria-label={isDone ? 'Reopen' : 'Mark done'}
                        className={clsx(
                          'mt-1 h-[18px] w-[18px] shrink-0 rounded-full border transition-colors duration-300 ease-editorial',
                          isDone ? 'border-ink bg-ink' : 'border-stone bg-transparent'
                        )}
                      />
                      <div className="min-w-0">
                        <p
                          className={clsx(
                            'font-serif text-[17px] leading-snug transition-colors duration-300 ease-editorial',
                            isDone ? 'text-faint line-through decoration-hairline' : 'text-ink'
                          )}
                        >
                          {t.text}
                        </p>
                        {t.href ? (
                          <Link href={t.href} className="eyebrow mt-1.5 inline-block text-faint underline decoration-hairline underline-offset-4">
                            {t.meta}
                          </Link>
                        ) : (
                          <p className="eyebrow mt-1.5 text-faint">{t.meta}</p>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="rule mt-1" />
          </section>
        )
      })}

      <p className="dek pb-4 pt-8 text-center">
        {remaining === 0
          ? 'The docket is clear. Enjoy it while it lasts.'
          : `${remaining} item${remaining === 1 ? '' : 's'} standing between you and a clear desk.`}
      </p>
    </>
  )
}
