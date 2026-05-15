// Hermes Ingestion Pipeline — Fingerprint-based Deduplication

import { createHash } from 'crypto'
import { db } from '@/lib/db'
import type { RawSignal } from './types'

/**
 * Generate a deterministic fingerprint for a RawSignal.
 * Hash of (source + name + first 100 chars of description).
 */
export function generateFingerprint(signal: RawSignal): string {
  const normalizedName = signal.name.trim().toLowerCase()
  const descSlice = (signal.description ?? '').trim().toLowerCase().slice(0, 100)
  const input = `${signal.source}|${normalizedName}|${descSlice}`
  return createHash('sha256').update(input).digest('hex')
}

/**
 * Check if a fingerprint already exists in the DB.
 * Checks against:
 *   - MonitorHit.rawData (which stores JSON with fingerprint)
 *   - Target.company name + sourceType match
 *   - Person.name + sourceType match
 */
export async function checkDuplicate(fingerprint: string, signal: RawSignal): Promise<boolean> {
  // Check MonitorHit rawData for fingerprint
  const existingHit = await db.monitorHit.findFirst({
    where: {
      rawData: { contains: fingerprint },
    },
    select: { id: true },
  })
  if (existingHit) return true

  // Check Target by normalized company name + source
  const normalizedName = signal.name.trim().toLowerCase()
  if (signal.entityType === 'company') {
    const existingTarget = await db.target.findFirst({
      where: {
        company: { equals: normalizedName, mode: 'insensitive' },
        sourceType: signal.source,
      },
      select: { id: true },
    })
    if (existingTarget) return true
  }

  // Check Person by name + source
  if (signal.entityType === 'person') {
    const existingPerson = await db.person.findFirst({
      where: {
        name: { equals: normalizedName, mode: 'insensitive' },
        sourceType: signal.source,
      },
      select: { id: true },
    })
    if (existingPerson) return true
  }

  return false
}

/**
 * Batch dedup: filter out signals that already exist.
 * Returns only novel signals plus their fingerprints.
 */
export async function deduplicateSignals(
  signals: RawSignal[],
): Promise<{ signal: RawSignal; fingerprint: string }[]> {
  const results: { signal: RawSignal; fingerprint: string }[] = []

  for (const signal of signals) {
    const fp = generateFingerprint(signal)
    const isDupe = await checkDuplicate(fp, signal)
    if (!isDupe) {
      results.push({ signal, fingerprint: fp })
    }
  }

  return results
}
