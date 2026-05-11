import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { draftColdEmail } from '@/lib/draftEmail'

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const target = await db.target.findUnique({
    where: { id },
    select: { draftEmailSubject: true, draftEmailBody: true, draftEmailGeneratedAt: true },
  })
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (
    target.draftEmailGeneratedAt &&
    Date.now() - target.draftEmailGeneratedAt.getTime() < FIVE_DAYS_MS
  ) {
    return NextResponse.json({
      draft: {
        subject: target.draftEmailSubject,
        body: target.draftEmailBody,
        generatedAt: target.draftEmailGeneratedAt.toISOString(),
      },
    })
  }

  return NextResponse.json({ draft: null })
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await draftColdEmail(id)
  if (!result) {
    return NextResponse.json(
      { error: 'Could not generate draft. Make sure template "001" exists.' },
      { status: 400 },
    )
  }
  return NextResponse.json({
    draft: {
      subject: result.subject,
      body: result.body,
      generatedAt: new Date().toISOString(),
    },
  })
}
