'use client'

import { useCallback, useEffect, useState } from 'react'

// OG — the cold-draft test bench. Two sheets on one machine: seat a
// company by NAME or by URL, and the row runs the desk's real cold
// pipeline (research → founder-email skill → straight-through checks).
// Columns are the checks themselves; tap a row for the full evidence.

type OgTab = 'name' | 'url'
type StpResult = { id: string; label: string; pass: boolean; detail: string }
type Column = { id: string; label: string }
type Row = {
  id: string
  input: string
  status: string
  company: string | null
  founderName: string | null
  provider: string | null
  research: {
    provider: string
    brief: string
    readerView: string
    citations: { title?: string; url: string }[]
    guessedEmail: string | null
    websiteUrl: string | null
  } | null
  draft: { subject: string; body: string } | null
  stp: StpResult[]
  error: string | null
}
type Sheet = { live: boolean; columns: Column[]; available: Column[]; rows: Row[] }

const RUNNING_PHRASES = ['researching…', 'drafting…', 'running the checks…']

// Column-width headers for the sheet; the full label rides on the tooltip.
const SHORT_LABELS: Record<string, string> = {
  'founder-name': 'founder',
  'subject-format': 'subject',
  'greeting-format': 'greeting',
  signoff: 'signoff',
  'cold-structure': 'structure',
  'intro-length': 'intro',
  'ask-question': 'ask',
  'banned-phrases': 'phrases',
  punctuation: 'punct',
  'no-minutes': 'minutes',
  'no-placeholders': 'blanks',
  'no-explicit-out': 'no out',
}
const shortLabel = (c: Column) => SHORT_LABELS[c.id] ?? c.label.split(' ')[0]

