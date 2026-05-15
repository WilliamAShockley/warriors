// Hermes Enrichment — Website Content Scrape via Parallel Web

import Parallel from 'parallel-web'

/**
 * Fetch homepage and /about page content for a company via Parallel Web.
 * Returns raw text content suitable for downstream synthesis.
 */
export async function enrichWebsite(
  websiteUrl: string,
): Promise<{ homepage: string; about: string }> {
  const client = new Parallel({ apiKey: process.env.PARALLEL_API_KEY! })

  const cleanUrl = websiteUrl.replace(/\/$/, '')
  const aboutUrl = `${cleanUrl}/about`

  const result: { homepage: string; about: string } = { homepage: '', about: '' }

  // Fetch homepage and about page in parallel
  const [homepageResult, aboutResult] = await Promise.allSettled([
    fetchPage(client, cleanUrl),
    fetchPage(client, aboutUrl),
  ])

  if (homepageResult.status === 'fulfilled') {
    result.homepage = homepageResult.value
  }
  if (aboutResult.status === 'fulfilled') {
    result.about = aboutResult.value
  }

  return result
}

async function fetchPage(client: InstanceType<typeof Parallel>, url: string): Promise<string> {
  try {
    const taskRun = await client.taskRun.create({
      input: `Visit ${url} and return the full text content of the page. Include all visible text: headings, paragraphs, team bios, product descriptions. Do not summarize — return the raw content.`,
      processor: 'core-fast' as const,
      task_spec: {
        input_schema: {
          type: 'text' as const,
          description: 'URL to scrape for text content.',
        },
        output_schema: {
          type: 'text' as const,
          description: 'The full text content of the web page.',
        },
      },
    })

    const runResult = await client.taskRun.result(taskRun.run_id)
    const out = runResult.output as any
    const content: string = out?.content ?? out?.output ?? JSON.stringify(out)
    return content ?? ''
  } catch (err) {
    console.error(`[hermes/enrichment/website] Failed to fetch ${url}:`, err)
    return ''
  }
}
