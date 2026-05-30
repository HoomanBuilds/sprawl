import { getSupabaseAdmin } from '@/lib/supabase';
import { generateEmbedding, storeEmbedding, searchSimilarEmbeddings } from '@/lib/memory/embeddings-cache';
import { callDeepSeek } from '@/lib/deepseek';
import type { SkillRecord } from '@/types/memory';
import type { AgentDecision, ExecutionResult } from '@/types/engine';

const MAX_SKILLS_PER_AGENT = 50;
const MIN_PNL_FOR_SKILL = 10;

async function generateSkillDescription(
  decision: AgentDecision,
  result: ExecutionResult,
): Promise<string> {
  try {
    const resp = await callDeepSeek(
      [
        {
          role: 'system',
          content:
            'You are a DeFi trading strategy documenter. Given a trade decision and its outcome, write a concise 1-2 sentence description of the strategy that can be reused. Focus on WHEN to use it and WHY it works.',
        },
        {
          role: 'user',
          content: `Action: ${decision.action}\nParams: ${JSON.stringify(decision.params)}\nRationale: ${decision.rationale}\nResult: amountIn=${result.amountIn}, amountOut=${result.amountOut}, P&L=$${result.realizedPnl.toFixed(2)}`,
        },
      ],
      undefined,
      { temperature: 0.3 },
    );
    return resp.choices?.[0]?.message?.content ?? decision.rationale;
  } catch {
    return `${decision.action} strategy: ${decision.rationale}. P&L: $${result.realizedPnl.toFixed(2)}`;
  }
}

function generateSkillName(decision: AgentDecision): string {
  const token = decision.params.tokenIn ?? decision.params.tokenA ?? 'unknown';
  const ts = Date.now().toString(36);
  return `${decision.action}_${String(token).toLowerCase()}_${ts}`;
}

async function enforceSkillCap(agentId: number): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { count } = await supabase
    .from('agent_skills')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', agentId);

  if (count == null || count < MAX_SKILLS_PER_AGENT) return;

  const { data: leastUsed } = await supabase
    .from('agent_skills')
    .select('id')
    .eq('agent_id', agentId)
    .order('times_used', { ascending: true })
    .order('avg_pnl', { ascending: true })
    .limit(1)
    .single();

  if (leastUsed) {
    await supabase.from('agent_skills').delete().eq('id', leastUsed.id);
  }
}

export async function addSkill(
  agentId: number,
  name: string,
  code: string,
  description: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const embedding = await generateEmbedding(description);
  const embeddingId = await storeEmbedding(agentId, description, embedding);

  const { data: existing } = await supabase
    .from('agent_skills')
    .select('id, version')
    .eq('agent_id', agentId)
    .eq('name', name)
    .maybeSingle();

  if (existing) {
    const newVersion = (existing.version ?? 1) + 1;
    await supabase
      .from('agent_skills')
      .update({
        code,
        description,
        embedding_id: embeddingId,
        version: newVersion,
      })
      .eq('id', existing.id);
  } else {
    await enforceSkillCap(agentId);
    await supabase.from('agent_skills').insert({
      agent_id: agentId,
      name,
      code,
      description,
      embedding_id: embeddingId,
      success_rate: 1,
      avg_pnl: 0,
      times_used: 0,
      version: 1,
    });
  }
}

export async function retrieveSkills(
  agentId: number,
  queryText: string,
  topK: number = 3,
): Promise<SkillRecord[]> {
  const supabase = getSupabaseAdmin();

  const { data: skills } = await supabase
    .from('agent_skills')
    .select('*')
    .eq('agent_id', agentId);

  if (!skills || skills.length === 0) return [];

  const embeddingIds = skills.filter((s) => s.embedding_id).map((s) => s.embedding_id);

  if (embeddingIds.length === 0) {
    return (skills as SkillRecord[]).slice(0, topK);
  }

  try {
    const queryEmbedding = await generateEmbedding(queryText);
    const similar = await searchSimilarEmbeddings(agentId, queryEmbedding, topK * 2);
    const similarIds = new Set(similar.map((s) => s.id));
    const ranked = skills
      .filter((s) => s.embedding_id && similarIds.has(s.embedding_id))
      .sort((a, b) => b.success_rate * b.avg_pnl - a.success_rate * a.avg_pnl);
    return ranked.slice(0, topK) as SkillRecord[];
  } catch {
    return (skills as SkillRecord[])
      .sort((a, b) => b.success_rate - a.success_rate)
      .slice(0, topK);
  }
}

export async function maybeLearnSkill(
  agentId: number,
  decision: AgentDecision,
  result: ExecutionResult,
): Promise<void> {
  if (result.realizedPnl < MIN_PNL_FOR_SKILL) return;

  const description = await generateSkillDescription(decision, result);
  const skillName = generateSkillName(decision);

  const supabase = getSupabaseAdmin();
  const embedding = await generateEmbedding(description);
  const embeddingId = await storeEmbedding(agentId, description, embedding);

  const { data: existing } = await supabase
    .from('agent_skills')
    .select('id, times_used, avg_pnl, success_rate, version')
    .eq('agent_id', agentId)
    .eq('name', skillName)
    .maybeSingle();

  if (existing) {
    const newTimesUsed = existing.times_used + 1;
    const newAvgPnl =
      (existing.avg_pnl * existing.times_used + result.realizedPnl) / newTimesUsed;
    const newSuccessRate =
      result.realizedPnl > 0
        ? (existing.success_rate * existing.times_used + 1) / newTimesUsed
        : (existing.success_rate * existing.times_used) / newTimesUsed;

    await supabase
      .from('agent_skills')
      .update({
        times_used: newTimesUsed,
        avg_pnl: newAvgPnl,
        success_rate: newSuccessRate,
        version: (existing.version ?? 1) + 1,
        embedding_id: embeddingId,
      })
      .eq('id', existing.id);
  } else {
    await enforceSkillCap(agentId);
    await supabase.from('agent_skills').insert({
      agent_id: agentId,
      name: skillName,
      code: JSON.stringify(decision.params),
      description,
      embedding_id: embeddingId,
      success_rate: 1,
      avg_pnl: result.realizedPnl,
      times_used: 1,
    });
  }

  console.log(`[SkillManager] Agent ${agentId} learned skill: ${skillName}`);
}
