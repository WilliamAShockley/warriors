'use client'

import { useState } from 'react'

export default function DeepDive({ thesisName }: { thesisName: string }) {
  const [state, setState] = useState<'idle' | 'queued'>('idle')

  return (
    <section className="pb-4 pt-9">
      {state === 'idle' ? (
        <button
          onClick={() => setState('queued')}
          className="w-full border border-ink py-3.5 font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-ink transition-colors duration-300 ease-editorial hover:bg-ink hover:text-paper"
        >
          Commission a Deep Dive
        </button>
      ) : (
        <p className="dek text-center">
          Noted. The desk will file a longer briefing on {thesisName.toLowerCase()} to Research.
        </p>
      )}
    </section>
  )
}
