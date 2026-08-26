import { NextResponse } from 'next/server'
import { listRecord, type RecordEntry } from '@/lib/review'

// The Record: every reviewed email, staged vs sent. Plain GET feeds the
// page; ?format=csv or ?format=json returns the same ledger as a download.

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

const CSV_COLUMNS: { header: string; value: (e: RecordEntry) => unknown }[] = [
  { header: 'reviewed_on', value: (e) => e.reviewedOn },
  { header: 'filed_on', value: (e) => e.filedOn },
  { header: 'title', value: (e) => e.title },
  { header: 'status', value: (e) => e.status },
  { header: 'audience', value: (e) => e.audience },
  { header: 'mode', value: (e) => e.mode },
  { header: 'straight_through', value: (e) => e.straightThrough },
  { header: 'amended', value: (e) => e.amended },
  { header: 'staged_to', value: (e) => e.stagedTo },
  { header: 'final_to', value: (e) => e.finalTo },
  { header: 'staged_subject', value: (e) => e.stagedSubject },
  { header: 'final_subject', value: (e) => e.finalSubject },
  { header: 'staged_body', value: (e) => e.stagedBody },
  { header: 'final_body', value: (e) => e.finalBody },
  {
    header: 'checks',
    value: (e) =>
      e.stp?.map((c) => `${c.label}: ${c.pass ? 'pass' : 'FAIL'} — ${c.detail}`).join(' | ') ?? '',
  },
  { header: 'commentary', value: (e) => e.commentary },
  { header: 'reply_status', value: (e) => e.replyStatus },
  { header: 'delivery_status', value: (e) => e.deliveryStatus },
  { header: 'execution_result', value: (e) => e.executionResult },
]

export async function GET(req: Request) {
  const format = new URL(req.url).searchParams.get('format')
  const record = await listRecord()

  if (format === 'csv') {
    const lines = [
      CSV_COLUMNS.map((c) => c.header).join(','),
      ...record.entries.map((e) => CSV_COLUMNS.map((c) => csvCell(c.value(e))).join(',')),
    ]
    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="the-record.csv"',
      },
    })
  }

  if (format === 'json') {
    return new NextResponse(JSON.stringify(record.entries, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="the-record.json"',
      },
    })
  }

  return NextResponse.json(record)
}
