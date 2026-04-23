import { db } from './db'
import { fetchAllEmailsForContact, getAuthedClient } from './gmail'
import { refreshNextStep } from './refreshNextStep'

export async function syncGmailForTarget(targetId: string): Promise<number> {
  // Check Gmail is connected
  const client = await getAuthedClient()
  if (!client) return 0

  const target = await db.target.findUnique({ where: { id: targetId } })
  if (!target) return 0

  const emails = await fetchAllEmailsForContact(
    `${target.name} ${target.company}`,
    target.email
  )
  if (emails.length === 0) return 0

  // Get already-logged gmail message IDs for this target
  const existing = await db.activity.findMany({
    where: { targetId, gmailMessageId: { not: null } },
    select: { gmailMessageId: true },
  })
  const existingIds = new Set(existing.map((a) => a.gmailMessageId))

  // Only log new ones
  const newEmails = emails.filter((e) => !existingIds.has(e.id))
  if (newEmails.length === 0) return 0

  await db.activity.createMany({
    data: newEmails.map((e) => ({
      targetId,
      type: 'email',
      description: `${e.subject} — ${e.snippet.slice(0, 160)}`,
      date: new Date(e.date),
      gmailMessageId: e.id,
    })),
  })

  // Update lastContacted to the most recent email date
  const sorted = newEmails
    .map((e) => new Date(e.date))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())

  if (sorted.length > 0) {
    await db.target.update({
      where: { id: targetId },
      data: { lastContacted: sorted[0] },
    })
  }

  // Regenerate next step after sync
  refreshNextStep(targetId).catch(() => {})

  return newEmails.length
}
