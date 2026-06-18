import { NextRequest, NextResponse } from 'next/server'
import {
  getAutonomySettings,
  updateAutonomySettings,
  type AutonomyMode,
  type ActionType,
} from '@/lib/autonomy'

export async function GET() {
  return NextResponse.json(await getAutonomySettings())
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const patch: { enabled?: boolean; modes?: Partial<Record<ActionType, AutonomyMode>> } = {}

    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled

    if (body.modes && typeof body.modes === 'object') {
      const modes: Partial<Record<ActionType, AutonomyMode>> = {}
      for (const t of ['email', 'calendar', 'follow_up'] as ActionType[]) {
        const v = body.modes[t]
        if (v === 'auto' || v === 'manual') modes[t] = v
      }
      patch.modes = modes
    }

    const updated = await updateAutonomySettings(patch)
    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('Failed to update autonomy settings:', error)
    return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 500 })
  }
}
