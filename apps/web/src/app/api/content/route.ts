import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET() {
  try {
    const links = await prisma.contentLink.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(links)
  } catch (error) {
    console.error('Failed to fetch content links:', error)
    return NextResponse.json({ error: 'Failed to fetch content links' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, url, description, tag } = body

    if (!title || !url) {
      return NextResponse.json({ error: 'Title and URL are required' }, { status: 400 })
    }

    const link = await prisma.contentLink.create({
      data: {
        title,
        url,
        description: description || null,
        tag: tag || null,
      },
    })

    return NextResponse.json(link)
  } catch (error) {
    console.error('Failed to create content link:', error)
    return NextResponse.json({ error: 'Failed to create content link' }, { status: 500 })
  }
}