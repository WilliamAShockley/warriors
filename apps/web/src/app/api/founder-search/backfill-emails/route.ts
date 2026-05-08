import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

function guessEmail(founderName: string, websiteUrl: string): string | null {
  try {
    const firstName = founderName.split(' ')[0].toLowerCase()
    if (!firstName) return null
    const hostname = websiteUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    return `${firstName}@${hostname}`
  } catch {
    return null
  }
}

export async function POST() {
  const targets = await db.target.findMany({
    where: {
      founderName: { not: null },
      websiteUrl: { not: null },
      OR: [{ email: null }, { email: '' }],
    },
  })

  const updated: { id: string; founderName: string; email: string }[] = []

  for (const t of targets) {
    const email = guessEmail(t.founderName!, t.websiteUrl!)
    if (email) {
      await db.target.update({ where: { id: t.id }, data: { email } })
      updated.push({ id: t.id, founderName: t.founderName!, email })
    }
  }

  return NextResponse.json({ backfilled: updated.length, targets: updated })
}
