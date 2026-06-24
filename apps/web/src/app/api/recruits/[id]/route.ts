import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()

    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string') data.name = body.name.trim()
    if (typeof body.role === 'string') data.role = body.role.trim() || null
    if (body.role === null) data.role = null
    if (typeof body.company === 'string') data.company = body.company.trim() || null
    if (body.company === null) data.company = null
    if (typeof body.email === 'string') data.email = body.email.trim() || null
    if (body.email === null) data.email = null
    if (typeof body.linkedin === 'string') data.linkedin = body.linkedin.trim() || null
    if (body.linkedin === null) data.linkedin = null
    if (typeof body.status === 'string') data.status = body.status
    if (typeof body.notes === 'string') data.notes = body.notes
    if (body.notes === null) data.notes = null
    if (typeof body.sortOrder === 'number') data.sortOrder = body.sortOrder

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const recruit = await db.recruit.update({
      where: { id },
      data,
      include: { links: { orderBy: { createdAt: 'asc' } } },
    })

    return NextResponse.json(recruit)
  } catch (error) {
    console.error('Failed to update recruit:', error)
    return NextResponse.json({ error: 'Failed to update recruit' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.recruit.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete recruit:', error)
    return NextResponse.json({ error: 'Failed to delete recruit' }, { status: 500 })
  }
}
