'use client'

import { useCallback, useEffect, useState } from 'react'

// OG — the cold-draft observation bench. Cells are the actual outputs of
// each pipeline step for that row, in order: the research context first
// (Company Description · CEO · Product · Category), then the cold email
// draft in its component parts (CED-Greeting · CED-Fixed-Intro ·
// CED-Var-1/2/3 · CED-Closing · CED-Ask). Read across a row to watch the
// email get built; read down a column to judge one component variable.

type OgTab = 'name' | 'url'
type StpResult = { id: string; label: string; pass: boolean; detail: string }
type Context = { description: string; ceo: string | null; product: string; category: string }
type DraftParts = {
  greeting: string
  fixedIntro: string
  var1: string
  var2: string
  var3: string
  closing: string
  ask: string
  subject: string
  body: string
}
type Row = {
  id: string
  input: string
  status: string
  company: string | null
  context: Context | null
  draft: DraftParts | null
  research: { provider: string; brief: string; readerView: string; citations: { title?: string; url: string }[] } | null
  stp: StpResult[]
  error: string | null
}
type Sheet = { live: boolean; rows: Row[] }

const RUNNING_PHRASES = ['researching…', 'extracting the context…', 'drafting the variables…', 'assembling…']

// The sheet's columns: each pulls one field off the row. Research context
// first, then the CED components, in assembly order.
type Col = { key: string; head: string; group: 'research' | 'ced'; pick: (r: Row) => string | null }
const COLS: Col[] = [
  { key: 'description', head: 'Company Description', group: 'research', pick: (r) => r.context?.description ?? null },
  { key: 'ceo', head: 'CEO', group: 'research', pick: (r) => r.context?.ceo ?? null },
  { key: 'product', head: 'Product', group: 'research', pick: (r) => r.context?.product ?? null },
  { key: 'category', head: 'Category', group: 'research', pick: (r) => r.context?.category ?? null },
  { key: 'greeting', head: 'CED-Greeting', group: 'ced', pick: (r) => r.draft?.greeting ?? null },
  { key: 'fixedIntro', head: 'CED-Fixed-Intro', group: 'ced', pick: (r) => r.draft?.fixedIntro ?? null },
  { key: 'var1', head: 'CED-Var-1', group: 'ced', pick: (r) => r.draft?.var1 ?? null },
  { key: 'var2', head: 'CED-Var-2', group: 'ced', pick: (r) => r.draft?.var2 ?? null },
  { key: 'var3', head: 'CED-Var-3', group: 'ced', pick: (r) => r.draft?.var3 ?? null },
  { key: 'closing', head: 'CED-Closing', group: 'ced', pick: (r) => r.draft?.closing ?? null },
  { key: 'ask', head: 'CED-Ask', group: 'ced', pick: (r) => r.draft?.ask ?? null },
]
const RESEARCH_SPAN = COLS.filter((c) => c.group === 'research').length
const CED_SPAN = COLS.filter((c) => c.group === 'ced').length

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

  if (!sheet) return <p className="dek mt-6">Dealing the sheet…</p>

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
      </div>

      {/* The sheet — full-bleed: the trials deserve the whole broadsheet. */}
      <div className="mt-4 overflow-x-auto md:w-[calc(100vw-96px)] md:ml-[calc(50%-50vw+48px)]">
        <table className="w-full min-w-[1480px] table-fixed">
          <thead>
            {/* The two territories: research first, then the draft. */}
            <tr className="border-b border-hairline text-left">
              <th className="w-40 py-1.5 pr-4" />
              <th
                colSpan={RESEARCH_SPAN}
                className="py-1.5 pr-4 font-sans text-[9px] font-medium uppercase tracking-[0.2em] text-faint"
              >
                Research Context
              </th>
              <th
                colSpan={CED_SPAN}
                className="border-l border-hairline py-1.5 pl-3 font-sans text-[9px] font-medium uppercase tracking-[0.2em] text-faint"
              >
                Cold Email Draft
              </th>
              <th className="w-12 py-1.5" />
            </tr>
            <tr className="border-b border-ink text-left">
              <th className="py-2.5 pr-4 font-sans text-[10px] font-medium uppercase tracking-[0.14em]">
                {tab === 'name' ? 'Company' : 'URL'}
              </th>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  className={
                    'py-2.5 pr-3 font-sans text-[10px] font-medium uppercase tracking-[0.1em] text-stone' +
                    (c.key === 'greeting' ? ' border-l border-hairline pl-3' : '')
                  }
                >
                  {c.head}
                </th>
              ))}
              <th className="py-2.5" />
            </tr>
          </thead>
          <tbody>
            {sheet.rows.length === 0 && (
              <tr>
                <td colSpan={COLS.length + 2} className="dek py-6">
                  No trials yet — seat a {tab === 'name' ? 'company' : 'URL'} above.
                </td>
              </tr>
            )}
            {sheet.rows.map((row) => (
              <RowLine
                key={row.id}
                row={row}
                open={open === row.id}
                phrase={RUNNING_PHRASES[phrase % RUNNING_PHRASES.length]}
                onToggle={() => setOpen(open === row.id ? null : row.id)}
                onStrike={() => strike(row.id)}
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
  open,
  phrase,
  onToggle,
  onStrike,
}: {
  row: Row
  open: boolean
  phrase: string
  onToggle: () => void
  onStrike: () => void
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-hairline align-top transition-colors duration-300 ease-editorial hover:bg-black/[0.02]"
      >
        <td className="truncate py-3 pr-4 font-serif text-[15px]" title={row.input}>
          {row.input}
        </td>
        {row.status !== 'done' ? (
          <td colSpan={COLS.length} className="py-3 pr-3 font-sans text-[12px] text-faint">
            {row.status === 'running' ? phrase : `failed — ${row.error ?? 'unknown'}`}
          </td>
        ) : (
          COLS.map((c) => {
            const value = c.pick(row)
            return (
              <td
                key={c.key}
                title={value ?? ''}
                className={
                  'py-3 pr-3 font-sans text-[11px] leading-snug text-stone' +
                  (c.key === 'greeting' ? ' border-l border-hairline pl-3' : '')
                }
              >
                {value ? <span className="line-clamp-3">{value}</span> : <span className="text-faint">—</span>}
              </td>
            )
          })
        )}
        <td className="py-3 text-right">
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
          <td colSpan={COLS.length + 2} className="py-4">
            <Evidence row={row} />
          </td>
        </tr>
      )}
    </>
  )
}

// The evidence: the assembled email, the straight-through verdicts, and
// the raw JSON of every step — research → context → parts → checks.
function Evidence({ row }: { row: Row }) {
  if (row.error) return <p className="dek">The trial failed: {row.error}</p>
  if (row.status !== 'done') return <p className="dek">Still running…</p>
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <p className="eyebrow mb-1">
          The assembled email{row.research?.provider ? ` · researched by ${row.research.provider}` : ''}
        </p>
        {row.draft?.subject && <p className="font-sans text-[12px] font-medium">Subject: {row.draft.subject}</p>}
        <pre className="mt-1 whitespace-pre-wrap border border-hairline p-3 font-sans text-[12px] leading-relaxed">
          {row.draft?.body ?? '(no draft)'}
        </pre>
        <p className="eyebrow mb-1 mt-4">The straight-through checks</p>
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
        <p className="eyebrow mb-1">The raw evidence (research → context → parts → checks)</p>
        <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap border border-hairline p-3 font-mono text-[11px] leading-relaxed">
          {JSON.stringify({ research: row.research, context: row.context, draft: row.draft, stp: row.stp }, null, 2)}
        </pre>
      </div>
    </div>
  )
}
