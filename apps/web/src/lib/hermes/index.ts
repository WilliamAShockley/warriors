// Hermes Pipeline — public API

export type {
  RawSignal,
  IngestionSource,
  StepEvent,
  IngestionConfig,
} from './types'

export { generateFingerprint, checkDuplicate, deduplicateSignals } from './dedup'
export { classifyRelevance, filterByRelevance } from './relevance'
export type { RelevanceResult } from './relevance'

export { runIngestion, runMultiSourceIngestion } from './ingestion'

// Source adapters
export {
  searchParallelWeb,
  searchHackerNews,
  searchGoogleNews,
  searchLinkedInCompanies,
  searchLinkedInFounder,
  searchLinkedInMutuals,
  searchTwitter,
  searchVCTwitter,
} from './sources'

// Embeddings
export { embed, embedBatch, toPgVector } from './embeddings'

// Vector operations
export {
  upsertEmbedding,
  upsertPersonEmbedding,
  semanticSearch,
  findSimilarEntities,
  fetchAllEmbeddings,
  cosineSimilarity,
} from './vector-ops'
export type { SearchResult, SearchFilters, SimilarEntity } from './vector-ops'

// Embedding pipeline
export { runEmbeddingPipeline, embedAllTargets } from './embedding-pipeline'

// Entity resolution
export {
  runEntityResolution,
  levenshteinDistance,
  normalizeDomain,
} from './entity-resolution'

// Scoring engine
export { scoreTarget, runScoring } from './scoring'

// Clustering
export { runClustering } from './clustering'
