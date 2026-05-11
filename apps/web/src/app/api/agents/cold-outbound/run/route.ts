import { NextResponse } from 'next/server'
import Parallel from 'parallel-web'
import { db } from '@/lib/db'
import { extractFounderName, guessEmail } from '@/lib/founderSearch'
import { draftColdEmail } from '@/lib/draftEmail'

export async function POST(req: Request) {
  const { url, company } = await req.json()
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })

  const normalizedUrl = url.startsWith('http') ? url : `https://${url}`
  const cleanUrl = normalizedUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const hostname = cleanUrl.split('/')[0]
  const raw = company || hostname.replace(/^www\./, '').split('.')[0]
  const derivedCompany = raw.charAt(0).toUpperCase() + raw.slice(1)

  const steps: Record<string, unknown> = {}
  const debug: Record<string, unknown> = {}

  try {
    // Find or create target
    let target = await db.target.findFirst({ where: { websiteUrl: normalizedUrl } })
    if (!target) {
      target = await db.target.create({
        data: {
          name: derivedCompany,
          company: derivedCompany,
          websiteUrl: normalizedUrl,
          stage: 'intro_sent',
        },
      })
    }

    // Step 1: Parallel API call
    const client = new Parallel({ apiKey: process.env.PARALLEL_API_KEY! })
    const requestPayload = {
      input: `Who is the CEO of ${cleanUrl}? If no CEO is listed, who is the founder most likely to be CEO?`,
      processor: 'core-fast' as const,
      task_spec: {
        input_schema: { type: 'text' as const, description: 'The user request to execute.' },
        output_schema: { type: 'text' as const, description: 'Return a helpful final answer in clear markdown that addresses the user request.' },
      },
    }

    const taskRun = await client.taskRun.create(requestPayload)
    const runResult = await client.taskRun.result(taskRun.run_id)
    const out = runResult.output as any
    const content: string = out?.content ?? out?.output ?? JSON.stringify(out)
    const confidence: string = out?.basis?.[0]?.confidence ?? 'unknown'

    steps.parallel = { content, confidence, runId: taskRun.run_id }
    debug.request = requestPayload
    debug.response = runResult

    // Step 2: Haiku extraction
    const founderName = await extractFounderName(content)
    steps.extraction = { founderName }

    // Step 3: Email guess
    let guessedEmail: string | null = null
    if (founderName) {
      guessedEmail = guessEmail(founderName, normalizedUrl)
    }
    steps.email = { guessed: guessedEmail }

    // Step 4: Save founder + email to target
    if (founderName) {
      const nameParts = founderName.trim().split(/\s+/)
      const firstName = nameParts[0]
      const lastName = nameParts.slice(1).join(' ') || null
      const updateData: Record<string, string | null> = { founderName, founderFirstName: firstName, founderLastName: lastName }
      if (guessedEmail && !target.email) updateData.email = guessedEmail
      await db.target.update({ where: { id: target.id }, data: updateData })
      await db.activity.create({
        data: {
          targetId: target.id,
          type: 'founder_identified',
          description: `Cold outbound pipeline: ${founderName}${guessedEmail ? ` (${guessedEmail})` : ''} [${confidence}]`,
        },
      })
    }

    // Step 5: Draft email from template "001"
    const draft = await draftColdEmail(target.id)
    steps.draft = draft ? { subject: draft.subject, body: draft.body } : { subject: null, body: null }

    return NextResponse.json({ targetId: target.id, steps, debug })
  } catch (e) {
    return NextResponse.json({ error: String(e), steps, debug }, { status: 500 })
  }
}
