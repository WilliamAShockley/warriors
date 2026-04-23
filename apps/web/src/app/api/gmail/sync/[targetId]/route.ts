import { NextResponse } from 'next/server'
import { syncGmailForTarget } from '@/lib/syncGmail'

export async function POST(_req: Request, { params }: { params: Promise<{ targetId: string }> }) {
  const { targetId } = await params
  const count = await syncGmailForTarget(targetId)
  return NextResponse.json({ synced: count })
}
