'use client'

// Time-of-day greeting. The hour is computed client-side so it is the
// reader's clock, not the server's; suppressHydrationWarning absorbs the
// SSR difference. The name arrives from the server (database-backed).
export default function Greeting({ name }: { name: string }) {
  const hour = new Date().getHours()
  const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <h1
      suppressHydrationWarning
      className="font-serif text-[36px] font-medium leading-[1.15] tracking-tight"
    >
      {salutation},
      <br />
      {name}.
    </h1>
  )
}
