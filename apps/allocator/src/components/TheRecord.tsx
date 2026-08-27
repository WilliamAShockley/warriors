'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { redlineDiff, changeKey, type Change } from '@/lib/redline'

// The Record: the reviewed ledger, one entry per signed (or spiked) email.
// Each opens to the full staged-vs-sent redline, the envelope changes, the
// straight-through checks, and the reader's commentary. The same ledger
// downloads as CSV or JSON from the head of the page.

type StpResult = { id: string; label: string; pass: boolean; detail: string }

type Entry = {
  id: string
  title: string
  status: string
  reviewedOn: string
  filedOn: string
  audience: string | null
  mode: string | null
  straightThrough: boolean | null
  amended: boolean
  stagedBody: string | null
  finalBody: string
  stagedTo: string | null
  finalTo: string | null
  stagedSubject: string | null
  finalSubject: string | null
  stp: StpResult[] | null
  commentary: string | null
  grounding: string | null
  replyStatus: string | null
  deliveryStatus: string | null
  executionResult: string | null
}

// The full diff for one entry: body redline plus envelope changes.
function changesFor(e: Entry): Change[] {
  const changes = e.stagedBody ? redlineDiff(e.stagedBody, e.finalBody) : []
  if (e.stagedTo && e.finalTo && e.stagedTo !== e.finalTo)
    changes.push({ kind: 'envelope', label: 'Recipient', a: e.stagedTo, b: e.finalTo })
  if (e.stagedSubject && e.finalSubject && e.stagedSubject !== e.finalSubject)
    changes.push({ kind: 'envelope', label: 'Subject', a: e.stagedSubject, b: e.finalSubject })
  return changes
}

function verdictLine(e: Entry): string {
  if (e.status === 'spiked') return 'spiked'
  if (e.straightThrough) return 'straight through'
  return 'signed, amended'
}

