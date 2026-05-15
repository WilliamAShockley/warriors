// Hermes Outreach — Approval Gate
//
// Manages the draft approval workflow:
// - Save draft to Target fields (draftEmailSubject/Body)
// - Approve: triggers Gmail send via the existing /api/gmail/send route
// - Reject: logs reason for LLM feedback loop

import { db } from '@/lib/db'

/**
 * Save a generated draft email to the target record for human review.
 * Sets the draftEmailGeneratedAt timestamp so the UI knows it's fresh.
 */
export async function saveDraftForApproval(
  targetId: string,
  subject: string,
  body: string,
): Promise<void> {
  await db.target.update({
    where: { id: targetId },
    data: {
      draftEmailSubject: subject,
      draftEmailBody: body,
      draftEmailGeneratedAt: new Date(),
    },
  })

  await db.activity.create({
    data: {
      targetId,
      type: 'draft_generated',
      description: `Hermes generated personalized draft: "${subject}"`,
    },
  })
}

/**
 * Approve a draft and trigger the actual Gmail send.
 * Calls the internal Gmail send API using the target's email + draft.
 */
export async function approveDraft(targetId: string): Promise<void> {
  const target = await db.target.findUnique({
    where: { id: targetId },
    select: {
      email: true,
      draftEmailSubject: true,
      draftEmailBody: true,
    },
  })

  if (!target) {
    throw new Error(`Target ${targetId} not found`)
  }

  if (!target.email) {
    throw new Error(`Target ${targetId} has no email address`)
  }

  if (!target.draftEmailSubject || !target.draftEmailBody) {
    throw new Error(`Target ${targetId} has no draft email to approve`)
  }

  // Call the Gmail send API internally
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5820'
  const res = await fetch(`${baseUrl}/api/gmail/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetId,
      to: target.email,
      subject: target.draftEmailSubject,
      bodyText: target.draftEmailBody,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(`Gmail send failed: ${err.error ?? res.statusText}`)
  }

  // Clear the draft fields after successful send
  await db.target.update({
    where: { id: targetId },
    data: {
      draftEmailSubject: null,
      draftEmailBody: null,
      draftEmailGeneratedAt: null,
    },
  })

  await db.activity.create({
    data: {
      targetId,
      type: 'draft_approved',
      description: `Draft email approved and sent to ${target.email}`,
    },
  })
}

/**
 * Reject a draft and log the reason for future LLM feedback.
 * Does not delete the draft — just logs the rejection so the user
 * can regenerate or manually edit.
 */
export async function rejectDraft(
  targetId: string,
  reason: string,
): Promise<void> {
  await db.activity.create({
    data: {
      targetId,
      type: 'draft_rejected',
      description: `Draft email rejected: ${reason}`,
    },
  })
}
