// Shared Horizon OS types for JSON columns.

import type { DraftParts } from './draft-schema'
import type { DraftCheck } from './draft-checks'

export type SequenceTouch = {
  channel: 'email' | 'linkedin'
  delayDays: number
  template?: string
}

export type PlacementRecord = {
  state: 'sent' | 'placement-failed'
  placedAt?: string
  sentVia?: 'runner' | 'manual' | 'sequencer'
  error?: string
}

export type Draft = {
  touchIndex: number
  channel: 'email' | 'linkedin'
  subject?: string
  body: string
  editedBody?: string
  approved?: boolean
  sentAt?: string
  placement?: PlacementRecord
  /** Structured parts the body was assembled from (drafts made post-structured-output). */
  parts?: DraftParts
  /** Deterministic check results from the drafting stage. */
  checks?: DraftCheck[]
  checksPassed?: boolean
  /** True when the draft needed (and got) an automatic repair pass. */
  repaired?: boolean
}

export type IcpDefinition = {
  criteria?: Record<string, unknown>
  exclusions?: {
    recontactDays?: number
    excludeTags?: string[]
  }
}

export function effectiveBody(d: Draft): string {
  return d.editedBody ?? d.body
}

export function parseSequence(sequence: unknown): SequenceTouch[] {
  if (!Array.isArray(sequence)) return []
  return sequence.filter(
    (t): t is SequenceTouch =>
      !!t && typeof t === 'object' && (t.channel === 'email' || t.channel === 'linkedin')
  )
}

export function parseDrafts(drafts: unknown): Draft[] {
  if (!Array.isArray(drafts)) return []
  return drafts as Draft[]
}
