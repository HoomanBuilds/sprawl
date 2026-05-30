import { getSupabaseAdmin } from '@/lib/supabase';
import { generateEmbedding, storeEmbedding } from './embeddings-cache';
import type { MemoryNode } from '@/types/memory';

interface AddMemoryParams {
  type: MemoryNode['type'];
  description: string;
  poignancy: number;
  keywords: string[];
  subject?: string;
  predicate?: string;
  object?: string;
  evidence?: string[];
  depth?: number;
}

export async function addMemory(
  agentId: number,
  params: AddMemoryParams,
): Promise<MemoryNode> {
  const supabase = getSupabaseAdmin();

  const embedding = await generateEmbedding(params.description);
  const embeddingId = await storeEmbedding(agentId, params.description, embedding);

  const { data, error } = await supabase
    .from('agent_memories')
    .insert({
      agent_id: agentId,
      type: params.type,
      depth: params.depth ?? (params.type === 'reflection' ? 1 : 0),
      description: params.description,
      subject: params.subject,
      predicate: params.predicate,
      object: params.object,
      poignancy: Math.min(10, Math.max(1, params.poignancy)),
      keywords: params.keywords,
      evidence: params.evidence ?? [],
      embedding_id: embeddingId,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to add memory: ${error.message}`);

  await supabase.rpc('decrement_poignancy', {
    p_agent_id: agentId,
    p_amount: params.poignancy,
  }).then(({ error: rpcError }) => {
    if (rpcError) {
      // Non-critical — accumulator update failed, log and continue
      console.warn(`Failed to decrement poignancy_accumulator: ${rpcError.message}`);
    }
  });

  return data as MemoryNode;
}

export async function getRecentMemories(
  agentId: number,
  limit: number = 50,
): Promise<MemoryNode[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('agent_memories')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch memories: ${error.message}`);
  return (data ?? []) as MemoryNode[];
}

export async function searchByKeywords(
  agentId: number,
  keywords: string[],
): Promise<MemoryNode[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('agent_memories')
    .select('*')
    .eq('agent_id', agentId)
    .overlaps('keywords', keywords)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to search by keywords: ${error.message}`);
  return (data ?? []) as MemoryNode[];
}

export async function touchMemory(memoryId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  await supabase
    .from('agent_memories')
    .update({ last_accessed_at: new Date().toISOString() })
    .eq('id', memoryId);
}
