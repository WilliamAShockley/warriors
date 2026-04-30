import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title
  if (body.url !== undefined) data.url = body.url
  if (body.description !== undefined) data.description = body.description || null
  if (body.tag !== undefined) data.tag = body.tag || null
  if (body.folderId !== undefined) data.folderId = body.folderId || null

  const link = await db.contentLink.update({
    where: { id },
    data,
  })

  return NextResponse.json(link)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await db.contentLink.delete({ where: { id } })
  return NextResponse.json({ success: true })
}