export default function Og() {
  const [tab, setTab] = useState<OgTab>('name')
  return (
    <>
      <div className="mt-5 flex gap-2">
        {(
          [
            ['name', 'By Company Name'],
            ['url', 'By Company URL'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={
              'border px-4 py-1.5 font-sans text-[10px] font-medium uppercase tracking-[0.14em] transition-colors duration-300 ease-editorial ' +
              (tab === id
                ? 'border-ink bg-ink text-paper'
                : 'border-hairline text-faint hover:border-ink hover:text-ink')
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rule-masthead mt-6" />

      {/* Keyed by tab: switching sheets remounts — fresh fetch, no state
          bleeding between the name and URL trials. */}
      <OgSheet key={tab} tab={tab} />
    </>
  )
}

function OgSheet({ tab }: { tab: OgTab }) {
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [input, setInput] = useState('')
  const [note, setNote] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [phrase, setPhrase] = useState(0)

  const load = useCallback(async () => {
    const res = await fetch(`/api/og?tab=${tab}`).then((r) => r.json()).catch(() => null)
    if (res) setSheet(res)
  }, [tab])

  useEffect(() => {
    load()
    const t = setInterval(load, 5000)
    const p = setInterval(() => setPhrase((n) => n + 1), 2400)
    return () => {
      clearInterval(t)
      clearInterval(p)
    }
  }, [load])

  const flash = (msg: string) => {
    setNote(msg)
    setTimeout(() => setNote(''), 4000)
  }

  const seat = async () => {
    const value = input.trim()
    if (!value) return
    setInput('')
    const res = await fetch('/api/og', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ run: { tab, input: value } }),
    }).then((r) => r.json())
    if (res.error) flash(res.error)
    load()
  }

  const strike = async (id: string) => {
    await fetch('/api/og', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ strike: id }),
    })
    if (open === id) setOpen(null)
    load()
  }

  const saveColumns = async (ids: string[]) => {
    await fetch('/api/og', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ columns: ids }),
    })
    load()
  }

  if (!sheet) return <p className="dek mt-6">Dealing the sheet…</p>

  const check = (row: Row, id: string): StpResult | undefined => row.stp.find((s) => s.id === id)

  return (
    <div className="mt-6">
      {note && <p className="dek mb-3">{note}</p>}
      {!sheet.live && (
        <p className="dek mb-4">
          The OG sheet runs on the live desk — no database is configured here, so trials cannot be
          seated. Deploy or point DATABASE_URL at the desk to run them.
        </p>
      )}

      {/* The seat: one input, whichever shape this sheet takes. */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && seat()}
          placeholder={tab === 'name' ? 'Company name — e.g. Bluerails' : 'Company URL — e.g. bluerails.com'}
          className="w-72 border border-hairline bg-transparent px-3 py-1.5 font-sans text-[13px] outline-none placeholder:text-faint focus:border-ink"
        />
        <button
          onClick={seat}
          className="border border-ink bg-ink px-4 py-1.5 font-sans text-[10px] font-medium uppercase tracking-[0.14em] text-paper"
        >
          Seat &amp; Run
        </button>
        <button
          onClick={() => setEditing((v) => !v)}
          className="ml-auto border border-hairline px-3 py-1.5 font-sans text-[10px] font-medium uppercase tracking-[0.14em] text-faint hover:border-ink hover:text-ink"
        >
          {editing ? 'Done' : 'Columns'}
        </button>
      </div>

      {/* The column editor: every column is one straight-through check. */}
      {editing && (
        <div className="mt-4 border border-hairline p-3">
          <p className="eyebrow mb-2">Columns — each one is a check from the straight-through registry</p>
          <div className="flex flex-wrap gap-1.5">
            {sheet.columns.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5 border border-hairline px-2 py-0.5 font-sans text-[11px]">
                {c.label}
                <button
                  onClick={() => saveColumns(sheet.columns.filter((x) => x.id !== c.id).map((x) => x.id))}
                  className="text-faint hover:text-ink"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          {sheet.available.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sheet.available.map((c) => (
                <button
                  key={c.id}
                  onClick={() => saveColumns([...sheet.columns.map((x) => x.id), c.id])}
                  className="border border-dashed border-hairline px-2 py-0.5 font-sans text-[11px] text-faint hover:border-ink hover:text-ink"
                >
                  + {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* The sheet. */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-ink text-left">
              <th className="py-2 pr-3 font-sans text-[10px] font-medium uppercase tracking-[0.14em]">
                {tab === 'name' ? 'Company' : 'URL'}
              </th>
              <th className="py-2 pr-3 font-sans text-[10px] font-medium uppercase tracking-[0.14em]">Founder</th>
              {sheet.columns.map((c) => (
                <th
                  key={c.id}
                  title={c.label}
                  className="px-1 py-2 text-center font-sans text-[9px] font-medium uppercase tracking-[0.08em] text-faint"
                >
                  {shortLabel(c)}
                </th>
              ))}
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {sheet.rows.length === 0 && (
              <tr>
                <td colSpan={sheet.columns.length + 3} className="dek py-6">
                  No trials yet — seat a {tab === 'name' ? 'company' : 'URL'} above.
                </td>
              </tr>
            )}
            {sheet.rows.map((row) => (
              <RowLine
                key={row.id}
                row={row}
                columns={sheet.columns}
                open={open === row.id}
                phrase={RUNNING_PHRASES[phrase % RUNNING_PHRASES.length]}
                onToggle={() => setOpen(open === row.id ? null : row.id)}
                onStrike={() => strike(row.id)}
                check={check}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RowLine({
  row,
  columns,
  open,
  phrase,
  onToggle,
  onStrike,
  check,
}: {
  row: Row
  columns: Column[]
  open: boolean
  phrase: string
  onToggle: () => void
  onStrike: () => void
  check: (row: Row, id: string) => StpResult | undefined
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-hairline transition-colors duration-300 ease-editorial hover:bg-black/[0.02]"
      >
        <td className="max-w-48 truncate py-2.5 pr-3 font-serif text-[15px]" title={row.input}>
          {row.input}
        </td>
        <td className="py-2.5 pr-3 font-sans text-[12px] text-stone">
          {row.status === 'running' ? (
            <span className="text-faint">{phrase}</span>
          ) : row.status === 'failed' ? (
            <span className="text-faint">failed</span>
          ) : (
            row.founderName ?? '—'
          )}
        </td>
        {columns.map((c) => {
          const r = check(row, c.id)
          return (
            <td key={c.id} className="px-1 py-2.5 text-center font-sans text-[13px]" title={r?.detail ?? c.label}>
              {row.status !== 'done' ? (
                <span className="text-faint">·</span>
              ) : !r ? (
                <span className="text-faint">—</span>
              ) : r.pass ? (
                <span>✓</span>
              ) : (
                <span className="font-semibold">✗</span>
              )}
            </td>
          )
        })}
        <td className="py-2.5 text-right">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onStrike()
            }}
            className="font-sans text-[11px] text-faint hover:text-ink"
          >
            strike
          </button>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-hairline">
          <td colSpan={columns.length + 3} className="py-4">
            <Evidence row={row} />
          </td>
        </tr>
      )}
    </>
  )
}

// The evidence: everything the row produced, laid bare for diagnosis —
// the draft as returned, every check's verdict in plain English, and the
// raw research JSON the draft was grounded in.
function Evidence({ row }: { row: Row }) {
  if (row.error) {
    return <p className="dek">The trial failed: {row.error}</p>
  }
  if (row.status !== 'done') {
    return <p className="dek">Still running…</p>
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <p className="eyebrow mb-1">The draft{row.provider ? ` · researched by ${row.provider}` : ''}</p>
        {row.draft?.subject && (
          <p className="font-sans text-[12px] font-medium">Subject: {row.draft.subject}</p>
        )}
        <pre className="mt-1 whitespace-pre-wrap border border-hairline p-3 font-sans text-[12px] leading-relaxed">
          {row.draft?.body ?? '(no draft)'}
        </pre>
        <p className="eyebrow mb-1 mt-4">The checks</p>
        <ul className="space-y-1">
          {row.stp.map((s) => (
            <li key={s.id} className="font-sans text-[12px]">
              <span className="font-semibold">{s.pass ? '✓' : '✗'}</span> <span className="font-medium">{s.label}</span>
              <span className="text-stone"> — {s.detail}</span>
            </li>
          ))}
          {row.stp.length === 0 && <li className="dek">No checks applied.</li>}
        </ul>
      </div>
      <div>
        <p className="eyebrow mb-1">The raw evidence (research → draft → checks)</p>
        <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap border border-hairline p-3 font-mono text-[11px] leading-relaxed">
          {JSON.stringify({ research: row.research, draft: row.draft, stp: row.stp }, null, 2)}
        </pre>
      </div>
    </div>
  )
}
