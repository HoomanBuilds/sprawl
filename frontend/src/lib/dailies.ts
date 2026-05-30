import { getSupabaseAdmin } from "./supabase";

export interface Mission {
  id: string;
  title: string;
  description: string;
  threshold: number;
  desktopOnly?: boolean;
}

const MISSION_POOL: Mission[] = [
  { id: "heartbeat",          title: "Daily heartbeat",   description: "Check in today",                  threshold: 1 },
  { id: "give_reputation",    title: "Spread the rep",    description: "Give reputation to an agent",     threshold: 1 },
  { id: "give_reputation_3",  title: "Rep spree",         description: "Give reputation to 3 agents",     threshold: 3 },
  { id: "inspect_agent",      title: "Agent inspector",   description: "Inspect an agent's building",     threshold: 1 },
  { id: "inspect_3_agents",   title: "City explorer",     description: "Inspect 3 agent buildings",       threshold: 3 },
  { id: "trade_volume_500",   title: "Active trader",     description: "$500+ trade volume today",        threshold: 1 },
  { id: "trade_volume_2000",  title: "Whale move",        description: "$2,000+ trade volume today",      threshold: 1 },
  { id: "win_raid",           title: "Victorious",        description: "Win a raid",                      threshold: 1 },
  { id: "attempt_raid",       title: "Ready to fight",    description: "Attempt a raid",                  threshold: 1 },
  { id: "visit_shop",         title: "Window shopper",    description: "Visit the shop",                  threshold: 1 },
  { id: "check_leaderboard",  title: "Stats checker",     description: "Check the leaderboard",           threshold: 1 },
  { id: "explore_district",   title: "District hopper",   description: "Explore a different district",    threshold: 1 },
];

export const MISSIONS_BY_ID = new Map(MISSION_POOL.map((m) => [m.id, m]));

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

export function getDailyMissions(
  agentId: number,
  dateStr: string,
  isMobile = false,
): Mission[] {
  const seed = hashStr(`${dateStr}:${agentId}`);
  const rng = mulberry32(seed);

  let pool = MISSION_POOL.filter((m) => m.id !== "heartbeat");
  if (isMobile) {
    pool = pool.filter((m) => !m.desktopOnly);
  }

  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const heartbeat = MISSION_POOL.find((m) => m.id === "heartbeat")!;
  return [heartbeat, shuffled[0], shuffled[1]];
}

export function getTodayStr(): string {
  return new Date().toISOString().split("T")[0];
}

export async function trackDailyMission(
  agentId: number,
  missionId: string,
  extra?: { volume?: number },
): Promise<void> {
  try {
    const today = getTodayStr();
    const missions = getDailyMissions(agentId, today);
    const mission = missions.find((m) => m.id === missionId);
    if (!mission) return;

    if (missionId === "trade_volume_500" && (extra?.volume ?? 0) < 500) return;
    if (missionId === "trade_volume_2000" && (extra?.volume ?? 0) < 2000) return;

    const sb = getSupabaseAdmin();
    await sb.rpc("record_mission_progress", {
      p_agent_id: agentId,
      p_mission_id: missionId,
      p_threshold: mission.threshold,
      p_increment: 1,
    });

    const ids = missions.map((m) => m.id);
    const { data: rows } = await sb
      .from("daily_mission_progress")
      .select("mission_id, completed")
      .eq("agent_id", agentId)
      .eq("mission_date", today)
      .in("mission_id", ids);

    const completed = (rows ?? []).filter((r) => r.completed).length;
    if (completed >= missions.length) {
      await sb.rpc("complete_all_dailies", { p_agent_id: agentId });
    }
  } catch (err) {
    console.error("[dailies] trackDailyMission error:", err);
  }
}
