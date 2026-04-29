import { NextRequest, NextResponse } from 'next/server'
import { db as prisma } from '@/lib/db'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.contentLink.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete content link:', error)
    return NextResponse.json({ error: 'Failed to delete content link' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { title, url, description, tag } = body

    const link = await prisma.contentLink.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(url !== undefined && { url }),
        ...(description !== undefined && { description }),
        ...(tag !== undefined && { tag }),
      },
    })

    return NextResponse.json(link)
  } catch (error) {
    console.error('Failed to update content link:', error)
    return NextResponse.json({ error: 'Failed to update content link' }, { status: 500 })
  }
}