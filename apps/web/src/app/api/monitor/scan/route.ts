import { NextResponse } from 'next/server'
import { scanTheme, scanAllThemes } from '@/lib/monitorScan'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  if (body.themeId) {
    const result = await scanTheme(body.themeId)
    return NextResponse.json(result)
  }

  const results = await scanAllThemes()
  return NextResponse.json({ results })
}
