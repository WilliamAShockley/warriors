import { NextResponse } from 'next/server'
import { generateMorningReport } from '@/lib/morningReport/generate'

// Daily morning report generation. Wired in vercel.json.
export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const id = await generateMorningReport()
    return NextResponse.json({ ok: true, reportId: id })
  } catch (error: any) {
    console.error('Morning report cron failed:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed' },
      { status: 500 },
    )
  }
}

// Vercel cron issues GET requests; support both.
export async function GET(req: Request) {
  return POST(req)
}
