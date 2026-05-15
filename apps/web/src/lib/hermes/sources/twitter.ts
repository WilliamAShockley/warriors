// Hermes Source Adapter — Twitter/X (Playwright-based crawler)
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
    console.warn('[hermes] Playwright not installed — Twitter adapter disabled')
    return null
  }
}

/** Random delay between min and max ms to mimic human behavior */
function randomDelay(minMs: number = 3000, maxMs: number = 8000): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs)) + minMs
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Launch a browser, log in to Twitter/X, and return the page */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function launchTwitterSession(pw: any) {
  const email = process.env.TWITTER_EMAIL
  const password = process.env.TWITTER_PASSWORD

  if (!email || !password) {
    throw new Error('TWITTER_EMAIL and TWITTER_PASSWORD env vars are required')
  }

  const browser = await pw.chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()

  // Navigate to Twitter login
  await page.goto('https://x.com/i/flow/login', { waitUntil: 'networkidle', timeout: 30_000 })
  await randomDelay(2000, 4000)

  // Enter email/username
  const emailInput = await page.waitForSelector('input[autocomplete="username"]', {
    timeout: 15_000,
  })
  if (emailInput) {
    await emailInput.fill(email)
    await randomDelay(500, 1500)
    // Click next
    await page.click('[role="button"]:has-text("Next")')
    await randomDelay(1500, 3000)
  }

  // Enter password
  const passwordInput = await page.waitForSelector('input[type="password"]', {
    timeout: 15_000,
  })
  if (passwordInput) {
    await passwordInput.fill(password)
    await randomDelay(500, 1500)
    // Click log in
    await page.click('[data-testid="LoginForm_Login_Button"]')
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {})
    await randomDelay(2000, 4000)
  }

  return { browser, context, page }
}

/**
 * Search Twitter/X for tweets matching a query.
 * Navigates to Twitter search and extracts tweet content.
 */
export async function searchTwitter(
  query: string,
  maxResults: number = 10,
): Promise<RawSignal[]> {
  const pw = await getPlaywright()
  if (!pw) return []

  let browser: any = null

  try {
    const session = await launchTwitterSession(pw)
    browser = session.browser
    const page = session.page

    // Navigate to search
    const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=top`
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30_000 })
    await randomDelay()

    // Take screenshot for LLM parsing
    await page.screenshot({ fullPage: false })

    // Extract tweets from DOM
    const tweets = await page.$$eval(
      '[data-testid="tweet"]',
      (elements: Element[]) =>
        elements.map((el) => {
          const nameEl = el.querySelector('[data-testid="User-Name"]')
          const textEl = el.querySelector('[data-testid="tweetText"]')
          const linkEl = el.querySelector('a[href*="/status/"]')
          const timeEl = el.querySelector('time')

          // Extract handle from username element
          const handleMatch = nameEl?.textContent?.match(/@(\w+)/)

          return {
            author: nameEl?.textContent?.split('@')[0]?.trim() ?? '',
            handle: handleMatch ? handleMatch[1] : '',
            text: textEl?.textContent?.trim() ?? '',
            tweetUrl: linkEl?.getAttribute('href') ?? '',
            timestamp: timeEl?.getAttribute('datetime') ?? '',
          }
        }),
    )

    const signals: RawSignal[] = tweets
      .filter((t) => t.text)
      .slice(0, maxResults)
      .map((tweet) => ({
        entityType: 'signal' as const,
        source: 'twitter_search' as const,
        name: tweet.author || tweet.handle || 'Unknown',
        description: tweet.text.slice(0, 300),
        url: tweet.tweetUrl ? `https://x.com${tweet.tweetUrl}` : undefined,
        sourceUrl: searchUrl,
        twitterHandle: tweet.handle || undefined,
        author: tweet.author || undefined,
        publishedAt: tweet.timestamp || undefined,
        rawContent: tweet.text,
        metadata: {
          handle: tweet.handle,
          query,
          extractionMethod: 'dom',
        },
      }))

    return signals
  } catch (err) {
    console.error('[hermes] Twitter search failed:', err)
    return []
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}

/**
 * Search a specific VC's Twitter/X timeline for portfolio mentions and deals.
 * Navigates to their profile and extracts recent tweets.
 */
export async function searchVCTwitter(
  vcHandle: string,
  maxResults: number = 20,
): Promise<RawSignal[]> {
  const pw = await getPlaywright()
  if (!pw) return []

  let browser: any = null

  try {
    const session = await launchTwitterSession(pw)
    browser = session.browser
    const page = session.page

    // Clean handle
    const handle = vcHandle.replace(/^@/, '')

    // Navigate to VC's profile
    const profileUrl = `https://x.com/${handle}`
    await page.goto(profileUrl, { waitUntil: 'networkidle', timeout: 30_000 })
    await randomDelay()

    // Scroll down to load more tweets
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight))
      await randomDelay(1500, 3000)
    }

    // Take screenshot
    await page.screenshot({ fullPage: false })

    // Extract tweets from timeline
    const tweets = await page.$$eval(
      '[data-testid="tweet"]',
      (elements: Element[]) =>
        elements.map((el) => {
          const textEl = el.querySelector('[data-testid="tweetText"]')
          const timeEl = el.querySelector('time')
          const linkEl = el.querySelector('a[href*="/status/"]')

          return {
            text: textEl?.textContent?.trim() ?? '',
            timestamp: timeEl?.getAttribute('datetime') ?? '',
            tweetUrl: linkEl?.getAttribute('href') ?? '',
          }
        }),
    )

    const signals: RawSignal[] = tweets
      .filter((t) => t.text)
      .slice(0, maxResults)
      .map((tweet) => ({
        entityType: 'signal' as const,
        source: 'twitter_vc' as const,
        name: handle,
        description: tweet.text.slice(0, 300),
        url: tweet.tweetUrl ? `https://x.com${tweet.tweetUrl}` : undefined,
        sourceUrl: profileUrl,
        twitterHandle: handle,
        author: handle,
        publishedAt: tweet.timestamp || undefined,
        rawContent: tweet.text,
        metadata: {
          vcHandle: handle,
          extractionMethod: 'dom',
        },
      }))

    return signals
  } catch (err) {
    console.error(`[hermes] VC Twitter search failed for @${vcHandle}:`, err)
    return []
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
