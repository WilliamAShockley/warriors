import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { url, label } = body

    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    const link = await db.recruitLink.create({
      data: {
        recruitId: id,
        url: url.trim(),
        label: typeof label === 'string' && label.trim() ? label.trim() : null,
      },
    })

    return NextResponse.json(link, { status: 201 })
  } catch (error) {
    console.error('Failed to create link:', error)
    return NextResponse.json({ error: 'Failed to create link' }, { status: 500 })
  }
}
