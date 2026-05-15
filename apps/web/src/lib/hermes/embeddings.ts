// Hermes — Voyage AI Embeddings Client
// Uses voyage-3-large model (1024 dimensions)

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings'
const VOYAGE_MODEL = 'voyage-3-large'
const MAX_BATCH_SIZE = 128

function getApiKey(): string {
  const key = process.env.VOYAGE_API_KEY
  if (!key) throw new Error('VOYAGE_API_KEY environment variable is not set')
  return key
}

interface VoyageEmbeddingResponse {
  object: string
  data: { object: string; embedding: number[]; index: number }[]
  model: string
  usage: { total_tokens: number }
}

/**
 * Embed a single text string via Voyage AI.
 * Returns a 1024-dimensional vector.
 */
export async function embed(text: string): Promise<number[]> {
  const [result] = await embedBatch([text])
  return result
}

/**
 * Embed a batch of text strings via Voyage AI.
 * Automatically splits into chunks of 128 if needed.
 * Returns an array of 1024-dimensional vectors (same order as input).
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const apiKey = getApiKey()
  const allEmbeddings: number[][] = new Array(texts.length)

  // Process in chunks of MAX_BATCH_SIZE
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const chunk = texts.slice(i, i + MAX_BATCH_SIZE)

    const response = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: chunk,
        model: VOYAGE_MODEL,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown error')
      throw new Error(
        `Voyage AI API error ${response.status}: ${errorBody}`
      )
    }

    const data: VoyageEmbeddingResponse = await response.json()

    // Place embeddings back in the correct positions
    for (const item of data.data) {
      allEmbeddings[i + item.index] = item.embedding
    }
  }

  return allEmbeddings
}

/**
 * Convert a number[] embedding to pgvector-compatible string format.
 * e.g. [0.1, 0.2, 0.3] -> '[0.1,0.2,0.3]'
 */
export function toPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}
