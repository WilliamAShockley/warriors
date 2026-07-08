/**
 * Retry, timeout, and LLM parsing utilities.
 * Copied from apps/web/src/lib/hermes/retry.ts (monorepo rule: copy, don't share).
 */

export interface RetryOptions {
  maxAttempts?: number
  initialDelayMs?: number
  maxDelayMs?: number
  timeoutMs?: number
  onRetry?: (attempt: number, error: Error) => void
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    timeoutMs = 30000,
    onRetry,
  } = opts

  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (isNonRetryable(lastError)) throw lastError
      if (attempt < maxAttempts) {
        const delay = Math.min(
          initialDelayMs * Math.pow(2, attempt - 1) + Math.random() * 500,
          maxDelayMs,
        )
        onRetry?.(attempt, lastError)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }

  throw lastError!
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    promise
      .then((v) => { clearTimeout(timer); resolve(v) })
      .catch((e) => { clearTimeout(timer); reject(e) })
  })
}

function isNonRetryable(error: Error): boolean {
  const msg = error.message.toLowerCase()
  return (
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('api key') ||
    msg.includes('not found') ||
    msg.includes('invalid request')
  )
}

/** Safely extract and parse a JSON object from LLM text output. */
export function parseLLMJsonObject<T = Record<string, any>>(
  text: string,
  fallback: T,
): T {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return fallback
  try {
    return JSON.parse(match[0])
  } catch {
    return fallback
  }
}
