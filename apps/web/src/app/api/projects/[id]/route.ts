import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()

    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string') data.name = body.name.trim()
    if (typeof body.status === 'string') data.status = body.status
    if (typeof body.notes === 'string') data.notes = body.notes
    if (body.notes === null) data.notes = null
    if (typeof body.sortOrder === 'number') data.sortOrder = body.sortOrder

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const project = await db.project.update({
      where: { id },
      data,
      include: {
        subtasks: { orderBy: { sortOrder: 'asc' } },
        links: { orderBy: { createdAt: 'asc' } },
      },
    })

    return NextResponse.json(project)
  } catch (error) {
    console.error('Failed to update project:', error)
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.project.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete project:', error)
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
  }
}
