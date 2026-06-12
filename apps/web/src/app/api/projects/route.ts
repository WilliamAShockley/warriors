import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const projects = await db.project.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        subtasks: { orderBy: { sortOrder: 'asc' } },
        links: { orderBy: { createdAt: 'asc' } },
      },
    })
    return NextResponse.json(projects)
  } catch (error) {
    console.error('Failed to fetch projects:', error)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, status, notes } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const maxSort = await db.project.aggregate({
      _max: { sortOrder: true },
    })

    const project = await db.project.create({
      data: {
        name: name.trim(),
        status: typeof status === 'string' ? status : 'idea',
        notes: typeof notes === 'string' ? notes : null,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
      include: {
        subtasks: true,
        links: true,
      },
    })

    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    console.error('Failed to create project:', error)
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}
