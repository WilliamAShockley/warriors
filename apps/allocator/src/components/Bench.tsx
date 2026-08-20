'use client'

import { useEffect, useRef, useState } from 'react'

type Trial = {
  id: string
  provider: string
  status: string
  fields: {
    founderFirstName?: string | null
    founderFullName?: string | null
    context?: string | null
    websiteUrl?: string | null
  } | null
  citations: { title?: string; url: string }[]
  latencyMs: number | null
  error: string | null
  ranOn: string | null
}

type Row = {
  id: string
  companyName: string
  founderHint: string | null
  websiteHint: string | null
  contextHint: string | null
  winner: string | null
  notes: string | null
  trials: Record<string, Trial>
}

type Sheet = {
  live: boolean
  providers: { id: string; label: string; keyed: boolean }[]
  rows: Row[]
  tally: Record<string, { wins: number; runs: number; failures: number; avgLatencyMs: number | null }>
}

const RUNNING_PHRASES = [
  'searching…',
  'reading the wire…',
  'asking around…',
  'checking filings…',
  'on the case…',
]

const secs = (ms: number | null) => (ms == null ? '' : `${Math.round(ms / 1000)}s`)

// The Bench: rows are companies, columns are engines, the reader's eye is
// the judge. Tap a cell to read the full brief and crown the winner.
export default function Bench() {
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [note, setNote] = useState('')
  const [picked, setPicked] = useState<{ rowId: string; provider: string } | null>(null)
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState(false)

  const [newName, setNewName] = useState('')
  const [newFounder, setNewFounder] = useState('')
  const [newSite, setNewSite] = useState('')

  const refetch = () =>
    fetch('/api/bench')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setSheet(data)
      })
      .catch(() => {})

  useEffect(() => {
    refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // While any cell is in flight, poll the sheet and spin the phrases.
  const inFlight =
    sheet?.rows.some((r) =>
      Object.values(r.trials).some((t) => t.status === 'queued' || t.status === 'running')
    ) ?? false
  useEffect(() => {
    if (!inFlight) return
    const spinner = setInterval(() => setTick((t) => t + 1), 2200)
    const poll = setInterval(refetch, 6000)
    return () => {
      clearInterval(spinner)
      clearInterval(poll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inFlight])

  const post = async (body: Record<string, unknown>): Promise<any> => {
    setNote('')
    try {
      const res = await fetch('/api/bench', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return await res.json()
    } catch {
      setNote('Could not reach the desk.')
      return null
    }
  }

  const seat = async () => {
    // Company or the site URL alone is enough — a URL-only seat derives
    // its name from the domain on the server.
    const companyName = newName.trim() || newSite.trim()
    if (!companyName) return
    setBusy(true)
    const data = await post({
      add: { companyName, founderHint: newFounder.trim(), websiteHint: newSite.trim(), run: true },
    })
    setBusy(false)
    if (data?.ok) {
      setNewName('')
      setNewFounder('')
      setNewSite('')
      refetch()
    } else if (data) {
      setNote(data?.error ?? 'That did not take.')
    }
  }

  const act = async (body: Record<string, unknown>, then?: (data: any) => void) => {
    setBusy(true)
    const data = await post(body)
    setBusy(false)
    if (data) then?.(data)
    refetch()
  }

  if (!sheet) return <p className="dek pt-10 text-center">Dealing the sheet…</p>

  const providers = sheet.providers
  const pickedTrial = picked ? sheet.rows.find((r) => r.id === picked.rowId)?.trials[picked.provider] : null
  const pickedRow = picked ? sheet.rows.find((r) => r.id === picked.rowId) : null

  const cell = (r: Row, pid: string, i: number) => {
    const t = r.trials[pid]
    if (!t) return <span className="text-faint">—</span>
    if (t.status === 'queued' || t.status === 'running')
      return (
        <span className="animate-pulse font-serif text-[13px] italic text-stone">
          {RUNNING_PHRASES[(tick + i) % RUNNING_PHRASES.length]}
        </span>
      )
    if (t.status === 'failed')
      return <span className="font-serif text-[12px] italic leading-snug text-oxblood">{t.error ?? 'failed'}</span>
    const crowned = r.winner === pid
    return (
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="eyebrow text-faint">
            {secs(t.latencyMs)}
            {t.fields?.founderFullName || t.fields?.founderFirstName
              ? ` · ${t.fields.founderFullName ?? t.fields.founderFirstName}`
              : ''}
          </span>
          {/* One click marks this response the row's best; the standings
              and tally roll it up. Clicking again unmarks. */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              act({ verdict: { rowId: r.id, winner: crowned ? null : pid } })
            }}
            disabled={busy}
            title={crowned ? 'Unmark as the best response' : 'Mark this response the best of the row'}
            className={
              'eyebrow shrink-0 disabled:opacity-40 ' +
              (crowned ? 'text-oxblood' : 'text-faint hover:text-ink')
            }
          >
            {crowned ? '★ best' : '☆ best'}
          </button>
        </div>
        <div className="mt-1 line-clamp-4 font-serif text-[13px] leading-snug text-ink">
          {t.fields?.context ?? ''}
        </div>
      </div>
    )
  }

  const field =
    'w-full border-b border-hairline bg-transparent pb-1.5 font-serif text-[15px] text-ink placeholder:italic placeholder:text-faint focus:border-ink focus:outline-none'

  return (
    <>
      {/* Seat a company */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          seat()
        }}
        className="mt-7 border border-hairline p-4 focus-within:border-ink"
      >
        <div className="flex gap-4">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Company — or just paste the site URL"
            className={field}
          />
          <input
            value={newFounder}
            onChange={(e) => setNewFounder(e.target.value)}
            placeholder="Founder (anchors identity)"
            className={field}
          />
        </div>
        <input
          value={newSite}
          onChange={(e) => setNewSite(e.target.value)}
          placeholder="https:// site — same anchor every engine gets"
          className={field + ' mt-3'}
        />
        <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2.5">
          <span className="eyebrow text-faint">Seats the row and sends all four engines at once</span>
          <button
            type="submit"
            disabled={(!newName.trim() && !newSite.trim()) || busy}
            className="eyebrow-ink underline decoration-hairline underline-offset-4 disabled:opacity-40"
          >
            Seat It &amp; Run
          </button>
        </div>
      </form>

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={() =>
            act({ importRegister: true }, (d) =>
              setNote(d?.added ? `${d.added} pulled from the Register.` : 'Nothing new to pull — the Register is already seated.')
            )
          }
          disabled={busy}
          className="eyebrow text-faint underline decoration-hairline underline-offset-4 disabled:opacity-40"
        >
          Pull the Register On
        </button>
        <button
          onClick={() =>
            act({ runAll: true }, (d) =>
              setNote(
                d?.rowsLeft > 0
                  ? `${d.rowsRun} rows running — ${d.rowsLeft} more wait their turn; run the sheet again when these land.`
                  : d?.rowsRun
                    ? `${d.rowsRun} rows running.`
                    : 'Nothing idle to run.'
              )
            )
          }
          disabled={busy}
          className="eyebrow-ink underline decoration-hairline underline-offset-4 disabled:opacity-40"
        >
          Run the Sheet
        </button>
      </div>

      {note && <p className="dek mt-3 text-[13px] text-oxblood">{note}</p>}

      {!sheet.live && (
        <p className="dek pt-10 text-center">The mocked edition keeps no Bench — connect the backend.</p>
      )}

      {sheet.live && sheet.rows.length === 0 && (
        <p className="dek pt-10 text-center">
          An empty sheet. Seat a company above, or pull the Register on and run it.
        </p>
      )}

      {/* The standings: every crowned cell rolls up here, cumulatively. */}
      {sheet.rows.some((r) => r.winner) && (
        <div className="mt-6 border border-hairline px-4 py-3">
          {(() => {
            const judged = sheet.rows.filter((r) => r.winner).length
            const order = [...providers].sort(
              (a, b) => (sheet.tally[b.id]?.wins ?? 0) - (sheet.tally[a.id]?.wins ?? 0)
            )
            const leader = order[0]
            return (
              <>
                <p className="eyebrow text-faint">
                  The Standings · {judged} {judged === 1 ? 'row' : 'rows'} judged
                </p>
                <p className="mt-1.5 font-serif text-[15px] leading-snug">
                  {order.map((p, idx) => (
                    <span key={p.id}>
                      {idx > 0 && <span className="text-faint"> · </span>}
                      <span className={idx === 0 ? 'font-medium text-oxblood' : 'text-stone'}>
                        {p.label} {sheet.tally[p.id]?.wins ?? 0}
                      </span>
                    </span>
                  ))}
                  {(sheet.tally[leader.id]?.wins ?? 0) > 0 && (
                    <span className="text-faint"> — {leader.label} leads</span>
                  )}
                </p>
              </>
            )
          })()}
        </div>
      )}

      {sheet.rows.length > 0 && (
        // Desktop: the sheet breaks out of the reading column to run
        // edge-to-edge, half an inch off each browser border. Mobile keeps
        // the in-column horizontal scroll.
        <div className="mt-6 overflow-x-auto md:w-[calc(100vw-96px)] md:ml-[calc(50%-50vw+48px)]">
          <table className="w-full min-w-[920px] border-collapse md:table-fixed">
            {/* Fixed proportions on desktop: the four engine columns hold
                equal, stable widths however long their entries run. */}
            <colgroup>
              <col className="md:w-[13%]" />
              {providers.map((p) => (
                <col key={p.id} className="md:w-[19%]" />
              ))}
              <col className="md:w-[6%]" />
              <col className="md:w-[5%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-ink/60">
                <th className="py-2 pr-3 text-left align-bottom">
                  <span className="eyebrow">Company</span>
                </th>
                {providers.map((p) => (
                  <th key={p.id} className="px-3 py-2 text-left align-bottom">
                    <span className="eyebrow">{p.label}</span>
                    {!p.keyed && <span className="eyebrow block text-oxblood">no key filed</span>}
                  </th>
                ))}
                <th className="py-2 pl-3 text-right align-bottom">
                  <span className="eyebrow">Verdict</span>
                </th>
                <th className="py-2 pl-3 text-right align-bottom">
                  <span className="eyebrow">Retry</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((r, i) => (
                <tr key={r.id} className="border-b border-hairline align-top">
                  <td className="py-3 pr-3">
                    <p className="font-serif text-[15px] font-medium leading-snug">{r.companyName}</p>
                    {r.founderHint && <p className="eyebrow mt-1 text-faint">{r.founderHint}</p>}
                    <div className="mt-2 flex gap-3">
                      <button
                        onClick={() => act({ run: r.id })}
                        disabled={busy}
                        title="Send all four engines at this row"
                        className="eyebrow text-faint underline decoration-hairline underline-offset-4 disabled:opacity-40"
                      >
                        Run
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm('Strike this row and its trials from the Bench?')) act({ remove: r.id })
                        }}
                        disabled={busy}
                        className="eyebrow text-faint underline decoration-hairline underline-offset-4 hover:text-oxblood disabled:opacity-40"
                      >
                        Strike
                      </button>
                    </div>
                  </td>
                  {providers.map((p) => (
                    <td
                      key={p.id}
                      onClick={() => setPicked({ rowId: r.id, provider: p.id })}
                      className={
                        'cursor-pointer px-3 py-3 transition-colors ' +
                        (picked?.rowId === r.id && picked?.provider === p.id
                          ? 'bg-ink/5'
                          : r.winner === p.id
                            ? 'bg-oxblood/5'
                            : '')
                      }
                    >
                      {cell(r, p.id, i)}
                    </td>
                  ))}
                  <td className="py-3 pl-3 text-right">
                    {r.winner ? (
                      <span className="eyebrow text-oxblood">
                        {providers.find((p) => p.id === r.winner)?.label ?? r.winner}
                      </span>
                    ) : (
                      <span className="eyebrow text-faint">open</span>
                    )}
                  </td>
                  <td className="py-3 pl-3 text-right">
                    {Object.values(r.trials).some((t) => t.status === 'failed') ? (
                      <button
                        onClick={() => act({ retry: r.id })}
                        disabled={busy}
                        title="Send the failed engines back out — successful cells stand"
                        className="eyebrow text-oxblood underline decoration-hairline underline-offset-4 disabled:opacity-40"
                      >
                        Retry
                      </button>
                    ) : (
                      <span className="eyebrow text-faint">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="py-3 pr-3">
                  <span className="eyebrow text-faint">The tally</span>
                </td>
                {providers.map((p) => {
                  const t = sheet.tally[p.id]
                  return (
                    <td key={p.id} className="px-3 py-3">
                      <span className="eyebrow block">
                        {t?.wins ?? 0} {t?.wins === 1 ? 'win' : 'wins'}
                      </span>
                      <span className="eyebrow block text-faint">
                        {t?.runs ? `${t.runs} runs · ${t.failures} failed` : 'no runs yet'}
                        {t?.avgLatencyMs != null ? ` · ~${Math.round(t.avgLatencyMs / 1000)}s` : ''}
                      </span>
                    </td>
                  )
                })}
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* The reading room: the picked cell in full */}
      {picked && pickedRow && (
        <div className="mt-8 border border-hairline p-5">
          <div className="flex items-baseline justify-between gap-4">
            <p className="eyebrow text-oxblood">
              {providers.find((p) => p.id === picked.provider)?.label ?? picked.provider} on {pickedRow.companyName}
            </p>
            <button
              onClick={() => setPicked(null)}
              className="eyebrow text-faint underline decoration-hairline underline-offset-4"
            >
              Close
            </button>
          </div>

          {!pickedTrial && <p className="dek mt-3">This engine has not run against this row yet.</p>}

          {pickedTrial && (pickedTrial.status === 'queued' || pickedTrial.status === 'running') && (
            <p className="mt-3 animate-pulse font-serif text-[14px] italic text-stone">Still in the field…</p>
          )}

          {pickedTrial?.status === 'failed' && (
            <p className="mt-3 font-serif text-[14px] italic leading-relaxed text-oxblood">
              The run failed · {pickedTrial.error ?? 'no reason given'}
            </p>
          )}

          {pickedTrial?.status === 'done' && (
            <>
              <p className="eyebrow mt-3 text-faint">
                {secs(pickedTrial.latencyMs)}
                {pickedTrial.ranOn ? ` · ran ${pickedTrial.ranOn}` : ''}
                {pickedTrial.fields?.founderFullName ? ` · ${pickedTrial.fields.founderFullName}` : ''}
                {pickedTrial.fields?.websiteUrl ? ` · ${pickedTrial.fields.websiteUrl}` : ''}
              </p>
              <p className="mt-3 whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-ink">
                {pickedTrial.fields?.context ?? ''}
              </p>
              {pickedTrial.citations.length > 0 && (
                <div className="mt-4 border-t border-hairline pt-3">
                  <p className="eyebrow text-faint">Sources</p>
                  <ul className="mt-2 space-y-1">
                    {pickedTrial.citations.map((c) => (
                      <li key={c.url} className="truncate">
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-serif text-[13px] italic text-stone underline decoration-hairline underline-offset-4"
                        >
                          {c.title ?? c.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
            <NotesField
              key={pickedRow.id}
              rowId={pickedRow.id}
              initial={pickedRow.notes ?? ''}
              onSave={(notes) => act({ notes: { rowId: pickedRow.id, notes } })}
            />
            <div className="flex shrink-0 gap-5">
              {pickedTrial?.status === 'done' && (
                <button
                  onClick={() => act({ promote: { rowId: pickedRow.id, provider: picked.provider } }, (d) => setNote(d?.ok ? 'Filed to the Register.' : 'The filing did not take.'))}
                  disabled={busy}
                  className="eyebrow text-faint underline decoration-hairline underline-offset-4 disabled:opacity-40"
                >
                  File to the Register
                </button>
              )}
              <button
                onClick={() =>
                  act({
                    verdict: {
                      rowId: pickedRow.id,
                      winner: pickedRow.winner === picked.provider ? null : picked.provider,
                    },
                  })
                }
                disabled={busy}
                className="eyebrow text-oxblood underline decoration-hairline underline-offset-4 disabled:opacity-40"
              >
                {pickedRow.winner === picked.provider ? 'Uncrown' : 'Crown the Winner'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// The row's notes, edited in the reading room; saves on blur.
function NotesField({
  rowId,
  initial,
  onSave,
}: {
  rowId: string
  initial: string
  onSave: (notes: string) => void
}) {
  const [value, setValue] = useState(initial)
  const saved = useRef(initial)
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== saved.current) {
          saved.current = value
          onSave(value)
        }
      }}
      placeholder="Notes on this row…"
      className="mr-4 w-full border-b border-hairline bg-transparent pb-1 font-serif text-[13px] italic text-stone placeholder:text-faint focus:border-ink focus:outline-none"
    />
  )
}
