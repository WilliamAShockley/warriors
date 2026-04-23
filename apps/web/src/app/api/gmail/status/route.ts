import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const token = await db.gmailToken.findUnique({ where: { id: 'singleton' } })
  if (!token) return NextResponse.json({ connected: false })
  return NextResponse.json({ connected: true, email: token.email })
}

export async function DELETE() {
  await db.gmailToken.deleteMany()
  return NextResponse.json({ ok: true })
}
