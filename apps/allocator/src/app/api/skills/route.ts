import { NextResponse } from 'next/server'
import {
  listSkillViews,
  getSkillMeta,
  setSkillPrompt,
  resetSkillPrompt,
  getCustomSkill,
  createCustomSkill,
  deleteCustomSkill,
} from '@/lib/apollo/skills'

export async function GET() {
  const skills = await listSkillViews()
  return NextResponse.json({ live: Boolean(process.env.DATABASE_URL), skills })
}

// The skills desk:
// { create: true, label, whenToUse, prompt }  — author a new skill
// { id, prompt }                              — save a prompt (built-in override or authored)
// { id, reset: true }                         — built-in only: drop the override
// { id, remove: true }                        — authored only: retire the skill
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  if (body?.create === true) {
    const label = String(body?.label ?? '').trim().slice(0, 60)
    const whenToUse = String(body?.whenToUse ?? '').trim().slice(0, 300)
    const prompt = String(body?.prompt ?? '').trim().slice(0, 20_000)
    if (!label || !prompt) {
      return NextResponse.json({ error: 'a name and a prompt are required' }, { status: 400 })
    }
    const skill = await createCustomSkill({ label, whenToUse, systemPrompt: prompt })
    return NextResponse.json({ ok: Boolean(skill), skill })
  }

  const id = String(body?.id ?? '').trim()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const builtIn = getSkillMeta(id)

  if (body?.remove === true) {
    if (builtIn) return NextResponse.json({ error: 'built-in skills cannot be removed' }, { status: 400 })
    const ok = await deleteCustomSkill(id)
    return NextResponse.json({ ok })
  }

  if (body?.reset === true) {
    if (!builtIn) return NextResponse.json({ error: 'only built-in skills have a default' }, { status: 400 })
    const ok = await resetSkillPrompt(id)
    return NextResponse.json({ ok })
  }

  if (!builtIn && !(await getCustomSkill(id))) {
    return NextResponse.json({ error: 'unknown skill' }, { status: 400 })
  }

  const prompt = String(body?.prompt ?? '').trim()
  if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })

  const ok = await setSkillPrompt(id, prompt)
  return NextResponse.json({ ok })
}
