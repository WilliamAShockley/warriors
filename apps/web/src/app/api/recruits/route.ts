import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const recruits = await db.recruit.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        links: { orderBy: { createdAt: 'asc' } },
      },
    })
    return NextResponse.json(recruits)
  } catch (error) {
    console.error('Failed to fetch recruits:', error)
    return NextResponse.json({ error: 'Failed to fetch recruits' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, role, company, email, linkedin, status, notes } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const maxSort = await db.recruit.aggregate({ _max: { sortOrder: true } })

    const recruit = await db.recruit.create({
      data: {
        name: name.trim(),
        role: typeof role === 'string' && role.trim() ? role.trim() : null,
        company: typeof company === 'string' && company.trim() ? company.trim() : null,
        email: typeof email === 'string' && email.trim() ? email.trim() : null,
        linkedin: typeof linkedin === 'string' && linkedin.trim() ? linkedin.trim() : null,
        status: typeof status === 'string' ? status : 'prospect',
        notes: typeof notes === 'string' ? notes : null,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
      include: { links: true },
    })

    return NextResponse.json(recruit, { status: 201 })
  } catch (error) {
    console.error('Failed to create recruit:', error)
    return NextResponse.json({ error: 'Failed to create recruit' }, { status: 500 })
  }
}
