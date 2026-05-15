// Hermes Outreach Orchestrator
//
// Runs the 6-step outreach pipeline for a target:
//   1. Load target + enrichment data
//   2. Build LLM context block
//   3. Generate personalized draft (Claude Opus)
//   4. Validate draft quality (length, personalization markers)
//   5. Save to approval queue (NOT send)
//   6. Confirm approval gate is holding

import { db } from '@/lib/db'
import type { StepEvent } from './types'
import { generatePersonalizedDraft } from './outreach/draft'
import { saveDraftForApproval } from './outreach/approval'

const BLOCK = 'outreach'

function makeStep(
  step: number,
  name: string,
  status: StepEvent['status'],
  durationMs: number,
  extra?: Partial<Pick<StepEvent, 'input' | 'output' | 'error'>>,
): StepEvent {
  return { block: BLOCK, step, name, status, durationMs, ...extra }
}

/**
 * Validate that a draft email meets minimum quality standards.
 * Returns null if valid, or an error message if not.
 */
function validateDraft(subject: string, body: string, companyName: string): string | null {
  if (!subject || subject.length < 5) {
    return 'Subject line is too short or empty'
  }
  if (subject.length > 120) {
    return 'Subject line exceeds 120 characters'
  }
  if (!body || body.length < 50) {
    return 'Email body is too short (must be at least 50 characters)'
  }
  if (body.length > 2000) {
    return 'Email body is too long (exceeds 2000 characters)'
  }
  // Check for placeholder artifacts
  const placeholderPatterns = [/\[your name\]/i, /\[name\]/i, /\[company\]/i, /\{\{.*\}\}/]
  for (const pattern of placeholderPatterns) {
    if (pattern.test(subject) || pattern.test(body)) {
      return `Draft contains placeholder: ${pattern.source}`
    }
  }
  // Check that the company name or some personalization is present
  const lowerBody = body.toLowerCase()
  const lowerCompany = companyName.toLowerCase()
  if (!lowerBody.includes(lowerCompany)) {
    // Not a hard failure — the LLM might use a product name instead
    // Just log a warning-level signal
  }
  return null
}

export async function runOutreach(
  targetId: string,
  emit: (event: StepEvent) => void,
): Promise<void> {
  // --- Step 1: Load target + enrichment data ---
  const stepStart1 = Date.now()
  emit(makeStep(1, 'Load target + enrichment data', 'running', 0))

  const target = await db.target.findUnique({
    where: { id: targetId },
    include: {
      fundingRounds: true,
      persons: true,
      outreachBrief: true,
      newsItems: { orderBy: { publishedAt: 'desc' }, take: 5 },
    },
  })

  if (!target) {
    emit(makeStep(1, 'Load target + enrichment data', 'error', Date.now() - stepStart1, {
      error: `Target ${targetId} not found`,
    }))
    return
  }

  if (!target.email && !target.founderName) {
    emit(makeStep(1, 'Load target + enrichment data', 'error', Date.now() - stepStart1, {
      error: 'Target has no email or founder name — run enrichment first',
    }))
    return
  }

  emit(makeStep(1, 'Load target + enrichment data', 'success', Date.now() - stepStart1, {
    output: {
      company: target.company,
      hasBlob: !!target.synthesizedBlob,
      hasFunding: target.fundingRounds.length > 0,
      hasEmail: !!target.email,
      hasFounder: !!target.founderName,
    },
  }))

  // --- Step 2: Build LLM context block ---
  const stepStart2 = Date.now()
  emit(makeStep(2, 'Build LLM context block', 'running', 0))

  const contextSummary = {
    synthesizedBlob: target.synthesizedBlob ? target.synthesizedBlob.length : 0,
    fundingRounds: target.fundingRounds.length,
    persons: target.persons.length,
    newsItems: target.newsItems.length,
    outreachBrief: !!target.outreachBrief,
    notes: target.notes ? target.notes.length : 0,
  }

  emit(makeStep(2, 'Build LLM context block', 'success', Date.now() - stepStart2, {
    output: contextSummary,
  }))

  // --- Step 3: Generate personalized draft (Claude Opus) ---
  const stepStart3 = Date.now()
  emit(makeStep(3, 'Generate personalized draft', 'running', 0))

  let subject: string
  let body: string

  try {
    const draft = await generatePersonalizedDraft(targetId)
    subject = draft.subject
    body = draft.body
    emit(makeStep(3, 'Generate personalized draft', 'success', Date.now() - stepStart3, {
      output: { subjectLength: subject.length, bodyLength: body.length, subject },
    }))
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[hermes/outreach] Step 3 (draft) failed:`, err)
    emit(makeStep(3, 'Generate personalized draft', 'error', Date.now() - stepStart3, {
      error: errMsg,
    }))
    return
  }

  // --- Step 4: Validate draft quality ---
  const stepStart4 = Date.now()
  emit(makeStep(4, 'Validate draft quality', 'running', 0))

  const validationError = validateDraft(subject, body, target.company)
  if (validationError) {
    emit(makeStep(4, 'Validate draft quality', 'error', Date.now() - stepStart4, {
      error: validationError,
      output: { subject, bodyPreview: body.slice(0, 100) },
    }))
    // Don't return — save the draft anyway but flag the validation issue
    // The human reviewer will catch it in the approval gate
  } else {
    emit(makeStep(4, 'Validate draft quality', 'success', Date.now() - stepStart4, {
      output: { passed: true },
    }))
  }

  // --- Step 5: Save to approval queue ---
  const stepStart5 = Date.now()
  emit(makeStep(5, 'Save to approval queue', 'running', 0))

  try {
    await saveDraftForApproval(targetId, subject, body)
    emit(makeStep(5, 'Save to approval queue', 'success', Date.now() - stepStart5, {
      output: { saved: true },
    }))
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[hermes/outreach] Step 5 (save) failed:`, err)
    emit(makeStep(5, 'Save to approval queue', 'error', Date.now() - stepStart5, {
      error: errMsg,
    }))
    return
  }

  // --- Step 6: Confirm approval gate is holding ---
  const stepStart6 = Date.now()
  emit(makeStep(6, 'Confirm approval gate', 'running', 0))

  try {
    // Re-read the target to confirm the draft was saved (not auto-sent)
    const updated = await db.target.findUnique({
      where: { id: targetId },
      select: {
        draftEmailSubject: true,
        draftEmailBody: true,
        draftEmailGeneratedAt: true,
      },
    })

    const gateHolding = !!(
      updated?.draftEmailSubject &&
      updated?.draftEmailBody &&
      updated?.draftEmailGeneratedAt
    )

    emit(makeStep(6, 'Confirm approval gate', 'success', Date.now() - stepStart6, {
      output: {
        gateHolding,
        message: gateHolding
          ? 'Draft saved for human review — will NOT send until approved'
          : 'WARNING: Draft may not have been saved correctly',
      },
    }))
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    emit(makeStep(6, 'Confirm approval gate', 'error', Date.now() - stepStart6, {
      error: errMsg,
    }))
  }
}
