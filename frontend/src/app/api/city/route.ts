import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateCityLayout } from "@/lib/city-layout";
import type { AgentRecord } from "@/types/agent";

// The agents table (migration 001) has no `loadout` JSONB column, so we do not
// select it — Supabase errors on unknown columns. Loadout defaults to empty.
// raid_tags is keyed by `building_agent_id` (migration 011), not `agent_id`.

const AGENT_COLUMNS =
  "agent_id, wallet_address, owner_address, name, avatar_url, persona, strategy_type, " +
  "policy_config, sprawl_balance, sprawl_lifetime_earned, sprawl_lifetime_spent, " +
  "last_portfolio_value, total_volume, strategy_count, recent_actions, " +
  "reputation_score, xp_total, xp_level, xp_daily, raid_xp, raid_wins, " +
  "raid_losses, app_streak, weekly_volume, profit_streak, reputation_given, " +
  "district, net_pnl, created_at, last_action_at";

export async function GET() {
  const sb = getSupabaseAdmin();

  // Round 1: fetch agents (biggest by volume first)
  const agentsResult = await sb
    .from("agents")
    .select(AGENT_COLUMNS)
    .order("total_volume", { ascending: false })
    .limit(2000);

  if (agentsResult.error) {
    console.error("Error fetching agents:", agentsResult.error);
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
  }

  const agents = (agentsResult.data ?? []) as unknown as AgentRecord[];

  // Compute city stats inline (no city_stats table exists).
  const stats = {
    total_agents: agents.length,
    total_volume: agents.reduce((sum, a) => sum + Number(a.total_volume ?? 0), 0),
    avg_level:
      agents.length > 0
        ? agents.reduce((sum, a) => sum + Number(a.xp_level ?? 0), 0) / agents.length
        : 0,
  };

  // No caching: building sizes track live wealth, so the client must always see
  // the latest engine tick (the page polls this every 20s).
  const headers = {
    "Cache-Control": "no-store",
  };

  if (agents.length === 0) {
    return NextResponse.json({ buildings: [], stats }, { headers });
  }

  const agentIds = agents.map((a) => a.agent_id);

  // Round 2: fetch active raid tags (keyed by building_agent_id).
  const raidTagsResult = await sb
    .from("raid_tags")
    .select("building_agent_id, attacker_name, tag_style, expires_at")
    .in("building_agent_id", agentIds)
    .eq("active", true);

  const raidTagMap: Record<
    number,
    { attacker_name: string; tag_style: string; expires_at: string }
  > = {};
  for (const row of raidTagsResult.data ?? []) {
    raidTagMap[row.building_agent_id] = {
      attacker_name: row.attacker_name ?? "Unknown",
      tag_style: row.tag_style ?? "neon",
      expires_at: row.expires_at,
    };
  }

  // Generate the layout server-side (spiral placement + dimension formulas).
  const { buildings } = generateCityLayout(agents);

  // Attach raid tags (loadout already defaulted via the layout engine).
  for (const b of buildings) {
    b.active_raid_tag = raidTagMap[b.agent_id] ?? null;
  }

  return NextResponse.json({ buildings, stats }, { headers });
}
