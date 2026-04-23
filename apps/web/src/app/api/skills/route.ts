import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const skills = await db.skill.findMany({ orderBy: { createdAt: 'asc' } })
  return NextResponse.json(skills)
}

export async function POST(req: Request) {
  const body = await req.json()
  const skill = await db.skill.create({
    data: {
      name: body.name,
      description: body.description,
      prompt: body.prompt,
      section: body.section ?? 'targets',
      model: body.model ?? 'claude-opus-4-6',
    },
  })
  return NextResponse.json(skill, { status: 201 })
}
