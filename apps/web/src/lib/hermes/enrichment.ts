// Hermes Enrichment Orchestrator
//
// Runs the 7-step enrichment pipeline for a target:
//   1. Load target record from DB
//   2. Funding data lookup (via Parallel Web)
//   3. Website scrape (via Parallel Web)
//   4. Email lookup (via Parallel Web)
//   5. Twitter enrichment (via Parallel Web)
//   6. Text blob synthesis (Claude Haiku)
//   7. Write enriched record to DB
//
// Each step is independent — if one fails, continue with the others.

import { db } from '@/lib/db'
import type { StepEvent } from './types'
import type { EnrichmentResult } from './enrichment-types'
import { enrichFunding } from './enrichment/funding'
import { enrichWebsite } from './enrichment/website'
import { enrichTwitter } from './enrichment/twitter'
import { lookupEmail } from './enrichment/email'
import { synthesizeTextBlob } from './enrichment/synthesize'

const BLOCK = 'enrichment'

function makeStep(
  step: number,
  name: string,
  status: StepEvent['status'],
  durationMs: number,
  extra?: Partial<Pick<StepEvent, 'input' | 'output' | 'error'>>,
): StepEvent {
  return { block: BLOCK, step, name, status, durationMs, ...extra }
}

export async function runEnrichment(
  targetId: string,
  emit: (event: StepEvent) => void,
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {}

  // --- Step 1: Load target from DB ---
  const stepStart1 = Date.now()
  emit(makeStep(1, 'Load target record', 'running', 0))

  const target = await db.target.findUnique({
    where: { id: targetId },
    include: {
      persons: true,
      fundingRounds: true,
      outreachBrief: true,
    },
  })

  if (!target) {
    emit(makeStep(1, 'Load target record', 'error', Date.now() - stepStart1, {
      error: `Target ${targetId} not found`,
    }))
    return result
  }

  emit(makeStep(1, 'Load target record', 'success', Date.now() - stepStart1, {
    output: { company: target.company, founderName: target.founderName, websiteUrl: target.websiteUrl },
  }))

  // --- Step 2: Funding data lookup ---
  const stepStart2 = Date.now()
  emit(makeStep(2, 'Funding data lookup', 'running', 0, {
    input: { company: target.company },
  }))

  try {
    const fundingRounds = await enrichFunding(target.company, target.websiteUrl ?? undefined)
    result.fundingRounds = fundingRounds
    emit(makeStep(2, 'Funding data lookup', 'success', Date.now() - stepStart2, {
      output: { roundsFound: fundingRounds.length },
    }))
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[hermes/enrichment] Step 2 (funding) failed:`, err)
    emit(makeStep(2, 'Funding data lookup', 'error', Date.now() - stepStart2, {
      error: errMsg,
    }))
  }

  // --- Step 3: Website scrape ---
  const stepStart3 = Date.now()
  emit(makeStep(3, 'Website scrape', 'running', 0, {
    input: { websiteUrl: target.websiteUrl },
  }))

  if (target.websiteUrl) {
    try {
      const websiteContent = await enrichWebsite(target.websiteUrl)
      result.websiteContent = websiteContent
      emit(makeStep(3, 'Website scrape', 'success', Date.now() - stepStart3, {
        output: {
          homepageLength: websiteContent.homepage.length,
          aboutLength: websiteContent.about.length,
        },
      }))
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error(`[hermes/enrichment] Step 3 (website) failed:`, err)
      emit(makeStep(3, 'Website scrape', 'error', Date.now() - stepStart3, {
        error: errMsg,
      }))
    }
  } else {
    emit(makeStep(3, 'Website scrape', 'success', Date.now() - stepStart3, {
      output: { skipped: true, reason: 'No website URL on target' },
    }))
  }

  // --- Step 4: Email lookup ---
  const stepStart4 = Date.now()
  emit(makeStep(4, 'Email lookup', 'running', 0, {
    input: { founderName: target.founderName, websiteUrl: target.websiteUrl },
  }))

  if (target.founderName && target.websiteUrl) {
    try {
      const domain = target.websiteUrl
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0]
      const emailVerified = await lookupEmail(target.founderName, domain)
      result.emailVerified = emailVerified
      emit(makeStep(4, 'Email lookup', 'success', Date.now() - stepStart4, {
        output: { email: emailVerified ?? 'not found' },
      }))
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error(`[hermes/enrichment] Step 4 (email) failed:`, err)
      emit(makeStep(4, 'Email lookup', 'error', Date.now() - stepStart4, {
        error: errMsg,
      }))
    }
  } else {
    emit(makeStep(4, 'Email lookup', 'success', Date.now() - stepStart4, {
      output: { skipped: true, reason: 'Missing founder name or website URL' },
    }))
  }

  // --- Step 5: Twitter enrichment ---
  const stepStart5 = Date.now()
  emit(makeStep(5, 'Twitter enrichment', 'running', 0, {
    input: { founderName: target.founderName, company: target.company },
  }))

  if (target.founderName) {
    try {
      const twitterData = await enrichTwitter(target.founderName, target.company)
      if (twitterData.handle) {
        result.founderTwitter = twitterData
      }
      emit(makeStep(5, 'Twitter enrichment', 'success', Date.now() - stepStart5, {
        output: {
          handle: twitterData.handle || 'not found',
          postsFound: twitterData.recentPosts.length,
        },
      }))
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error(`[hermes/enrichment] Step 5 (twitter) failed:`, err)
      emit(makeStep(5, 'Twitter enrichment', 'error', Date.now() - stepStart5, {
        error: errMsg,
      }))
    }
  } else {
    emit(makeStep(5, 'Twitter enrichment', 'success', Date.now() - stepStart5, {
      output: { skipped: true, reason: 'No founder name on target' },
    }))
  }

  // --- Step 6: Text blob synthesis ---
  const stepStart6 = Date.now()
  emit(makeStep(6, 'Text blob synthesis', 'running', 0))

  try {
    const synthesizedBlob = await synthesizeTextBlob({
      companyName: target.company,
      founderName: target.founderName,
      websiteUrl: target.websiteUrl,
      industry: target.industry,
      notes: target.notes,
      stage: target.stage,
      websiteContent: result.websiteContent,
      fundingRounds: result.fundingRounds,
      founderTwitter: result.founderTwitter,
      email: result.emailVerified ?? target.email,
    })
    result.synthesizedBlob = synthesizedBlob
    emit(makeStep(6, 'Text blob synthesis', 'success', Date.now() - stepStart6, {
      output: { blobLength: synthesizedBlob.length, preview: synthesizedBlob.slice(0, 150) },
    }))
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[hermes/enrichment] Step 6 (synthesize) failed:`, err)
    emit(makeStep(6, 'Text blob synthesis', 'error', Date.now() - stepStart6, {
      error: errMsg,
    }))
  }

  // --- Step 7: Write enriched record to DB ---
  const stepStart7 = Date.now()
  emit(makeStep(7, 'Write enriched record', 'running', 0))

  try {
    // Save FundingRound records
    if (result.fundingRounds && result.fundingRounds.length > 0) {
      // Delete existing funding rounds and replace with fresh data
      await db.fundingRound.deleteMany({ where: { targetId } })
      await db.fundingRound.createMany({
        data: result.fundingRounds.map((r) => ({
          targetId,
          amount: r.amount ?? null,
          stage: r.stage ?? null,
          date: r.date ? new Date(r.date) : null,
          leadInvestor: r.leadInvestor ?? null,
          coInvestors: r.coInvestors ? JSON.stringify(r.coInvestors) : null,
          sourceUrl: r.sourceUrl ?? null,
        })),
      })
    }

    // Update Target with synthesizedBlob and email
    const targetUpdate: Record<string, any> = {}
    if (result.synthesizedBlob) {
      targetUpdate.synthesizedBlob = result.synthesizedBlob
    }
    if (result.emailVerified && !target.email) {
      targetUpdate.email = result.emailVerified
    }
    if (Object.keys(targetUpdate).length > 0) {
      await db.target.update({ where: { id: targetId }, data: targetUpdate })
    }

    // Create/update Person record for the founder with Twitter data
    if (target.founderName && result.founderTwitter?.handle) {
      const existingPerson = await db.person.findFirst({
        where: { targetId, name: target.founderName },
      })

      if (existingPerson) {
        await db.person.update({
          where: { id: existingPerson.id },
          data: {
            twitterHandle: result.founderTwitter.handle,
            bio: result.founderTwitter.bio || existingPerson.bio,
            email: result.emailVerified ?? existingPerson.email,
          },
        })
      } else {
        await db.person.create({
          data: {
            targetId,
            name: target.founderName,
            currentRole: 'Founder/CEO',
            currentCompany: target.company,
            twitterHandle: result.founderTwitter.handle,
            bio: result.founderTwitter.bio || null,
            email: result.emailVerified ?? null,
            sourceType: 'linkedin_founder',
          },
        })
      }
    }

    // Log enrichment as an activity
    await db.activity.create({
      data: {
        targetId,
        type: 'enrichment',
        description: `Hermes enrichment completed: ${result.fundingRounds?.length ?? 0} funding rounds, ${result.synthesizedBlob ? 'blob synthesized' : 'no blob'}, ${result.emailVerified ? 'email found' : 'no email'}, ${result.founderTwitter?.handle ? 'twitter found' : 'no twitter'}`,
      },
    })

    emit(makeStep(7, 'Write enriched record', 'success', Date.now() - stepStart7, {
      output: {
        fundingRoundsSaved: result.fundingRounds?.length ?? 0,
        blobSaved: !!result.synthesizedBlob,
        emailSaved: !!result.emailVerified && !target.email,
        twitterSaved: !!result.founderTwitter?.handle,
      },
    }))
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[hermes/enrichment] Step 7 (write) failed:`, err)
    emit(makeStep(7, 'Write enriched record', 'error', Date.now() - stepStart7, {
      error: errMsg,
    }))
  }

  return result
}
