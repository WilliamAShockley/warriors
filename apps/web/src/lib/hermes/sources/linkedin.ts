// Hermes Source Adapter — LinkedIn (Playwright-based crawler)
// Playwright is an optional dependency — the app will not crash if it's not installed.

import type { RawSignal } from '../types'

// Lazy Playwright import — returns null if not installed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPlaywright(): Promise<any | null> {
  try {
    // Dynamic import with variable to bypass TypeScript module resolution for optional dep
    const moduleName = 'playwright'
    return await import(moduleName)
  } catch {
    console.warn('[hermes] Playwright not installed — LinkedIn adapter disabled')
    return null
  }
}

/** Random delay between min and max ms to mimic human behavior */
function randomDelay(minMs: number = 3000, maxMs: number = 8000): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs)) + minMs
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Launch a browser, log in to LinkedIn, and return the page */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function launchLinkedInSession(pw: any) {
  const email = process.env.LINKEDIN_EMAIL
  const password = process.env.LINKEDIN_PASSWORD

  if (!email || !password) {
    throw new Error('LINKEDIN_EMAIL and LINKEDIN_PASSWORD env vars are required')
  }

  const browser = await pw.chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()

  // Navigate to LinkedIn login
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle' })
  await randomDelay(1000, 2000)

  // Fill credentials
  await page.fill('#username', email)
  await page.fill('#password', password)
  await randomDelay(500, 1500)
  await page.click('button[type="submit"]')
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30_000 })
  await randomDelay(2000, 4000)

  return { browser, context, page }
}

/**
 * Search LinkedIn for companies matching a query.
 * Navigates to LinkedIn search, extracts company cards from DOM text.
 */
export async function searchLinkedInCompanies(
  query: string,
  maxResults: number = 10,
): Promise<RawSignal[]> {
  const pw = await getPlaywright()
  if (!pw) return []

  let browser: any = null

  try {
    const session = await launchLinkedInSession(pw)
    browser = session.browser
    const page = session.page

    // Navigate to company search
    const searchUrl = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(query)}`
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30_000 })
    await randomDelay()

    // Take a screenshot for potential LLM parsing
    const screenshot = await page.screenshot({ fullPage: false })

    // Extract company cards from DOM
    const cards = await page.$$eval(
      '.search-results-container .entity-result__item, .reusable-search__result-container',
      (elements: Element[]) =>
        elements.map((el) => {
          const nameEl = el.querySelector('.entity-result__title-text a, .app-aware-link')
          const descEl = el.querySelector('.entity-result__primary-subtitle, .entity-result__summary')
          const linkEl = el.querySelector('a[href*="/company/"]')
          return {
            name: nameEl?.textContent?.trim() ?? '',
            description: descEl?.textContent?.trim() ?? '',
            url: linkEl?.getAttribute('href') ?? '',
          }
        }),
    )

    const signals: RawSignal[] = cards
      .filter((c) => c.name)
      .slice(0, maxResults)
      .map((card) => ({
        entityType: 'company' as const,
        source: 'linkedin_company' as const,
        name: card.name,
        description: card.description || undefined,
        linkedinUrl: card.url ? `https://www.linkedin.com${card.url}` : undefined,
        sourceUrl: searchUrl,
        metadata: {
          screenshotAvailable: !!screenshot,
          extractionMethod: 'dom',
        },
      }))

    return signals
  } catch (err) {
    console.error('[hermes] LinkedIn company search failed:', err)
    return []
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}

/**
 * Search LinkedIn for the founder/CEO of a company.
 * Navigates to company's people page and extracts leadership.
 */
export async function searchLinkedInFounder(
  companyName: string,
  maxResults: number = 5,
): Promise<RawSignal[]> {
  const pw = await getPlaywright()
  if (!pw) return []

  let browser: any = null

  try {
    const session = await launchLinkedInSession(pw)
    browser = session.browser
    const page = session.page

    // Search for people at the company with founder/CEO titles
    const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${companyName} founder CEO`)}&origin=GLOBAL_SEARCH_HEADER`
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30_000 })
    await randomDelay()

    // Take screenshot
    await page.screenshot({ fullPage: false })

    // Extract people cards
    const cards = await page.$$eval(
      '.search-results-container .entity-result__item, .reusable-search__result-container',
      (elements: Element[]) =>
        elements.map((el) => {
          const nameEl = el.querySelector('.entity-result__title-text a span[aria-hidden="true"]')
          const titleEl = el.querySelector('.entity-result__primary-subtitle')
          const linkEl = el.querySelector('a[href*="/in/"]')
          return {
            name: nameEl?.textContent?.trim() ?? '',
            title: titleEl?.textContent?.trim() ?? '',
            profileUrl: linkEl?.getAttribute('href') ?? '',
          }
        }),
    )

    const signals: RawSignal[] = cards
      .filter((c) => c.name)
      .slice(0, maxResults)
      .map((card) => ({
        entityType: 'person' as const,
        source: 'linkedin_founder' as const,
        name: card.name,
        description: card.title || undefined,
        linkedinUrl: card.profileUrl
          ? `https://www.linkedin.com${card.profileUrl}`
          : undefined,
        sourceUrl: searchUrl,
        metadata: {
          role: card.title,
          companySearched: companyName,
          extractionMethod: 'dom',
        },
      }))

    return signals
  } catch (err) {
    console.error('[hermes] LinkedIn founder search failed:', err)
    return []
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}

/**
 * Search LinkedIn for mutual connections of a founder.
 * Navigates to the founder's connections and extracts them.
 */
export async function searchLinkedInMutuals(
  founderLinkedinUrl: string,
  maxResults: number = 10,
): Promise<RawSignal[]> {
  const pw = await getPlaywright()
  if (!pw) return []

  let browser: any = null

  try {
    const session = await launchLinkedInSession(pw)
    browser = session.browser
    const page = session.page

    // Navigate to the founder's profile
    await page.goto(founderLinkedinUrl, { waitUntil: 'networkidle', timeout: 30_000 })
    await randomDelay()

    // Try to click "connections" or "mutual connections" link
    const connectionsLink = await page.$('a[href*="connections"], a[href*="mutual"]')
    if (connectionsLink) {
      await connectionsLink.click()
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
      await randomDelay()
    }

    // Take screenshot
    await page.screenshot({ fullPage: false })

    // Extract the page text for LLM parsing since mutual connections
    // layout varies significantly
    const pageText = await page.evaluate(() => document.body.innerText)

    // Return as a single signal with rawContent for downstream extraction
    return [
      {
        entityType: 'person' as const,
        source: 'linkedin_mutuals' as const,
        name: `Mutuals of ${founderLinkedinUrl.split('/in/')[1]?.replace(/\/$/, '') ?? 'unknown'}`,
        description: 'LinkedIn mutual connections',
        linkedinUrl: founderLinkedinUrl,
        sourceUrl: founderLinkedinUrl,
        rawContent: pageText.slice(0, 5000),
        metadata: {
          founderUrl: founderLinkedinUrl,
          extractionMethod: 'dom_text',
          needsLLMParsing: true,
        },
      },
    ]
  } catch (err) {
    console.error('[hermes] LinkedIn mutuals search failed:', err)
    return []
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
