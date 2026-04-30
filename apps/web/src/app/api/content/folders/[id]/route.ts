import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { name } = body

  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'Folder name is required' }, { status: 400 })
  }

  const folder = await db.contentFolder.update({
    where: { id },
    data: { name: name.trim() },
  })

  return NextResponse.json(folder)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Unlink all links in this folder (set folderId to null), then delete folder
  await db.contentLink.updateMany({
    where: { folderId: id },
    data: { folderId: null },
  })

  await db.contentFolder.delete({ where: { id } })

  return NextResponse.json({ success: true })
}