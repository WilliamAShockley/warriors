'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function RetireThesis({ slug }: { slug: string }) {
  const router = useRouter()
  const [armed, setArmed] = useState(false)
  const [working, setWorking] = useState(false)

  const retire = async () => {
    if (!armed) {
      setArmed(true)
      return
    }
    setWorking(true)
    try {
      await fetch('/api/theses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retire', slug }),
      })
      router.push('/research')
      router.refresh()
    } catch {
      setWorking(false)
      setArmed(false)
    }
  }

  return (
    <section className="pb-4 pt-10 text-center">
      <button
        onClick={retire}
        disabled={working}
        className="eyebrow text-faint underline decoration-hairline underline-offset-4 transition-colors duration-300 ease-editorial hover:text-oxblood disabled:opacity-40"
      >
        {working ? 'Retiring' : armed ? 'Certain? Tap again to retire it' : 'Retire this thesis'}
      </button>
    </section>
  )
}
