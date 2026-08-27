import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getScope } from '@/lib/horizon/scope'
import { parseSourcingCsv, importIntoMission } from '@/lib/horizon/sourcing'

export const maxDuration = 300

/** CSV upload / pasted list sourcing for a mission. Body: { csv: string } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { workspaceId } = await getScope()
  const mission = await db.mission.findFirst({ where: { id, workspaceId } })
  if (!mission) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const csv = String(body?.csv ?? '')
  const people = parseSourcingCsv(csv)
  if (people.length === 0) {
    return NextResponse.json({ error: 'no rows parsed — expected columns: name, email, linkedinUrl, company, notes' }, { status: 400 })
  }
  try {
    const result = await importIntoMission(id, people)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
