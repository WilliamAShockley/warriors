import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const folders = await db.contentFolder.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { links: true } } },
  })
  return NextResponse.json(folders)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name } = body

  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'Folder name is required' }, { status: 400 })
  }

  const folder = await db.contentFolder.create({
    data: { name: name.trim() },
  })

  return NextResponse.json(folder)
}