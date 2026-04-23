import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET — list starred targets ordered by starRank
export async function GET() {
  const targets = await db.target.findMany({
    where: { starred: true },
    orderBy: [{ starRank: 'asc' }, { createdAt: 'asc' }],
    take: 10,
  })
  return NextResponse.json(targets)
}

// POST — reorder: body = { ids: string[] } in desired order
export async function POST(req: Request) {
  const { ids } = await req.json() as { ids: string[] }
  await Promise.all(
    ids.map((id, i) =>
      db.target.update({ where: { id }, data: { starRank: i } })
    )
  )
  return NextResponse.json({ ok: true })
}
