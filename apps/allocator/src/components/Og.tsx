'use client'

import { useCallback, useEffect, useState } from 'react'

// OG — the cold-draft observation bench. Every column is its own small
// workflow: a prompt (row variables fill in at run time) routed to a
// provider. The cells show each workflow's actual output for that row;
// the section beneath the sheet is where the reader edits the prompts
// and the routing, column by column.

type OgTab = 'name' | 'url'
type StpResult = { id: string; label: string; pass: boolean; detail: string }
type Cell = {
  output?: string
  error?: string
  provider: string
  ms?: number
  confidence?: string // Parallel files low | medium | high on its answer
  runId?: string
  request?: unknown
  response?: unknown
}
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
  vars: { stage1: string[]; category: string[]; stage2: string[] }
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

  // The buttons wear their own state — the top-of-sheet note is off-screen
  // from down here, so confirmation lives on and beside the buttons.
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [redraftState, setRedraftState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [workflowNote, setWorkflowNote] = useState('')

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
    if (!drafts || saveState === 'saving') return
    setSaveState('saving')
    setWorkflowNote('')
    const res = await fetch('/api/og', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workflows: drafts }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Could not save.' }))
    if (res.ok) {
      setSaveState('saved')
      setWorkflowNote('Saved — the next seated row runs them.')
      setTimeout(() => setSaveState('idle'), 2500)
    } else {
      setSaveState('idle')
      setWorkflowNote(res.error ?? 'Could not save.')
    }
    load()
  }

  // The redraft: every row on this sheet keeps its web research
  // (description, CEO, product) as filed; Category re-classifies from it,
  // the CEDs rebuild under the saved workflows, the emails reassemble.
  const redraft = async () => {
    if (redraftState === 'sending') return
    setRedraftState('sending')
    setWorkflowNote('')
    const res = await fetch('/api/og', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redraft: { tab } }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Could not redraft.' }))
    if (res.ok) {
      setRedraftState('sent')
      setWorkflowNote(
        'Redrafting under the SAVED workflows — web research stays, Category reclassifies; the rows land one by one.'
      )
      setTimeout(() => setRedraftState('idle'), 2500)
    } else {
      setRedraftState('idle')
      setWorkflowNote(res.error ?? 'Could not redraft.')
    }
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

      {/* ── The Column Workflows — one playful row per column: the name,
             the prompt, the color-coded route. Airtable energy, contained
             deliberately to this section alone. ── */}
      <div className="rule mt-10 mb-6" />
      <p className="eyebrow">The Column Workflows</p>
      <p className="dek mt-1">
        Every column is a prompt routed to a provider. Variables fill in from the row at run time;
        &ldquo;Fixed text&rdquo; makes no call — the prompt itself, variables filled, is the cell.
        An <em>empty</em> Fixed text turns its column off: nothing runs, nothing lands in the email.
      </p>
      {drafts && (
        <div className="mt-5 md:w-[calc(100vw-96px)] md:ml-[calc(50%-50vw+48px)]">
          <div className="space-y-3 font-sans">
            {sheet.columns.map((c) => (
              <WorkflowRow
                key={c.key}
                col={c}
                workflow={drafts[c.key] ?? { prompt: '', provider: 'fixed' }}
                providers={sheet.providers}
                vars={
                  // Category runs after the other research columns, so
                  // their outputs are variables its prompt can use.
                  c.key === 'category'
                    ? sheet.vars.category
                    : c.stage === 1
                      ? sheet.vars.stage1
                      : sheet.vars.stage2
                }
                onChange={(w) => setDrafts((prev) => ({ ...prev!, [c.key]: w }))}
              />
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button
              onClick={saveWorkflows}
              disabled={saveState !== 'idle'}
              className="rounded-full bg-ink px-6 py-2.5 font-sans text-[12px] font-semibold text-paper shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md disabled:translate-y-0 disabled:opacity-80 disabled:shadow-sm"
              style={saveState === 'saved' ? { backgroundColor: '#0F766E', opacity: 1 } : undefined}
            >
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : 'Save the Workflows'}
            </button>
            <button
              onClick={redraft}
              disabled={redraftState !== 'idle'}
              className="rounded-full border border-ink px-6 py-2.5 font-sans text-[12px] font-semibold text-ink transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md disabled:translate-y-0 disabled:opacity-80 disabled:shadow-none"
              style={redraftState === 'sent' ? { borderColor: '#0F766E', color: '#0F766E', opacity: 1 } : undefined}
            >
              {redraftState === 'sending'
                ? 'Sending the redraft…'
                : redraftState === 'sent'
                  ? 'Redraft sent ✓'
                  : 'Redraft the CEDs (this sheet)'}
            </button>
            <button
              onClick={() => setDrafts(sheet.workflows)}
              className="font-sans text-[12px] text-faint underline decoration-hairline underline-offset-4 hover:text-ink"
            >
              discard edits
            </button>
            {workflowNote && <span className="font-sans text-[12px] text-stone">{workflowNote}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── The workflow rows: the one corner of the app allowed to be playful ──

const PROVIDER_STYLE: Record<string, { dot: string; bg: string; text: string }> = {
  parallel: { dot: '#7C5CFC', bg: '#EFEAFE', text: '#4C34C4' },
  exa: { dot: '#0EA5E9', bg: '#E0F2FE', text: '#075985' },
  openai: { dot: '#10B981', bg: '#D1FAE5', text: '#065F46' },
  anthropic: { dot: '#D99000', bg: '#FCF1D5', text: '#8A5B00' },
  claude: { dot: '#D97757', bg: '#FBE9E2', text: '#A8442A' },
  fixed: { dot: '#64748B', bg: '#EEF1F5', text: '#3F4A5A' },
}
const styleFor = (id: string) => PROVIDER_STYLE[id] ?? PROVIDER_STYLE.fixed

const STAGE_CHIP: Record<1 | 2, { label: string; bg: string; text: string }> = {
  1: { label: 'Research', bg: '#CCFBF1', text: '#0F766E' },
  2: { label: 'Draft', bg: '#FCE7F3', text: '#BE185D' },
}

function WorkflowRow({
  col,
  workflow,
  providers,
  vars,
  onChange,
}: {
  col: ColumnDef
  workflow: Workflow
  providers: Provider[]
  vars: string[]
  onChange: (w: Workflow) => void
}) {
  const stage = STAGE_CHIP[col.stage]
  // The off switch: an empty Fixed Text runs to an empty cell and
  // contributes nothing to the email. Wear it plainly on the row.
  const off = workflow.provider === 'fixed' && !workflow.prompt.trim()
  return (
    <div
      className={
        'grid items-start gap-4 rounded-2xl border border-black/5 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md md:grid-cols-[200px_minmax(0,1fr)_230px]' +
        (off ? ' opacity-60' : '')
      }
    >
      {/* Left — the column this workflow feeds. */}
      <div>
        <p className="text-[14px] font-semibold text-ink">{col.label}</p>
        <span
          className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: stage.bg, color: stage.text }}
        >
          {stage.label}
        </span>
        {off && (
          <span className="ml-1.5 mt-1.5 inline-block rounded-full bg-black/[0.07] px-2 py-0.5 text-[10px] font-semibold text-stone">
            Off — contributes nothing
          </span>
        )}
        <div className="mt-2.5 flex flex-wrap gap-1">
          {vars.map((v) => (
            <span key={v} className="rounded-md bg-black/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-stone">
              {v}
            </span>
          ))}
        </div>
      </div>

      {/* Middle — the prompt. */}
      <textarea
        value={workflow.prompt}
        onChange={(e) => onChange({ ...workflow, prompt: e.target.value })}
        rows={4}
        placeholder={
          workflow.provider === 'fixed'
            ? 'Empty = this column is OFF — no call, nothing in the email.'
            : 'Empty falls back to the default prompt on save.'
        }
        className="w-full rounded-xl border border-black/10 bg-[#FCFBF9] p-3 font-mono text-[11.5px] leading-relaxed outline-none transition-colors placeholder:text-faint focus:border-black/30 focus:bg-white"
      />

      {/* Right — the route. */}
      <ProviderSelect
        value={workflow.provider}
        providers={providers}
        onPick={(provider) => onChange({ ...workflow, provider })}
      />
    </div>
  )
}

function ProviderSelect({
  value,
  providers,
  onPick,
}: {
  value: string
  providers: Provider[]
  onPick: (id: string) => void
}) {
  const current = providers.find((p) => p.id === value)
  const s = styleFor(value)
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">Route to</p>
      {/* The colored pill IS the control: a native select rides invisibly
          on top, so picking works everywhere while the pill wears the
          chosen provider's color. */}
      <div
        className="relative flex w-full items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-semibold shadow-sm transition-transform duration-150 hover:-translate-y-0.5"
        style={{ backgroundColor: s.bg, color: s.text }}
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.dot }} />
        <span className="truncate">{current?.label ?? value}</span>
        <span className="ml-auto text-[10px] opacity-60">▾</span>
        <select
          value={value}
          onChange={(e) => onPick(e.target.value)}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
          aria-label="Route to"
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      {/* The palette, at a glance — every route's color. */}
      <div className="mt-2 flex flex-wrap gap-1">
        {providers.map((p) => {
          const ps = styleFor(p.id)
          const active = p.id === value
          return (
            <button
              key={p.id}
              onClick={() => onPick(p.id)}
              title={p.label}
              className="h-3.5 w-3.5 rounded-full transition-transform duration-150 hover:scale-125"
              style={{ backgroundColor: ps.dot, opacity: active ? 1 : 0.35, outline: active ? `2px solid ${ps.dot}` : 'none', outlineOffset: 1 }}
            />
          )
        })}
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
                  <>
                    <span className="line-clamp-3 text-stone">{cell.output}</span>
                    {cell.confidence && <ConfidenceChip level={cell.confidence} />}
                  </>
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

// Parallel rates its own answers; wear the rating on the cell so a
// low-confidence research context is visible before the email is.
const CONFIDENCE_STYLE: Record<string, { bg: string; text: string }> = {
  high: { bg: '#CCFBF1', text: '#0F766E' },
  medium: { bg: '#FEF3C7', text: '#92400E' },
  low: { bg: '#FEE2E2', text: '#991B1B' },
}

function ConfidenceChip({ level }: { level: string }) {
  const s = CONFIDENCE_STYLE[level.toLowerCase()] ?? { bg: '#EEF1F5', text: '#3F4A5A' }
  return (
    <span
      className="mt-1 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {level} confidence
    </span>
  )
}

// The evidence: the assembled email, the straight-through verdicts, and
// every cell's full exchange — the request sent, the response returned,
// the confidence, the provider, the latency, the error.
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
        <p className="eyebrow mb-1">The cells, raw (request · response · confidence · provider · latency)</p>
        <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap border border-hairline p-3 font-mono text-[11px] leading-relaxed">
          {JSON.stringify(row.cells, null, 2)}
        </pre>
      </div>
    </div>
  )
}
