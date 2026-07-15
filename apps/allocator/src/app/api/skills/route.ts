import { NextResponse } from 'next/server'
import { listSkillViews, getSkillMeta, setSkillPrompt, resetSkillPrompt } from '@/lib/apollo/skills'

export async function GET() {
  const skills = await listSkillViews()
  return NextResponse.json({ live: Boolean(process.env.DATABASE_URL), skills })
}

// Save or reset a skill's system prompt. { id, prompt } saves; { id, reset:true }
// drops the override back to the code default.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const id = String(body?.id ?? '').trim()
  if (!id || !getSkillMeta(id)) {
    return NextResponse.json({ error: 'unknown skill' }, { status: 400 })
  }

  if (body?.reset === true) {
    const ok = await resetSkillPrompt(id)
    return NextResponse.json({ ok })
  }

  const prompt = String(body?.prompt ?? '').trim()
  if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })

  const ok = await setSkillPrompt(id, prompt)
  return NextResponse.json({ ok })
}
