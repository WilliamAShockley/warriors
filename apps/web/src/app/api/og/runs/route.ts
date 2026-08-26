import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: Request) {
  const mode = new URL(req.url).searchParams.get('mode')
  const runs = await db.ogRun.findMany({
    where: mode === 'name' || mode === 'url' ? { mode } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return NextResponse.json({ runs })
}
