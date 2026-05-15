import { db } from '@/lib/db'

export async function GET() {
  try {
    const runs = await db.hermesRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 50,
    })
    return Response.json(runs)
  } catch (error) {
    console.error('Failed to load Hermes runs:', error)
    return Response.json([], { status: 200 })
  }
}
