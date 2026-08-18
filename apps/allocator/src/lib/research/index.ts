import type { ProviderId, ResearchProvider } from './types'
import { anthropicProvider } from './providers/anthropic'
import { openaiProvider } from './providers/openai'
import { exaProvider } from './providers/exa'
import { parallelProvider } from './providers/parallel'

export type { ProviderId, ResearchInput, ResearchResult } from './types'

// Bench order: the incumbent first, then the challengers.
export const RESEARCH_PROVIDERS: ResearchProvider[] = [
  anthropicProvider,
  openaiProvider,
  exaProvider,
  parallelProvider,
]

export const providerById = (id: string): ResearchProvider | undefined =>
  RESEARCH_PROVIDERS.find((p) => p.id === (id as ProviderId))
