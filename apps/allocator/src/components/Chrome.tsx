'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import clsx from 'clsx'
import Analyst from './Analyst'

const tabs = [
  { href: '/', label: 'Apollo' },
  { href: '/brief', label: 'Brief' },
  { href: '/research', label: 'Research' },
  { href: '/book', label: 'Book' },
  { href: '/notes', label: 'Notes' },
]

export default function Chrome() {
  const pathname = usePathname()
  const [analystOpen, setAnalystOpen] = useState(false)

  // The gate has no navigation — nothing behind it is reachable anyway.
  if (pathname === '/login') return null

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-paper/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[430px] items-stretch px-6">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                'relative flex-1 pb-[calc(0.9rem+env(safe-area-inset-bottom))] pt-4 text-center font-sans text-[10px] font-medium uppercase tracking-[0.18em] transition-colors duration-300 ease-editorial',
                isActive(tab.href) ? 'text-ink' : 'text-faint'
              )}
            >
              {isActive(tab.href) && (
                <span className="absolute left-1/2 top-0 h-px w-6 -translate-x-1/2 bg-ink" />
              )}
              {tab.label}
            </Link>
          ))}
          <button
            onClick={() => setAnalystOpen(true)}
            aria-label="Ask the Analyst"
            className="flex flex-1 items-center justify-center pb-[calc(0.9rem+env(safe-area-inset-bottom))] pt-4"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-ink/60 font-serif text-[13px] italic leading-none text-ink">
              A
            </span>
          </button>
        </div>
      </nav>

      <Analyst open={analystOpen} onClose={() => setAnalystOpen(false)} />
    </>
  )
}
