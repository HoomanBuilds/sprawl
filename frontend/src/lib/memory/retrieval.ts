import { getSupabaseAdmin } from '@/lib/supabase';
import { generateEmbedding } from './embeddings-cache';
import { getRecentMemories, touchMemory } from './memory-stream';
import type { MemoryNode, MemoryRetrievalOptions } from '@/types/memory';

const DEFAULT_OPTIONS: MemoryRetrievalOptions = {
  topK: 5,
  overfetch: 50,
  recencyWeight: 0.5,
  relevanceWeight: 3,
  importanceWeight: 2,
};

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

function normalizeScores(scores: Map<string, number>): Map<string, number> {
  const values = Array.from(scores.values());
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  const normalized = new Map<string, number>();
  for (const [key, val] of scores) {
    normalized.set(key, range === 0 ? 0.5 : (val - min) / range);
  }
  return normalized;
}

function extractRecencyScores(
  nodes: MemoryNode[],
  decayFactor: number = 0.995,
): Map<string, number> {
  const now = Date.now();
  const scores = new Map<string, number>();
  for (const node of nodes) {
    const hoursSince =
      (now - new Date(node.last_accessed_at).getTime()) / 3_600_000;
    scores.set(node.id, Math.pow(decayFactor, hoursSince));
  }
  return scores;
}

function extractImportanceScores(nodes: MemoryNode[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const node of nodes) {
    scores.set(node.id, node.poignancy / 10);
  }
  return scores;
}

async function extractRelevanceScores(
  nodes: MemoryNode[],
  queryEmbedding: number[],
): Promise<Map<string, number>> {
  const supabase = getSupabaseAdmin();
  const scores = new Map<string, number>();

  const embeddingIds = nodes
    .filter((n) => n.embedding_id)
    .map((n) => n.embedding_id!);

  if (embeddingIds.length === 0) {
    for (const node of nodes) scores.set(node.id, 0);
    return scores;
  }

  const { data: embeddings } = await supabase
    .from('agent_memory_embeddings')
    .select('id, embedding')
    .in('id', embeddingIds);

  const embeddingMap = new Map<string, number[]>();
  for (const emb of embeddings ?? []) {
    const parsed =
      typeof emb.embedding === 'string'
        ? JSON.parse(emb.embedding)
        : emb.embedding;
    embeddingMap.set(emb.id, parsed);
  }

  for (const node of nodes) {
    if (node.embedding_id && embeddingMap.has(node.embedding_id)) {
      scores.set(
        node.id,
        cosineSimilarity(queryEmbedding, embeddingMap.get(node.embedding_id)!),
      );
    } else {
      scores.set(node.id, 0);
    }
  }

  return scores;
}

export function scoreMemory(
  node: MemoryNode,
  recencyNorm: number,
  relevanceNorm: number,
  importanceNorm: number,
  weights: Pick<MemoryRetrievalOptions, 'recencyWeight' | 'relevanceWeight' | 'importanceWeight'> = DEFAULT_OPTIONS,
): number {
  return (
    recencyNorm * weights.recencyWeight +
    relevanceNorm * weights.relevanceWeight +
    importanceNorm * weights.importanceWeight
  );
}

export async function retrieveMemories(
  agentId: number,
  queryText: string,
  options?: Partial<MemoryRetrievalOptions>,
): Promise<MemoryNode[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const nodes = await getRecentMemories(agentId, opts.overfetch);
  if (nodes.length === 0) return [];

  const queryEmbedding = await generateEmbedding(queryText);

  const recencyRaw = extractRecencyScores(nodes);
  const importanceRaw = extractImportanceScores(nodes);
  const relevanceRaw = await extractRelevanceScores(nodes, queryEmbedding);

  const recency = normalizeScores(recencyRaw);
  const importance = normalizeScores(importanceRaw);
  const relevance = normalizeScores(relevanceRaw);

  const masterScores = new Map<string, number>();
  for (const node of nodes) {
    const score = scoreMemory(
      node,
      recency.get(node.id) ?? 0,
      relevance.get(node.id) ?? 0,
      importance.get(node.id) ?? 0,
      opts,
    );
    masterScores.set(node.id, score);
  }

  const sorted = nodes.sort(
    (a, b) => (masterScores.get(b.id) ?? 0) - (masterScores.get(a.id) ?? 0),
  );

  const topK = sorted.slice(0, opts.topK);

  for (const node of topK) {
    await touchMemory(node.id);
  }

  return topK;
}
