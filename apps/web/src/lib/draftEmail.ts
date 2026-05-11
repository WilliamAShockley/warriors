import { db } from './db'

type EmailDraft = {
  id: string
  name: string
  subject: string
  body: string
}

const SETTING_KEY = 'email_drafts'

async function getTemplateDrafts(): Promise<EmailDraft[]> {
  const setting = await db.setting.findUnique({ where: { key: SETTING_KEY } })
  if (!setting) return []
  try {
    return JSON.parse(setting.value) as EmailDraft[]
  } catch {
    return []
  }
}

function replacePlaceholders(text: string, vars: Record<string, string>): string {
  return text
    .replace(/\{\{name\}\}/gi, vars.name ?? '')
    .replace(/\{\{company\}\}/gi, vars.company ?? '')
}

export async function draftColdEmail(targetId: string): Promise<{ subject: string; body: string } | null> {
  const target = await db.target.findUnique({
    where: { id: targetId },
    select: { name: true, company: true, founderName: true, founderFirstName: true, email: true },
  })
  if (!target) return null

  const drafts = await getTemplateDrafts()
  const template = drafts.find((d) => d.name === '001')
  if (!template) return null

  const vars = {
    name: target.founderFirstName ?? target.founderName ?? target.name,
    company: target.company,
  }

  const subject = replacePlaceholders(template.subject, vars)
  const body = replacePlaceholders(template.body, vars)

  await db.target.update({
    where: { id: targetId },
    data: {
      draftEmailSubject: subject,
      draftEmailBody: body,
      draftEmailGeneratedAt: new Date(),
    },
  })

  return { subject, body }
}