export default function TheRecord() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [live, setLive] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/record')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setEntries(data.entries ?? [])
          setLive(Boolean(data.live))
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const signed = useMemo(() => entries.filter((e) => e.status === 'approved'), [entries])
  const straight = useMemo(() => signed.filter((e) => e.straightThrough).length, [signed])

  if (!loaded) return null

  if (entries.length === 0) {
    return (
      <div className="pt-20 text-center">
        <p className="font-serif text-[19px] font-medium leading-snug tracking-tight">
          The record is empty.
        </p>
        <p className="dek mt-3">
          {live
            ? 'It fills as you review — every signature and every spike files here.'
            : 'Connect the backend and every reviewed email files here.'}
        </p>
        <p className="pt-6">
          <Link href="/review" className="eyebrow-ink underline decoration-hairline underline-offset-4">
            To the tray →
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* The masthead line: the tally on the left, the downloads on the right */}
      <div className="flex items-baseline justify-between pt-6">
        <p className="eyebrow text-faint">
          {signed.length} signed · {straight} straight through
          {entries.length > signed.length ? ` · ${entries.length - signed.length} spiked` : ''}
        </p>
        <p className="eyebrow text-faint">
          Download{' '}
          <a href="/api/record?format=csv" className="eyebrow-ink underline decoration-hairline underline-offset-4">
            CSV
          </a>
          {' · '}
          <a href="/api/record?format=json" className="eyebrow-ink underline decoration-hairline underline-offset-4">
            JSON
          </a>
        </p>
      </div>

      <ul className="mt-4">
        {entries.map((e) => {
          const open = openId === e.id
          const changes = open ? changesFor(e) : []
          return (
            <li key={e.id} className="rule first:border-t-0">
              <button onClick={() => setOpenId(open ? null : e.id)} className="block w-full py-4 text-left">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="min-w-0 truncate font-serif text-[17px] leading-snug text-ink">
                    {e.title}
                  </p>
                  <p
                    className={clsx(
                      'eyebrow shrink-0',
                      e.status === 'spiked'
                        ? 'text-oxblood'
                        : e.straightThrough
                          ? 'text-faint'
                          : 'text-stone'
                    )}
                  >
                    {verdictLine(e)}
                  </p>
                </div>
                <p className="eyebrow mt-1.5 text-faint">
                  {e.reviewedOn || e.filedOn}
                  {e.finalTo ? ` · to ${e.finalTo}` : ''}
                  {e.mode ? ` · ${e.mode.replace('_', '-')}` : ''}
                  {e.replyStatus === 'replied' ? ' · replied' : ''}
                  {e.deliveryStatus === 'undeliverable' ? ' · undeliverable' : ''}
                  {e.stp ? ` · checks ${e.stp.filter((c) => c.pass).length}/${e.stp.length}` : ''}
                  {'  '}
                  {open ? '▴' : '▾'}
                </p>
              </button>

              {open && (
                <div className="pb-6">
                  {/* The envelope, staged vs sent */}
                  <div className="border border-hairline p-4">
                    <p className="eyebrow">
                      To · {e.finalTo ?? '—'}
                      {e.stagedTo && e.finalTo && e.stagedTo !== e.finalTo ? (
                        <span className="text-stone"> (staged: {e.stagedTo})</span>
                      ) : null}
                    </p>
                    <p className="eyebrow mt-1.5">
                      Subject · {e.finalSubject ?? '—'}
                      {e.stagedSubject && e.finalSubject && e.stagedSubject !== e.finalSubject ? (
                        <span className="text-stone"> (staged: {e.stagedSubject})</span>
                      ) : null}
                    </p>
                    <div className="mt-3 space-y-3 border-t border-hairline pt-3">
                      {e.finalBody.split('\n\n').map((para, i) => (
                        <p key={i} className="body-copy whitespace-pre-line">
                          {para}
                        </p>
                      ))}
                    </div>
                  </div>

                  {/* The redline: what changed between staging and signature */}
                  <div className="mt-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="eyebrow text-oxblood">The Redline</p>
                      <p className="eyebrow text-faint">
                        {changes.length === 0
                          ? 'sent exactly as staged'
                          : `${changes.length} change${changes.length === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    {changes.length > 0 && (
                      <ul className="mt-1">
                        {changes.map((c) => (
                          <li key={changeKey(c)} className="rule py-3 first:border-t-0">
                            {c.kind === 'struck' && (
                              <>
                                <p className="eyebrow text-oxblood">Struck</p>
                                <p className="mt-1 font-serif text-[14px] leading-relaxed text-stone line-through decoration-hairline">
                                  {c.a}
                                </p>
                              </>
                            )}
                            {c.kind === 'added' && (
                              <>
                                <p className="eyebrow">Added</p>
                                <p className="mt-1 font-serif text-[14px] leading-relaxed text-ink">{c.b}</p>
                              </>
                            )}
                            {c.kind === 'reworded' && (
                              <>
                                <p className="eyebrow">Reworded</p>
                                <p className="mt-1 font-serif text-[14px] leading-relaxed text-stone line-through decoration-hairline">
                                  {c.a}
                                </p>
                                <p className="mt-1 font-serif text-[14px] leading-relaxed text-ink">{c.b}</p>
                              </>
                            )}
                            {c.kind === 'envelope' && (
                              <>
                                <p className="eyebrow">{c.label}</p>
                                <p className="mt-1 font-serif text-[14px] leading-relaxed">
                                  <span className="text-stone line-through decoration-hairline">{c.a}</span>
                                  <span className="text-faint"> → </span>
                                  <span className="text-ink">{c.b}</span>
                                </p>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* The checks, as they stood at staging */}
                  {e.stp && e.stp.length > 0 && (
                    <div className="mt-5">
                      <p className="eyebrow text-oxblood">The Checks</p>
                      <ul className="mt-1">
                        {e.stp.map((c) => (
                          <li key={c.id} className="rule py-2.5 first:border-t-0">
                            <p className={clsx('eyebrow', c.pass ? 'text-faint' : 'text-oxblood')}>
                              {c.pass ? '✓' : '✗'} {c.label}
                            </p>
                            <p className="mt-1 font-serif text-[13.5px] italic leading-snug text-stone">
                              {c.detail}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {e.commentary && (
                    <div className="mt-5 border-l border-oxblood pl-4">
                      <p className="eyebrow-ink">Notes to the Desk</p>
                      <p className="mt-1.5 font-serif text-[14px] italic leading-relaxed text-stone">
                        {e.commentary}
                      </p>
                    </div>
                  )}

                  {e.executionResult && (
                    <p className="eyebrow mt-5 text-faint">{e.executionResult}</p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <div className="rule mt-1 mb-12" />
    </div>
  )
}
