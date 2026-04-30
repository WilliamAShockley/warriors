import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const folderId = searchParams.get('folderId')

  const where: Record<string, unknown> = {}
  if (folderId === 'unfiled') {
    where.folderId = null
  } else if (folderId) {
    where.folderId = folderId
  }

  const links = await db.contentLink.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { folder: true },
  })
  return NextResponse.json(links)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { title, url, description, tag, folderId } = body

  if (!title || !url) {
    return NextResponse.json({ error: 'Title and URL required' }, { status: 400 })
  }

  const link = await db.contentLink.create({
    data: {
      title,
      url,
      description: description || null,
      tag: tag || null,
      folderId: folderId || null,
    },
  })

  return NextResponse.json(link)
}