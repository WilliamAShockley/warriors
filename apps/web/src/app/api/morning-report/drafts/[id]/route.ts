import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Edit a pending draft's fields, or change its status (e.g. dismiss).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()

    const data: Record<string, unknown> = {}
    if (typeof body.emailTo === 'string') data.emailTo = body.emailTo.trim()
    if (typeof body.emailSubject === 'string') data.emailSubject = body.emailSubject
    if (typeof body.emailBody === 'string') data.emailBody = body.emailBody
    if (typeof body.eventTitle === 'string') data.eventTitle = body.eventTitle
    if (typeof body.eventStart === 'string') data.eventStart = new Date(body.eventStart)
    if (typeof body.eventEnd === 'string') data.eventEnd = new Date(body.eventEnd)
    if (Array.isArray(body.eventAttendees)) data.eventAttendees = JSON.stringify(body.eventAttendees)
    if (typeof body.eventLocation === 'string') data.eventLocation = body.eventLocation
    if (typeof body.eventDescription === 'string') data.eventDescription = body.eventDescription
    if (body.status === 'dismissed' || body.status === 'pending') data.status = body.status

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Don't allow editing an already-executed draft.
    const existing = await db.actionDraft.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (existing.status === 'executed') {
      return NextResponse.json({ error: 'Draft already executed' }, { status: 409 })
    }

    const draft = await db.actionDraft.update({ where: { id }, data })
    return NextResponse.json(draft)
  } catch (error: any) {
    console.error('Failed to update draft:', error)
    return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 500 })
  }
}
