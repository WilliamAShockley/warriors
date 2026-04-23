import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { searchEmailsForContact } from '@/lib/gmail'

export async function GET(_req: Request, { params }: { params: Promise<{ targetId: string }> }) {
  const { targetId } = await params
  const target = await db.target.findUnique({ where: { id: targetId } })
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const emails = await searchEmailsForContact(
    `${target.name} ${target.company}`,
    target.email
  )

  return NextResponse.json({ emails })
}
