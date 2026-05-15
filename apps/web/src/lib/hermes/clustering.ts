// Hermes — Clustering Engine
// K-means clustering with cosine distance over target embeddings
// Generates cluster labels via Claude

import { db } from '@/lib/db'
import { anthropic } from '@/lib/claude'
import { fetchAllEmbeddings, upsertClusterEmbedding } from './vector-ops'
import type { StepEvent } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmbeddedTarget {
  id: string
  name: string
  company: string
  embedding: number[]
}

interface ClusterAssignment {
  centroid: number[]
  memberIds: string[]
  members: EmbeddedTarget[]
}

// ---------------------------------------------------------------------------
// Cosine distance helpers
// ---------------------------------------------------------------------------

function dotProduct(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}

function magnitude(v: number[]): number {
  let sum = 0
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i]
  return Math.sqrt(sum)
}

function cosineSimilarity(a: number[], b: number[]): number {
  const magA = magnitude(a)
  const magB = magnitude(b)
  if (magA === 0 || magB === 0) return 0
  return dotProduct(a, b) / (magA * magB)
}

function cosineDistance(a: number[], b: number[]): number {
  return 1 - cosineSimilarity(a, b)
}

// ---------------------------------------------------------------------------
// K-Means Implementation (cosine distance)
// ---------------------------------------------------------------------------

function initializeCentroids(data: number[][], k: number): number[][] {
  // K-means++ initialization
  const centroids: number[][] = []
  const n = data.length
  const dims = data[0].length

  // Pick first centroid randomly
  const firstIdx = Math.floor(Math.random() * n)
  centroids.push([...data[firstIdx]])

  // Pick remaining centroids proportional to distance^2
  for (let c = 1; c < k; c++) {
    const distances = data.map((point) => {
      const minDist = Math.min(
        ...centroids.map((centroid) => cosineDistance(point, centroid)),
      )
      return minDist * minDist
    })

    const totalDist = distances.reduce((a, b) => a + b, 0)
    let random = Math.random() * totalDist
    let selectedIdx = 0

    for (let i = 0; i < n; i++) {
      random -= distances[i]
      if (random <= 0) {
        selectedIdx = i
        break
      }
    }

    centroids.push([...data[selectedIdx]])
  }

  return centroids
}

function assignClusters(data: number[][], centroids: number[][]): number[] {
  return data.map((point) => {
    let minDist = Infinity
    let bestCluster = 0
    for (let c = 0; c < centroids.length; c++) {
      const dist = cosineDistance(point, centroids[c])
      if (dist < minDist) {
        minDist = dist
        bestCluster = c
      }
    }
    return bestCluster
  })
}

function updateCentroids(
  data: number[][],
  assignments: number[],
  k: number,
): number[][] {
  const dims = data[0].length
  const centroids: number[][] = Array.from({ length: k }, () =>
    new Array(dims).fill(0),
  )
  const counts = new Array(k).fill(0)

  for (let i = 0; i < data.length; i++) {
    const cluster = assignments[i]
    counts[cluster]++
    for (let d = 0; d < dims; d++) {
      centroids[cluster][d] += data[i][d]
    }
  }

  // Average and normalize (for cosine)
  for (let c = 0; c < k; c++) {
    if (counts[c] > 0) {
      for (let d = 0; d < dims; d++) {
        centroids[c][d] /= counts[c]
      }
      // Normalize to unit vector
      const mag = magnitude(centroids[c])
      if (mag > 0) {
        for (let d = 0; d < dims; d++) {
          centroids[c][d] /= mag
        }
      }
    }
  }

  return centroids
}

function runKMeans(
  data: number[][],
  k: number,
  maxIterations: number = 20,
): { assignments: number[]; centroids: number[][] } {
  let centroids = initializeCentroids(data, k)
  let assignments = assignClusters(data, centroids)

  for (let iter = 0; iter < maxIterations; iter++) {
    const newCentroids = updateCentroids(data, assignments, k)
    const newAssignments = assignClusters(data, newCentroids)

    // Check convergence
    let changed = false
    for (let i = 0; i < assignments.length; i++) {
      if (assignments[i] !== newAssignments[i]) {
        changed = true
        break
      }
    }

    centroids = newCentroids
    assignments = newAssignments

    if (!changed) break
  }

  return { assignments, centroids }
}

// ---------------------------------------------------------------------------
// LLM Label Generation
// ---------------------------------------------------------------------------

async function generateClusterLabel(
  companies: { name: string; company: string }[],
): Promise<{ label: string; description: string }> {
  const companyList = companies
    .slice(0, 10) // limit context
    .map((c) => `- ${c.company} (${c.name})`)
    .join('\n')

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: `Given these companies in a cluster, generate a short label (3-6 words) and one-sentence description that captures their common theme.

Companies:
${companyList}

Respond with ONLY a JSON object: {"label": "Short Label Here", "description": "One sentence about the theme."}`,
        },
      ],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        label: parsed.label || 'Unlabeled Cluster',
        description: parsed.description || '',
      }
    }
  } catch (err) {
    console.error('Cluster label generation failed:', err)
  }

  return { label: 'Unlabeled Cluster', description: '' }
}

// ---------------------------------------------------------------------------
// Main Clustering Pipeline
// ---------------------------------------------------------------------------

function makeStep(
  step: number,
  name: string,
  status: StepEvent['status'],
  durationMs: number,
  extra?: Partial<StepEvent>,
): StepEvent {
  return { block: 'clustering', step, name, status, durationMs, ...extra }
}

