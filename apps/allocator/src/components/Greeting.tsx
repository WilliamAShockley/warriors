'use client'

import { userName } from '@/lib/data'

// Time-of-day greeting. Rendered client-side so the hour is the reader's,
// not the server's; suppressHydrationWarning absorbs the SSR difference.
export default function Greeting() {
  const hour = new Date().getHours()
  const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <h1
      suppressHydrationWarning
      className="font-serif text-[36px] font-medium leading-[1.15] tracking-tight"
    >
      {salutation},
      <br />
      {userName}.
    </h1>
  )
}
