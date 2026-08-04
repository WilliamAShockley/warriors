'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

// The reading-copy masthead line, shown to guests only. Cosmetic — the
// middleware refuses every guest write regardless; this just says so
// politely before they find out by tapping.
export default function GuestNotice() {
  const pathname = usePathname()
  const [guest, setGuest] = useState(false)

  useEffect(() => {
    setGuest(/(?:^|;\s*)allocator_role=guest(?:;|$)/.test(document.cookie))
  }, [pathname])

  if (!guest || pathname === '/login') return null

  return (
    <div className="border-b border-hairline bg-paper pb-2.5 pt-3 text-center">
      <p className="eyebrow text-oxblood">The Reading Copy</p>
      <p className="mt-0.5 font-serif text-[12.5px] italic leading-snug text-stone">
        A guest key opened this edition. Look all you like — nothing signs, sends, or files.
      </p>
    </div>
  )
}
