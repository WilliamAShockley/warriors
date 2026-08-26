import { NextResponse } from 'next/server'
import { getVoiceProfile, setVoiceProfile } from '@/lib/horizon/drafting'

export async function GET() {
  return NextResponse.json({ voiceProfile: await getVoiceProfile() })
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}))
  const value = String(body?.voiceProfile ?? '')
  if (!value.trim()) return NextResponse.json({ error: 'voiceProfile required' }, { status: 400 })
  await setVoiceProfile(value)
  return NextResponse.json({ ok: true })
}
