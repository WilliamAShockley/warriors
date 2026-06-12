import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  try {
    const { linkId } = await params
    await db.projectLink.delete({ where: { id: linkId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete link:', error)
    return NextResponse.json({ error: 'Failed to delete link' }, { status: 500 })
  }
}
