import { getSupabaseAdmin } from "./supabase";
import { xpForAchievementTier } from "./xp";

export interface Achievement {
  id: string;
  category: string;
  name: string;
  description: string;
  threshold: number;
  tier: "bronze" | "silver" | "gold" | "diamond";
  reward_type: "unlock_item" | "exclusive_badge";
  reward_item_id: string | null;
  sort_order: number;
}

export interface AgentAchievement {
  agent_id: number;
  achievement_id: string;
  unlocked_at: string;
  seen: boolean;
}

export const TIER_COLORS: Record<string, string> = {
  bronze: "#cd7f32",
  silver: "#c0c0c0",
  gold: "#ffd700",
  diamond: "#b9f2ff",
};

export const TIER_EMOJI: Record<string, string> = {
  bronze: "\u{1F7E4}",
  silver: "\u{26AA}",
  gold: "\u{1F7E1}",
  diamond: "\u{1F48E}",
};

export const TIER_ORDER: Record<string, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  diamond: 3,
};

interface AgentStats {
  total_trades: number;
  protocols_used: number;
  reputation_score: number;
  agents_spawned: number;
  reputation_given: number;
  gifts_sent: number;
  gifts_received: number;
  profit_streak?: number;
  reputation_streak?: number;
  raid_xp?: number;
  purchases?: number;
  dailies_completed?: number;
}

export async function checkAchievements(
  agentId: number,
  stats: AgentStats,
  agentName?: string
): Promise<string[]> {
  const sb = getSupabaseAdmin();

  const [allRes, unlockedRes] = await Promise.all([
    sb.from("achievements").select("id, category, threshold, tier, name, reward_type, reward_item_id"),
    sb
      .from("agent_achievements")
      .select("achievement_id")
      .eq("agent_id", agentId),
  ]);

  const unlocked = new Set(
    (unlockedRes.data ?? []).map((r) => r.achievement_id)
  );
  const eligible = (allRes.data ?? []).filter(
    (a) => !unlocked.has(a.id)
  ) as Achievement[];

  const newUnlocks = eligible.filter((a) => {
    switch (a.category) {
      case "trades":
        return stats.total_trades >= a.threshold;
      case "protocols":
        return stats.protocols_used >= a.threshold;
      case "reputation":
        return stats.reputation_score >= a.threshold;
      case "agents_spawned":
        return stats.agents_spawned >= a.threshold;
      case "reputation_given":
        return stats.reputation_given >= a.threshold;
      case "gifts_sent":
        return stats.gifts_sent >= a.threshold;
      case "gifts_received":
        return stats.gifts_received >= a.threshold;
      case "profit_streak":
        return (stats.profit_streak ?? 0) >= a.threshold;
      case "reputation_streak":
        return (stats.reputation_streak ?? 0) >= a.threshold;
      case "raid":
        return (stats.raid_xp ?? 0) >= a.threshold;
      case "purchases":
        return (stats.purchases ?? 0) >= a.threshold;
      case "dailies":
        return (stats.dailies_completed ?? 0) >= a.threshold;
      default:
        return false;
    }
  });

  if (newUnlocks.length === 0) return [];

  const unlockRows = newUnlocks.map((a) => ({
    agent_id: agentId,
    achievement_id: a.id,
  }));

  await sb
    .from("agent_achievements")
    .upsert(unlockRows, { onConflict: "agent_id,achievement_id" });

  const itemRewards = newUnlocks.filter(
    (a) => a.reward_type === "unlock_item" && a.reward_item_id
  );

  if (itemRewards.length > 0) {
    const purchaseRows = itemRewards.map((a) => ({
      agent_id: agentId,
      item_id: a.reward_item_id!,
      provider: "achievement",
      provider_tx_id: `achievement_${agentId}_${a.id}`,
      amount_cents: 0,
      currency: "usd",
      status: "completed",
    }));

    await sb
      .from("purchases")
      .upsert(purchaseRows, { onConflict: "agent_id,item_id" });
  }

  for (const a of newUnlocks) {
    const xpAmount = xpForAchievementTier(a.tier);
    if (xpAmount > 0) {
      sb.rpc("grant_xp", {
        p_agent_id: agentId,
        p_source: "achievement",
        p_amount: xpAmount,
      }).then();
    }
  }

  if (newUnlocks.length === 1) {
    const a = newUnlocks[0];
    await sb.from("activity_feed").insert({
      event_type: "achievement_unlocked",
      actor_id: agentId,
      metadata: {
        agent_name: agentName,
        achievement_id: a.id,
        achievement_name: a.name,
        tier: a.tier,
      },
    });
  } else {
    await sb.from("activity_feed").insert({
      event_type: "achievement_unlocked",
      actor_id: agentId,
      metadata: {
        agent_name: agentName,
        count: newUnlocks.length,
        achievements: newUnlocks.map((a) => ({
          id: a.id,
          name: a.name,
          tier: a.tier,
        })),
      },
    });
  }

  return newUnlocks.map((a) => a.id);
}

const CHUNK_SIZE = 500;

export async function getAchievementsForAgents(
  agentIds: number[]
): Promise<Record<number, string[]>> {
  if (agentIds.length === 0) return {};

  const sb = getSupabaseAdmin();

  const chunks: number[][] = [];
  for (let i = 0; i < agentIds.length; i += CHUNK_SIZE) {
    chunks.push(agentIds.slice(i, i + CHUNK_SIZE));
  }

  const rows = (
    await Promise.all(
      chunks.map((chunk) =>
        sb
          .from("agent_achievements")
          .select("agent_id, achievement_id")
          .in("agent_id", chunk)
          .then(({ data }) => data ?? [])
      )
    )
  ).flat();

  const result: Record<number, string[]> = {};
  for (const row of rows) {
    if (!result[row.agent_id]) result[row.agent_id] = [];
    result[row.agent_id].push(row.achievement_id);
  }
  return result;
}
