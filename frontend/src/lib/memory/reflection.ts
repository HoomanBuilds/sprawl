import { getSupabaseAdmin } from '@/lib/supabase';
import { addMemory, getRecentMemories } from './memory-stream';
import { retrieveMemories } from './retrieval';
import type { AgentRecord } from '@/types/agent';

const POIGNANCY_THRESHOLD = 150;

async function callLLM(prompt: string): Promise<string> {
  // Placeholder — will be wired to DeepSeek chat API later
  return JSON.stringify(['What patterns have I seen in my recent trades?']);
}

async function generateFocalPoints(
  recentDescriptions: string[],
): Promise<string[]> {
  const statements = recentDescriptions.slice(0, 20).join('\n');

  const prompt = `You are a DeFi trading agent reflecting on recent experiences. Given the statements below, identify 3 high-level questions or topics worth reflecting on. Return ONLY a JSON array of 3 strings.

Recent experiences:
${statements}

What 3 high-level insights or questions arise from these?`;

  const content = await callLLM(prompt);

  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed.slice(0, 3);
  } catch {
    // fallback: split by newlines
  }

  const lines = content
    .split('\n')
    .filter((s: string) => s.trim())
    .slice(0, 3);
  if (lines.length > 0) return lines;

  return [
    'What patterns have I seen in my recent trades?',
    'What market conditions have been most favorable?',
    'What mistakes should I avoid repeating?',
  ];
}

async function generateInsight(
  focalPoint: string,
  evidenceDescriptions: string[],
): Promise<{ insight: string; poignancy: number }> {
  const statements = evidenceDescriptions
    .map((d, i) => `${i + 1}. ${d}`)
    .join('\n');

  const prompt = `You are a DeFi trading agent synthesizing insights from your experiences. Given evidence statements and a focal question, produce ONE concise insight (1-2 sentences). Also rate its importance 1-10. Return JSON: {"insight": "...", "poignancy": N}

Focal question: ${focalPoint}

Evidence:
${statements}`;

  const content = await callLLM(prompt);

  try {
    const parsed = JSON.parse(content);
    if (parsed.insight && typeof parsed.poignancy === 'number') return parsed;
  } catch {
    // fallback
  }

  return { insight: `Reflection on: ${focalPoint}`, poignancy: 5 };
}

export function shouldReflect(agent: AgentRecord): boolean {
  return agent.poignancy_accumulator >= POIGNANCY_THRESHOLD;
}

export async function reflect(agent: AgentRecord): Promise<void> {
  const supabase = getSupabaseAdmin();

  const recentMemories = await getRecentMemories(agent.agent_id, 30);
  if (recentMemories.length < 5) return;

  const descriptions = recentMemories.map((m) => m.description);
  const focalPoints = await generateFocalPoints(descriptions);

  for (const focalPoint of focalPoints) {
    const retrieved = await retrieveMemories(agent.agent_id, focalPoint, {
      topK: 10,
      overfetch: 30,
    });

    if (retrieved.length < 3) continue;

    const { insight, poignancy } = await generateInsight(
      focalPoint,
      retrieved.map((m) => m.description),
    );

    await addMemory(agent.agent_id, {
      type: 'reflection',
      description: insight,
      poignancy,
      keywords: ['reflection', ...focalPoint.split(' ').slice(0, 3)],
      evidence: retrieved.map((m) => m.id),
      depth: 1,
    });
  }

  await supabase
    .from('agents')
    .update({ poignancy_accumulator: 0 })
    .eq('agent_id', agent.agent_id);
}
