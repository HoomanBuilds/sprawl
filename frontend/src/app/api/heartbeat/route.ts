import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAddress } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { checkAchievements } from "@/lib/achievements";

const HEARTBEAT_XP = 10;

interface HeartbeatBody {
  agentId?: number;
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function isoWeekStart(): Date {
  const now = new Date();
  const start = new Date(now);
  const dayOfWeek = now.getDay();
  start.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
  start.setHours(0, 0, 0, 0);
  return start;
}

export async function POST(req: NextRequest) {
  try {
    const address = await getAuthenticatedAddress();
    if (!address) {
      return NextResponse.json({ error: "Connect wallet first" }, { status: 401 });
    }

    const body = (await req.json()) as HeartbeatBody;
    const { agentId } = body;
    if (typeof agentId !== "number") {
      return NextResponse.json({ error: "Missing agentId" }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    const { data: agent } = await sb
      .from("agents")
      .select(
        "agent_id, name, owner_address, total_volume, weekly_volume, weekly_start_date, strategy_count, reputation_score, reputation_given, profit_streak, app_streak, last_heartbeat_date, raid_xp, recent_actions"
      )
      .eq("agent_id", agentId)
      .single();

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if ((agent.owner_address ?? "").toLowerCase() !== address.toLowerCase()) {
      return NextResponse.json(
        { error: "You do not own this agent" },
        { status: 403 }
      );
    }

    const today = todayStr();
    const alreadyToday = agent.last_heartbeat_date === today;

    // On-chain activity proxy: any trade in the last 24h.
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentTrades } = await sb
      .from("trade_history")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .gte("created_at", dayAgo);

    const activeToday = (recentTrades ?? 0) > 0;

    let streak = agent.app_streak ?? 0;
    let checkedIn = false;
    let xpResult: { granted: number; new_total: number; new_level: number } | null = null;

    if (!alreadyToday) {
      if (activeToday) {
        const last = agent.last_heartbeat_date
          ? new Date(agent.last_heartbeat_date as string)
          : null;
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];
        streak = last && agent.last_heartbeat_date === yesterday ? streak + 1 : 1;
      } else {
        // No on-chain activity in 24h — streak resets.
        streak = 0;
      }

      await sb
        .from("agents")
        .update({ app_streak: streak, last_heartbeat_date: today })
        .eq("agent_id", agentId);

      checkedIn = true;

      if (activeToday) {
        const { data: xpData } = await sb.rpc("grant_xp", {
          p_agent_id: agentId,
          p_source: "heartbeat",
          p_amount: HEARTBEAT_XP,
        });
        if (xpData)
          xpResult = xpData as { granted: number; new_total: number; new_level: number };
      }

      await sb.from("activity_feed").insert({
        event_type: "heartbeat",
        actor_id: agentId,
        metadata: { agent_name: agent.name, streak, active: activeToday },
      });
    }

    // Refresh weekly_volume from trade_history if a new ISO week has started.
    const weekStart = isoWeekStart();
    const weekStartStr = weekStart.toISOString().split("T")[0];
    if (agent.weekly_start_date !== weekStartStr) {
      const { data: trades } = await sb
        .from("trade_history")
        .select("amount_in")
        .eq("agent_id", agentId)
        .gte("created_at", weekStart.toISOString());

      const weeklyVolume = (trades ?? []).reduce(
        (sum, t) => sum + (Number(t.amount_in) || 0),
        0
      );

      await sb
        .from("agents")
        .update({ weekly_volume: weeklyVolume, weekly_start_date: weekStartStr })
        .eq("agent_id", agentId);
    }

    const newAchievements = await checkAchievements(
      agentId,
      {
        total_trades: agent.recent_actions ?? 0,
        protocols_used: agent.strategy_count ?? 0,
        reputation_score: agent.reputation_score ?? 0,
        agents_spawned: 0,
        reputation_given: agent.reputation_given ?? 0,
        gifts_sent: 0,
        gifts_received: 0,
        profit_streak: streak,
        raid_xp: agent.raid_xp ?? 0,
      },
      agent.name ?? undefined
    );

    return NextResponse.json({
      ok: true,
      checked_in: checkedIn,
      already_today: alreadyToday,
      active: activeToday,
      streak,
      xp: xpResult,
      new_achievements: newAchievements,
    });
  } catch (error) {
    console.error("Heartbeat error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Heartbeat failed: ${message}` },
      { status: 500 }
    );
  }
}
