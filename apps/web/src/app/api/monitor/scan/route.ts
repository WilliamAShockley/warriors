import { scanThemeStreaming, ScanStepEvent } from '@/lib/monitorScan'
import { db } from '@/lib/db'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  // Collect theme IDs to scan
  let themeIds: string[] = []
  if (body.themeId) {
    themeIds = [body.themeId]
  } else {
    const themes = await db.monitorTheme.findMany({ where: { enabled: true }, select: { id: true } })
    themeIds = themes.map(t => t.id)
  }

  if (themeIds.length === 0) {
    return new Response(JSON.stringify({ step: 'error', data: { message: 'No themes to scan' } }) + '\n', {
      headers: { 'Content-Type': 'application/x-ndjson' },
    })
  }

  // Stream NDJSON — one JSON line per step event
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: ScanStepEvent & { themeId?: string }) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      }

      for (const tid of themeIds) {
        await scanThemeStreaming(tid, (event) => {
          emit({ ...event, themeId: tid })
        })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked',
    },
  })
}
