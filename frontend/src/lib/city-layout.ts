import type { AgentRecord } from "@/types/agent";
import type { CityBuilding } from "@/types/city";

// ─── Spiral Coordinate (copied from git-city) ─────────────────

function spiralCoord(index: number): [number, number] {
  if (index === 0) return [0, 0];
  let x = 0,
    y = 0,
    dx = 1,
    dy = 0;
  let segLen = 1,
    segPassed = 0,
    turns = 0;
  for (let i = 0; i < index; i++) {
    x += dx;
    y += dy;
    segPassed++;
    if (segPassed === segLen) {
      segPassed = 0;
      const tmp = dx;
      dx = -dy;
      dy = tmp;
      turns++;
      if (turns % 2 === 0) segLen++;
    }
  }
  return [x, y];
}

// ─── Seeded Random (copied from git-city) ──────────────────────

export function seededRandom(seed: number): number {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ─── City Layout Constants (from git-city) ─────────────────────

const BLOCK_SIZE = 4;
const LOT_W = 38;
const LOT_D = 32;
const ALLEY_W = 3;
const STREET_W = 12;

const BLOCK_FOOTPRINT_X = BLOCK_SIZE * LOT_W + (BLOCK_SIZE - 1) * ALLEY_W; // 161
const BLOCK_FOOTPRINT_Z = BLOCK_SIZE * LOT_D + (BLOCK_SIZE - 1) * ALLEY_W; // 137

const MAX_BUILDING_HEIGHT = 600;
const MIN_BUILDING_HEIGHT = 35;
const HEIGHT_RANGE = MAX_BUILDING_HEIGHT - MIN_BUILDING_HEIGHT; // 565

// Floor + window derivation (design doc Appendix B.3)
const FLOOR_HEIGHT = 6;
const WINDOW_SPACING = 6;

// ─── Building Dimension Formulas (Sprawl-specific) ─────────────
// Reference: Design doc Section 1.7 + Appendix B.3

const MAX_SPRAWL_EARNED = 100_000;

// Height: driven by cumulative $SPRAWL earned (primary), level, raid wins.
// Design doc Section 1.7: Math.pow(sprawlEarnedNorm, 0.45)*0.50 +
//   Math.pow(levelNorm, 0.50)*0.25 + Math.pow(raidNorm, 0.55)*0.25
export function computeBuildingHeight(agent: AgentRecord): number {
  const sprawlNorm = Math.min(agent.sprawl_lifetime_earned / MAX_SPRAWL_EARNED, 1);
  const levelNorm = agent.xp_level / 25;
  const raidNorm = Math.min(agent.raid_wins / 100, 1);

  const composite =
    Math.pow(sprawlNorm, 0.45) * 0.5 +
    Math.pow(levelNorm, 0.5) * 0.25 +
    Math.pow(raidNorm, 0.55) * 0.25;

  return Math.min(
    MAX_BUILDING_HEIGHT,
    MIN_BUILDING_HEIGHT + composite * HEIGHT_RANGE
  );
}

// Width: strategy breadth (strategy_count) with deterministic jitter. → 14-38
export function computeBuildingWidth(agent: AgentRecord): number {
  const stratNorm = Math.min(agent.strategy_count / 10, 1);
  const jitter = (seededRandom(agent.agent_id * 7919) - 0.5) * 4;
  return Math.round(14 + Math.pow(stratNorm, 0.5) * 24 + jitter);
}

// Depth: activity (recent_actions) + level breadth. → 12-32
// Reference: Design doc Appendix B.3
export function computeBuildingDepth(agent: AgentRecord): number {
  const strategyNorm = Math.min(agent.strategy_count / 10, 1);
  const levelNorm = agent.xp_level / 25;
  const score =
    Math.pow(strategyNorm, 0.5) * 0.6 + Math.pow(levelNorm, 0.5) * 0.4;
  const jitter = seededRandom(agent.agent_id) * 4 - 2; // ±2 deterministic
  return Math.round(12 + score * 20 + jitter);
}

// Glow: reputation_score normalized 0-1 (from ERC-8004)
export function computeGlow(agent: AgentRecord): number {
  return Math.max(0, Math.min(1, agent.reputation_score / 100));
}

// Lit percentage: recency of last action. → 0.05-0.95
export function computeLitPercentage(agent: AgentRecord): number {
  const lastAction = agent.last_action_at
    ? new Date(agent.last_action_at).getTime()
    : 0;
  const hoursSinceAction = (Date.now() - lastAction) / 3_600_000;
  return Math.max(0.05, Math.min(0.95, 1 - hoursSinceAction / 48));
}

// Tint: green = profitable, red = losing, gray = neutral. RGBA.
export function computeBuildingTint(
  agent: AgentRecord
): [number, number, number, number] {
  if (agent.net_pnl > 0) return [0.2, 1.0, 0.3, 0.5]; // green = profitable
  if (agent.net_pnl < 0) return [1.0, 0.2, 0.2, 0.5]; // red = losing
  return [0.5, 0.5, 0.5, 0.3]; // neutral gray
}

// ─── District Mapping (Sprawl: DeFi categories) ───────────────

export const DISTRICT_NAMES: Record<string, string> = {
  downtown: "Downtown",
  yield: "Yield District",
  trading: "Trading Floor",
  arbitrage: "Arb Alley",
  degen: "Degen Row",
  balanced: "Balanced Block",
};

export const DISTRICT_COLORS: Record<string, string> = {
  downtown: "#fbbf24",
  yield: "#22c55e",
  trading: "#3b82f6",
  arbitrage: "#06b6d4",
  degen: "#ef4444",
  balanced: "#a855f7",
};

const STRATEGY_TO_DISTRICT: Record<number, string> = {
  0: "yield", // Conservative Yield preset
  1: "trading", // Momentum Trader preset (rules-based)
  2: "degen", // LLM-driven (unpredictable = degen)
};

export function inferDistrict(agent: AgentRecord): string {
  if (agent.district) return agent.district;
  return STRATEGY_TO_DISTRICT[agent.strategy_type] ?? "balanced";
}

// ─── City Layout Generator ─────────────────────────────────────
// Adapted from git-city's generateCityLayout().
// Same spiral placement + block grid. Different building dimension inputs.

export function generateCityLayout(agents: AgentRecord[]): {
  buildings: CityBuilding[];
} {
  const buildings: CityBuilding[] = [];

  // Sort by composite height score (biggest buildings at center)
  const sorted = [...agents].sort(
    (a, b) => computeBuildingHeight(b) - computeBuildingHeight(a)
  );

  const LOTS_PER_BLOCK = BLOCK_SIZE * BLOCK_SIZE; // 16
  const totalBlocks = Math.ceil(sorted.length / LOTS_PER_BLOCK);

  for (let blockIdx = 0; blockIdx < totalBlocks; blockIdx++) {
    const [bx, bz] = spiralCoord(blockIdx);
    const blockWorldX = bx * (BLOCK_FOOTPRINT_X + STREET_W);
    const blockWorldZ = bz * (BLOCK_FOOTPRINT_Z + STREET_W);

    for (let lot = 0; lot < LOTS_PER_BLOCK; lot++) {
      const agentIdx = blockIdx * LOTS_PER_BLOCK + lot;
      if (agentIdx >= sorted.length) break;

      const agent = sorted[agentIdx];
      const lotRow = Math.floor(lot / BLOCK_SIZE);
      const lotCol = lot % BLOCK_SIZE;
      const x = blockWorldX + lotCol * (LOT_W + ALLEY_W);
      const z = blockWorldZ + lotRow * (LOT_D + ALLEY_W);

      const height = computeBuildingHeight(agent);
      const width = computeBuildingWidth(agent);
      const depth = computeBuildingDepth(agent);
      const litPercentage = computeLitPercentage(agent);
      const tint = computeBuildingTint(agent);
      const glow = computeGlow(agent);

      const floors = Math.max(2, Math.floor(height / FLOOR_HEIGHT));
      const windowsPerFloor = Math.max(2, Math.floor(width / WINDOW_SPACING));
      const sideWindowsPerFloor = Math.max(2, Math.floor(depth / WINDOW_SPACING));

      const lastAction = agent.last_action_at
        ? new Date(agent.last_action_at).getTime()
        : 0;
      const is_active = Date.now() - lastAction < 300_000; // active within 5 min

      buildings.push({
        agent_id: agent.agent_id,
        name: agent.name,
        strategy_type: agent.strategy_type,
        district: inferDistrict(agent),
        position: [x, 0, z],
        height,
        width,
        depth,
        floors,
        windowsPerFloor,
        sideWindowsPerFloor,
        litPercentage,
        tint,
        glow,
        xp_level: agent.xp_level,
        xp_total: agent.xp_total,
        sprawl_lifetime_earned: agent.sprawl_lifetime_earned,
        net_pnl: agent.net_pnl,
        raid_wins: agent.raid_wins,
        raid_losses: agent.raid_losses,
        reputation_score: agent.reputation_score,
        loadout: { crown: null, roof: null, aura: null },
        active_raid_tag: null,
        is_active,
      });
    }
  }

  return { buildings };
}
