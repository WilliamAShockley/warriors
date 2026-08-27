'use client'

import { useCallback, useEffect, useState } from 'react'

// OG — the cold-draft observation bench. Every column is its own small
// workflow: a prompt (row variables fill in at run time) routed to a
// provider. The cells show each workflow's actual output for that row;
// the section beneath the sheet is where the reader edits the prompts
// and the routing, column by column.

type OgTab = 'name' | 'url'
type StpResult = { id: string; label: string; pass: boolean; detail: string }
type Cell = { output?: string; error?: string; provider: string; ms?: number }
type Row = {
  id: string
  input: string
  status: string
  company: string | null
  cells: Record<string, Cell>
  subject: string | null
  body: string | null
  stp: StpResult[]
  error: string | null
}
type ColumnDef = { key: string; label: string; stage: 1 | 2 }
type Provider = { id: string; label: string }
type Workflow = { prompt: string; provider: string }
type Sheet = {
  live: boolean
  rows: Row[]
  workflows: Record<string, Workflow>
  columns: ColumnDef[]
  providers: Provider[]
  vars: { stage1: string[]; stage2: string[] }
}

const RUNNING_PHRASES = ['running the research columns…', 'drafting the components…', 'assembling…']

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

  // The workflow drafts: local edits, re-seeded from the server on save.
  const [drafts, setDrafts] = useState<Record<string, Workflow> | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/og?tab=${tab}`).then((r) => r.json()).catch(() => null)
    if (res) {
      setSheet(res)
      setDrafts((prev) => prev ?? res.workflows)
    }
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

  const saveWorkflows = async () => {
    if (!drafts) return
    const res = await fetch('/api/og', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workflows: drafts }),
    }).then((r) => r.json())
    flash(res.ok ? 'Workflows saved — the next seated row runs them.' : res.error ?? 'Could not save.')
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
          placeholder={tab === 'name' ? 'Company name — e.g. Bluerails' : 'Company URL — e.g. castle.tech'}
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
            <tr className="border-b border-hairline text-left">
              <th className="w-40 py-1.5 pr-4" />
              <th
                colSpan={sheet.columns.filter((c) => c.stage === 1).length}
                className="py-1.5 pr-4 font-sans text-[9px] font-medium uppercase tracking-[0.2em] text-faint"
              >
                Research Context
              </th>
              <th
                colSpan={sheet.columns.filter((c) => c.stage === 2).length}
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
              {sheet.columns.map((c, i) => (
                <th
                  key={c.key}
                  className={
                    'py-2.5 pr-3 font-sans text-[10px] font-medium uppercase tracking-[0.1em] text-stone' +
                    (c.stage === 2 && sheet.columns[i - 1]?.stage === 1 ? ' border-l border-hairline pl-3' : '')
                  }
                >
                  {c.label}
                </th>
              ))}
              <th className="py-2.5" />
            </tr>
          </thead>
          <tbody>
            {sheet.rows.length === 0 && (
              <tr>
                <td colSpan={sheet.columns.length + 2} className="dek py-6">
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
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* ── The Column Workflows — edit the prompt and the routing ── */}
      <div className="rule mt-10 mb-6" />
      <p className="eyebrow">The Column Workflows</p>
      <p className="dek mt-1">
        Each column is a prompt routed to a provider. Variables fill in from the row at run time —
        research columns get {sheet.vars.stage1.join(' ')}; draft columns also get{' '}
        {sheet.vars.stage2.filter((v) => !sheet.vars.stage1.includes(v)).join(' ')}. &ldquo;Fixed
        text&rdquo; makes no call — the prompt itself, variables filled, is the cell.
      </p>
      {drafts && (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {sheet.columns.map((c) => (
              <div key={c.key} className="border border-hairline p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-sans text-[11px] font-medium uppercase tracking-[0.12em]">{c.label}</p>
                  <select
                    value={drafts[c.key]?.provider ?? 'fixed'}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev!,
                        [c.key]: { ...prev![c.key], provider: e.target.value },
                      }))
                    }
                    className="border border-hairline bg-transparent px-2 py-1 font-sans text-[11px] outline-none focus:border-ink"
                  >
                    {sheet.providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={drafts[c.key]?.prompt ?? ''}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev!,
                      [c.key]: { ...prev![c.key], prompt: e.target.value },
                    }))
                  }
                  rows={c.stage === 2 ? 5 : 4}
                  className="mt-2 w-full border border-hairline bg-transparent p-2 font-mono text-[11px] leading-relaxed outline-none focus:border-ink"
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={saveWorkflows}
              className="border border-ink bg-ink px-4 py-1.5 font-sans text-[10px] font-medium uppercase tracking-[0.14em] text-paper"
            >
              Save the Workflows
            </button>
            <button
              onClick={() => setDrafts(sheet.workflows)}
              className="font-sans text-[11px] text-faint underline decoration-hairline underline-offset-4 hover:text-ink"
            >
              discard edits
            </button>
          </div>
        </>
      )}
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
}: {
  row: Row
  columns: ColumnDef[]
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
        {row.status === 'running' && !Object.keys(row.cells).length ? (
          <td colSpan={columns.length} className="py-3 pr-3 font-sans text-[12px] text-faint">
            {phrase}
          </td>
        ) : row.status === 'failed' ? (
          <td colSpan={columns.length} className="py-3 pr-3 font-sans text-[12px] text-faint">
            failed — {row.error ?? 'unknown'}
          </td>
        ) : (
          columns.map((c, i) => {
            const cell = row.cells[c.key]
            const border = c.stage === 2 && columns[i - 1]?.stage === 1 ? ' border-l border-hairline pl-3' : ''
            return (
              <td
                key={c.key}
                title={cell?.error ?? cell?.output ?? ''}
                className={'py-3 pr-3 font-sans text-[11px] leading-snug' + border}
              >
                {cell?.error ? (
                  <span className="line-clamp-3 text-faint">✗ {cell.error}</span>
                ) : cell?.output ? (
                  <span className="line-clamp-3 text-stone">{cell.output}</span>
                ) : row.status === 'running' ? (
                  <span className="text-faint">·</span>
                ) : (
                  <span className="text-faint">—</span>
                )}
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
          <td colSpan={columns.length + 2} className="py-4">
            <Evidence row={row} />
          </td>
        </tr>
      )}
    </>
  )
}

// The evidence: the assembled email, the straight-through verdicts, and
// every cell's raw output, error, provider, and latency.
function Evidence({ row }: { row: Row }) {
  if (row.status === 'failed') return <p className="dek">The trial failed: {row.error}</p>
  if (row.status !== 'done') return <p className="dek">Still running…</p>
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <p className="eyebrow mb-1">The assembled email</p>
        {row.subject && <p className="font-sans text-[12px] font-medium">Subject: {row.subject}</p>}
        <pre className="mt-1 whitespace-pre-wrap border border-hairline p-3 font-sans text-[12px] leading-relaxed">
          {row.body ?? '(no draft)'}
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
        <p className="eyebrow mb-1">The cells, raw (output · provider · latency · error)</p>
        <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap border border-hairline p-3 font-mono text-[11px] leading-relaxed">
          {JSON.stringify(row.cells, null, 2)}
        </pre>
      </div>
    </div>
  )
}
