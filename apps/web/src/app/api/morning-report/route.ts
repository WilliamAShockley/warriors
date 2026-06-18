import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateMorningReport } from '@/lib/morningReport/generate'

// Latest report with its items + drafts.
export async function GET() {
  const report = await db.morningReport.findFirst({
    orderBy: { date: 'desc' },
    include: {
      items: {
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        include: { draft: true },
      },
    },
  })

  if (!report) return NextResponse.json(null)
  return NextResponse.json(report)
}

// Generate a fresh report now (manual trigger from the UI).
export async function POST() {
  try {
    const id = await generateMorningReport()
    const report = await db.morningReport.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
          include: { draft: true },
        },
      },
    })
    return NextResponse.json(report)
  } catch (error: any) {
    console.error('Morning report generation failed:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to generate report' },
      { status: 500 },
    )
  }
}
