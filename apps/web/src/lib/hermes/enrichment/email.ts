// Hermes Enrichment — Email Lookup via Parallel Web + pattern guessing fallback

import Parallel from 'parallel-web'

/**
 * Attempt to find a verified email address for a founder.
 * First tries Parallel Web search; falls back to pattern-based guessing
 * (same approach as founderSearch.ts guessEmail).
 */
export async function lookupEmail(
  founderName: string,
  domain: string,
): Promise<string | null> {
  // Try Parallel Web lookup first
  const webResult = await lookupViaWeb(founderName, domain)
  if (webResult) return webResult

  // Fall back to pattern guessing
  return guessEmailPattern(founderName, domain)
}

async function lookupViaWeb(founderName: string, domain: string): Promise<string | null> {
  const client = new Parallel({ apiKey: process.env.PARALLEL_API_KEY! })

  try {
    const taskRun = await client.taskRun.create({
      input: `Find the email address for ${founderName} at ${domain}. Look for verified email addresses, contact pages, or publicly listed emails. Return ONLY the email address if found.`,
      processor: 'core-fast' as const,
      task_spec: {
        input_schema: {
          type: 'text' as const,
          description: 'Search for a specific person\'s email address at a company domain.',
        },
        output_schema: {
          type: 'text' as const,
          description: 'The verified email address, or "NOT FOUND" if none found.',
        },
      },
    })

    const runResult = await client.taskRun.result(taskRun.run_id)
    const out = runResult.output as any
    const content: string = out?.content ?? out?.output ?? JSON.stringify(out)

    if (!content) return null

    // Extract email from response using regex
    const emailMatch = content.match(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    )
    if (emailMatch) {
      const email = emailMatch[0].toLowerCase()
      // Verify it's from the expected domain (or close to it)
      const emailDomain = email.split('@')[1]
      const cleanDomain = domain.replace(/^www\./, '').toLowerCase()
      if (emailDomain === cleanDomain || emailDomain.endsWith(`.${cleanDomain}`)) {
        return email
      }
    }

    return null
  } catch (err) {
    console.error(`[hermes/enrichment/email] Web lookup failed for ${founderName}@${domain}:`, err)
    return null
  }
}

/**
 * Generate a best-guess email from founder name + domain.
 * Same pattern as founderSearch.ts guessEmail.
 */
function guessEmailPattern(founderName: string, domain: string): string | null {
  try {
    const firstName = founderName.split(' ')[0].toLowerCase()
    if (!firstName) return null
    const cleanDomain = domain.replace(/^www\./, '')
    return `${firstName}@${cleanDomain}`
  } catch {
    return null
  }
}
