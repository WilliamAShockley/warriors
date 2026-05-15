// Hermes Enrichment Pipeline — Data Types

export interface EnrichmentResult {
  fundingRounds?: FundingRoundData[]
  websiteContent?: { homepage: string; about: string }
  founderTwitter?: { handle: string; bio: string; recentPosts: string[] }
  emailVerified?: string | null
  synthesizedBlob?: string
}

export interface FundingRoundData {
  amount?: string
  stage?: string
  date?: string
  leadInvestor?: string
  coInvestors?: string[]
  sourceUrl?: string
}
