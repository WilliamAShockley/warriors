// Gather every open item across the three To-Do sections into one list.

import { db } from '@/lib/db'

export interface OpenItem {
  sourceType: 'todo' | 'focus_task' | 'project_subtask'
  sourceId: string
  text: string
  context?: string // parent project name, etc.
  createdAt: Date
}

export async function aggregateOpenItems(): Promise<OpenItem[]> {
  const [todos, focusTasks, projects] = await Promise.all([
    db.todo.findMany({ where: { completed: false } }),
    db.focusTask.findMany({ where: { completed: false } }),
    db.project.findMany({
      where: { status: { not: 'launched' } },
      include: { subtasks: { where: { completed: false } } },
    }),
  ])

  const items: OpenItem[] = []

  for (const t of todos) {
    items.push({
      sourceType: 'todo',
      sourceId: t.id,
      text: t.text,
      createdAt: t.createdAt,
    })
  }

  for (const f of focusTasks) {
    items.push({
      sourceType: 'focus_task',
      sourceId: f.id,
      text: f.text,
      context: 'Need to Do (current focus)',
      createdAt: f.createdAt,
    })
  }

  for (const p of projects) {
    for (const s of p.subtasks) {
      items.push({
        sourceType: 'project_subtask',
        sourceId: s.id,
        text: s.text,
        context: `Project: ${p.name}`,
        createdAt: s.createdAt,
      })
    }
  }

  return items
}