/**
 * Run k-means clustering over all target embeddings.
 * 1. Fetch all embeddings
 * 2. Run k-means
 * 3. Report stats
 * 4. LLM label generation
 * 5. Write Cluster records
 * 6. Update Target.clusterId
 */
export async function runClustering(
  emit: (event: StepEvent) => void,
): Promise<void> {
  let t0: number

  // -----------------------------------------------------------------------
  // Step 1: Fetch all target embeddings
  // -----------------------------------------------------------------------
  t0 = Date.now()
  emit(makeStep(1, 'Fetch all target embeddings', 'running', 0))

  let targets: EmbeddedTarget[]
  try {
    targets = await fetchAllEmbeddings()
  } catch (err: any) {
    emit(makeStep(1, 'Fetch all target embeddings', 'error', Date.now() - t0, {
      error: err.message,
    }))
    return
  }

  emit(makeStep(1, 'Fetch all target embeddings', 'success', Date.now() - t0, {
    output: { targetCount: targets.length },
  }))

  if (targets.length < 3) {
    emit(makeStep(2, 'Run k-means clustering', 'success', 0, {
      output: { message: 'Not enough targets (need >= 3) for clustering' },
    }))
    return
  }

  // -----------------------------------------------------------------------
  // Step 2: Run k-means
  // -----------------------------------------------------------------------
  t0 = Date.now()
  emit(makeStep(2, 'Run k-means clustering', 'running', 0))

  const k = Math.max(3, Math.floor(Math.sqrt(targets.length / 2)))
  const embeddings = targets.map((t) => t.embedding)
  const { assignments, centroids } = runKMeans(embeddings, k)

  // Group targets by cluster
  const clusters: ClusterAssignment[] = Array.from({ length: k }, () => ({
    centroid: [],
    memberIds: [],
    members: [],
  }))

  for (let i = 0; i < targets.length; i++) {
    const clusterIdx = assignments[i]
    clusters[clusterIdx].memberIds.push(targets[i].id)
    clusters[clusterIdx].members.push(targets[i])
  }

  for (let c = 0; c < k; c++) {
    clusters[c].centroid = centroids[c]
  }

  // Filter out empty clusters
  const nonEmptyClusters = clusters.filter((c) => c.memberIds.length > 0)

  emit(makeStep(2, 'Run k-means clustering', 'success', Date.now() - t0, {
    output: {
      k,
      actualClusters: nonEmptyClusters.length,
      clusterSizes: nonEmptyClusters.map((c) => c.memberIds.length),
    },
  }))

  // -----------------------------------------------------------------------
  // Step 3: Report cluster stats
  // -----------------------------------------------------------------------
  t0 = Date.now()
  emit(makeStep(3, 'Report cluster stats', 'running', 0))

  const stats = nonEmptyClusters.map((c, i) => ({
    clusterIndex: i,
    size: c.memberIds.length,
    companies: c.members.slice(0, 5).map((m) => m.company),
  }))

  emit(makeStep(3, 'Report cluster stats', 'success', Date.now() - t0, {
    output: { stats },
  }))

  // -----------------------------------------------------------------------
  // Step 4: LLM label generation
  // -----------------------------------------------------------------------
  t0 = Date.now()
  emit(makeStep(4, 'Generate cluster labels via LLM', 'running', 0))

  const labels: { label: string; description: string }[] = []
  for (const cluster of nonEmptyClusters) {
    const label = await generateClusterLabel(cluster.members)
    labels.push(label)
  }

  emit(makeStep(4, 'Generate cluster labels via LLM', 'success', Date.now() - t0, {
    output: { labels: labels.map((l) => l.label) },
  }))

  // -----------------------------------------------------------------------
  // Step 5: Write Cluster records
  // -----------------------------------------------------------------------
  t0 = Date.now()
  emit(makeStep(5, 'Write Cluster records to DB', 'running', 0))

  // Delete existing clusters (full refresh)
  await db.target.updateMany({
    data: { clusterId: null },
  })
  await db.cluster.deleteMany()

  const clusterIds: string[] = []
  for (let i = 0; i < nonEmptyClusters.length; i++) {
    const cluster = nonEmptyClusters[i]
    const label = labels[i]

    const created = await db.cluster.create({
      data: {
        label: label.label,
        description: label.description,
        memberCount: cluster.memberIds.length,
      },
    })

    clusterIds.push(created.id)

    // Store cluster centroid embedding
    try {
      await upsertClusterEmbedding(created.id, cluster.centroid)
    } catch (err) {
      console.error(`Failed to store cluster embedding for ${created.id}:`, err)
    }
  }

  emit(makeStep(5, 'Write Cluster records to DB', 'success', Date.now() - t0, {
    output: { clustersCreated: clusterIds.length },
  }))

  // -----------------------------------------------------------------------
  // Step 6: Update Target.clusterId
  // -----------------------------------------------------------------------
  t0 = Date.now()
  emit(makeStep(6, 'Assign targets to clusters', 'running', 0))

  let assigned = 0
  for (let i = 0; i < nonEmptyClusters.length; i++) {
    const cluster = nonEmptyClusters[i]
    const clusterId = clusterIds[i]

    for (const targetId of cluster.memberIds) {
      try {
        await db.target.update({
          where: { id: targetId },
          data: { clusterId },
        })
        assigned++
      } catch (err) {
        console.error(`Failed to assign target ${targetId} to cluster ${clusterId}:`, err)
      }
    }
  }

  emit(makeStep(6, 'Assign targets to clusters', 'success', Date.now() - t0, {
    output: { assigned },
  }))
}
