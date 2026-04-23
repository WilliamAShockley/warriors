import { db } from './db'
import { generateNextStep } from './claude'

export async function refreshNextStep(targetId: string): Promise<void> {
  const target = await db.target.findUnique({
    where: { id: targetId },
    include: { activities: { orderBy: { date: 'desc' }, take: 10 } },
  })
  if (!target) return

  const nextStep = await generateNextStep(target)
  if (nextStep) {
    await db.target.update({ where: { id: targetId }, data: { aiNextStep: nextStep } })
  }
}
