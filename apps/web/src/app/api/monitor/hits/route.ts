import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const themeId = searchParams.get('themeId')

  const hits = await db.monitorHit.findMany({
    where: {
      status: 'pending',
      ...(themeId && { themeId }),
    },
    include: { theme: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(hits)
}
