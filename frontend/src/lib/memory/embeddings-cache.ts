import { getSupabaseAdmin } from '@/lib/supabase';

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function generateEmbedding(text: string): Promise<number[]> {
  // Placeholder — will be wired to DeepSeek/OpenAI embeddings API later
  return Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
}

export async function getOrCreateEmbedding(text: string): Promise<number[]> {
  const supabase = getSupabaseAdmin();
  const hash = await sha256(text);

  const { data: cached } = await supabase
    .from('agent_memory_embeddings')
    .select('embedding')
    .eq('embedding_key', hash)
    .limit(1)
    .maybeSingle();

  if (cached?.embedding) {
    return typeof cached.embedding === 'string'
      ? JSON.parse(cached.embedding)
      : cached.embedding;
  }

  const embedding = await generateEmbedding(text);

  await supabase.from('agent_memory_embeddings').insert({
    embedding_key: hash,
    embedding: JSON.stringify(embedding),
  });

  return embedding;
}

export async function storeEmbedding(
  agentId: number,
  text: string,
  embedding: number[],
): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('agent_memory_embeddings')
    .insert({
      agent_id: agentId,
      embedding_key: text,
      embedding: JSON.stringify(embedding),
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to store embedding: ${error.message}`);
  return data.id;
}

export async function searchSimilarEmbeddings(
  agentId: number,
  queryEmbedding: number[],
  limit: number,
): Promise<Array<{ id: string; embedding_key: string; similarity: number }>> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc('match_embeddings', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_agent_id: agentId,
    match_count: limit,
  });

  if (error) throw new Error(`Embedding search failed: ${error.message}`);
  return data ?? [];
}

export { generateEmbedding };
