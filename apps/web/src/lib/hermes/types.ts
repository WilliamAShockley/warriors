// Hermes Ingestion Pipeline — Common Intermediate Schema

export interface RawSignal {
  entityType: 'company' | 'person' | 'signal'
  source: IngestionSource
  name: string
  description?: string
  url?: string
  linkedinUrl?: string
  twitterHandle?: string
  sourceUrl?: string
  rawContent?: string
  publishedAt?: string
  author?: string
  metadata?: Record<string, any> // source-specific extra fields
}

export type IngestionSource =
  | 'linkedin_company'
  | 'linkedin_founder'
  | 'linkedin_mutuals'
  | 'twitter_search'
  | 'twitter_vc'
  | 'vc_website'
  | 'vc_portfolio'
  | 'techcrunch'
  | 'tbpn'
  | 'hackernews'
  | 'google_news'
  | 'monitor_hit'

export interface StepEvent {
  block: string
  step: number
  name: string
  status: 'pending' | 'running' | 'success' | 'error'
  durationMs: number
  input?: any
  output?: any
  error?: string | null
}

export interface IngestionConfig {
  source: IngestionSource
  query: string
  maxResults?: number
}
