// Hermes — Clusters API
// GET /api/hermes/clusters — returns all clusters for filter dropdowns

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const clusters = await db.cluster.findMany({
      orderBy: { memberCount: 'desc' },
      select: {
        id: true,
        label: true,
        description: true,
        memberCount: true,
      },
    })

    return NextResponse.json(clusters)
  } catch (err: any) {
    console.error('Failed to fetch clusters:', err)
    return NextResponse.json([], { status: 200 })
  }
}
