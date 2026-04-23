import { NextResponse } from 'next/server'
import { fetchAndStoreNews } from '@/lib/news'

export async function POST(_req: Request, { params }: { params: Promise<{ targetId: string }> }) {
  const { targetId } = await params
  const count = await fetchAndStoreNews(targetId)
  return NextResponse.json({ fetched: count })
}
