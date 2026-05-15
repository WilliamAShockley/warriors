// Hermes Cron Route — triggered by Vercel cron to run ingestion for all enabled MonitorThemes
// Routes through the Hermes pipeline instead of the legacy monitorScan path.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { runMultiSourceIngestion } from '@/lib/hermes/ingestion'
import type { IngestionConfig, StepEvent, IngestionSource } from '@/lib/hermes/types'

export async function POST(req: Request) {
  // Verify CRON_SECRET header
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Fetch all enabled monitor themes
    const themes = await db.monitorTheme.findMany({
      where: { enabled: true },
      select: {
        id: true,
        name: true,
        description: true,
        keywords: true,
      },
    })

    if (themes.length === 0) {
      return NextResponse.json({ ok: true, message: 'No enabled themes', results: [] })
    }

    const allResults: {
      themeId: string
      themeName: string
      signalsIngested: number
      errors: string[]
    }[] = []

    for (const theme of themes) {
      const errors: string[] = []
      const query = theme.keywords
        ? `${theme.description} ${theme.keywords}`
        : theme.description

      // Build ingestion configs for all Hermes sources
      // Same sources as monitorScan (Parallel, HN, Google News) but routed through pipeline
      const configs: IngestionConfig[] = [
        { source: 'hackernews' as IngestionSource, query, maxResults: 10 },
        { source: 'google_news' as IngestionSource, query, maxResults: 10 },
        { source: 'techcrunch' as IngestionSource, query, maxResults: 10 },
      ]

      // Collect step events for logging
      const steps: StepEvent[] = []
      const emit = (event: StepEvent) => {
        steps.push(event)
        if (event.status === 'error' && event.error) {
          errors.push(`${event.name}: ${event.error}`)
        }
      }

      let signalsIngested = 0
      try {
        const signals = await runMultiSourceIngestion(configs, emit)
        signalsIngested = signals.length
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
      }

      // Update the theme's lastScannedAt
      await db.monitorTheme.update({
        where: { id: theme.id },
        data: { lastScannedAt: new Date() },
      })

      // Log the Hermes run
      try {
        await db.hermesRun.create({
          data: {
            block: 'ingestion',
            status: errors.length > 0 ? 'failed' : 'passed',
            steps: JSON.stringify(steps),
            durationMs: steps.reduce((sum, s) => sum + s.durationMs, 0),
            completedAt: new Date(),
          },
        })
      } catch {
        // Non-critical
      }

      allResults.push({
        themeId: theme.id,
        themeName: theme.name,
        signalsIngested,
        errors,
      })
    }

    const totalIngested = allResults.reduce((sum, r) => sum + r.signalsIngested, 0)

    return NextResponse.json({
      ok: true,
      themesScanned: themes.length,
      totalSignalsIngested: totalIngested,
      results: allResults,
    })
  } catch (err) {
    console.error('[hermes] Cron failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cron failed' },
      { status: 500 },
    )
  }
}
