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

const MAX_BUILDING_HEIGHT = 320;
const MIN_BUILDING_HEIGHT = 30;
const HEIGHT_RANGE = MAX_BUILDING_HEIGHT - MIN_BUILDING_HEIGHT; // 290

// Floor + window derivation (design doc Appendix B.3)
const FLOOR_HEIGHT = 6;
const WINDOW_SPACING = 6;

// ─── Building Size: driven solely by current wealth ───────────
// A building's size IS the agent's current wealth — the combined USD value of
// all its assets at current prices. Height, width and depth all scale together
// off one normalized wealth score, so the whole building grows when the agent
// gets richer and shrinks when it loses money. Nothing else changes the size.

// Current wealth (USD). last_portfolio_value is the settlement baseline and
// net_pnl is the unrealized P&L since that baseline — rewritten every engine
// tick — so their sum is the live portfolio value. Both fields are wei.
export function computeWealth(agent: AgentRecord): number {
  const w =
    (Number(agent.last_portfolio_value) + Number(agent.net_pnl)) / 1e18;
  return w > 0 ? w : 0;
}

// Log-normalize wealth to 0..1 between a floor and ceiling: a fresh agent
// (~$5k) reads as a modest building, a whale (~$250k) maxes out, and the scale
// never explodes. Log keeps mid-range differences legible.
const WEALTH_FLOOR = 1_000;
const WEALTH_CEIL = 250_000;
export function wealthNorm(agent: AgentRecord): number {
  const w = Math.max(computeWealth(agent), WEALTH_FLOOR);
  const n =
    (Math.log(w) - Math.log(WEALTH_FLOOR)) /
    (Math.log(WEALTH_CEIL) - Math.log(WEALTH_FLOOR));
  return Math.max(0, Math.min(1, n));
}

const MIN_FOOTPRINT = 12;
const MAX_FOOTPRINT = 42;
const FOOTPRINT_RANGE = MAX_FOOTPRINT - MIN_FOOTPRINT;

export function computeBuildingHeight(agent: AgentRecord): number {
  return MIN_BUILDING_HEIGHT + wealthNorm(agent) * HEIGHT_RANGE;
}

export function computeBuildingWidth(agent: AgentRecord): number {
  // ±1.5 deterministic jitter so equally-wealthy buildings aren't identical;
  // purely cosmetic, never enough to reorder buildings by size.
  const jitter = (seededRandom(agent.agent_id * 7919) - 0.5) * 3;
  return Math.max(
    8,
    Math.round(MIN_FOOTPRINT + wealthNorm(agent) * FOOTPRINT_RANGE + jitter)
  );
}

export function computeBuildingDepth(agent: AgentRecord): number {
  const jitter = (seededRandom(agent.agent_id) - 0.5) * 3;
  return Math.max(
    8,
    Math.round(MIN_FOOTPRINT + wealthNorm(agent) * FOOTPRINT_RANGE + jitter)
  );
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
  const pnl = Number(agent.net_pnl); // NUMERIC comes back as a string
  if (pnl > 0) return [0.2, 1.0, 0.3, 0.5]; // green = profitable
  if (pnl < 0) return [1.0, 0.2, 0.2, 0.5]; // red = losing
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
  // Geographic zones (seeded agents use these)
  Core: "#fbbf24",
  Heights: "#22d3ee",
  Outskirts: "#22c55e",
  // Strategy districts
  downtown: "#fbbf24",
  yield: "#22c55e",
  trading: "#3b82f6",
  arbitrage: "#06b6d4",
  degen: "#ef4444",
  balanced: "#a855f7",
};

// Fallback roof color by strategy when the district has no mapped color, so
// every building still carries a distinct identity hue.
const STRATEGY_ROOF_COLORS: Record<number, string> = {
  0: "#22c55e", // conservative / yield → green
  1: "#3b82f6", // momentum / rules → blue
  2: "#ef4444", // LLM / degen → red
};

// Resolve a building's roof (district identity) color.
export function buildingRoofColor(
  district: string | undefined,
  strategyType: number,
  fallback: string
): string {
  return (
    (district ? DISTRICT_COLORS[district] : undefined) ??
    STRATEGY_ROOF_COLORS[strategyType] ??
    fallback
  );
}

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

  // Sort by current wealth so the richest, biggest buildings sit at the center.
  const sorted = [...agents].sort(
    (a, b) => computeWealth(b) - computeWealth(a)
  );

  // The wealthiest agent (tallest building) gets landmark treatment (crown + beacon).
  let landmarkId = -1;
  let topWealth = -Infinity;
  for (const a of agents) {
    const w = computeWealth(a);
    if (w > topWealth) {
      topWealth = w;
      landmarkId = a.agent_id;
    }
  }

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

      // Size is current wealth — height, width and depth scale together.
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
        avatar_url: agent.avatar_url ?? null,
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
        is_landmark: agent.agent_id === landmarkId,
      });
    }
  }

  return { buildings };
}

// ─── Streetscape Generator (roads, sidewalks, lamps, trees, cars) ─────
// Decorations are deterministic from the block grid, so the client can derive
// them from the building count alone — no API/page plumbing required. The grid
// math mirrors generateCityLayout() exactly so everything stays aligned.

const LOT_PITCH_X = LOT_W + ALLEY_W; // 41
const LOT_PITCH_Z = LOT_D + ALLEY_W; // 35
const BLOCK_STEP_X = BLOCK_FOOTPRINT_X + STREET_W; // 173 (block + surrounding street)
const BLOCK_STEP_Z = BLOCK_FOOTPRINT_Z + STREET_W; // 149

export type DecorationType =
  | "asphalt"
  | "sidewalk"
  | "roadMarking"
  | "streetLamp"
  | "tree"
  | "car";

export interface CityDecoration {
  type: DecorationType;
  position: [number, number, number];
  size?: [number, number]; // [worldX, worldZ] for flat planes
  rotation?: number; // y-rotation (cars)
  variant?: number;
}

// Build the full streetscape for a city of `buildingCount` agents. Each block
// gets an asphalt tile (fills the street gaps), a sidewalk pad (under the
// lots), corner lamps, trees, a parked car, plus dashed centre lines in any
// street it shares with an occupied neighbour (ownership dedupes shared roads).
export function generateStreetscape(buildingCount: number): CityDecoration[] {
  const out: CityDecoration[] = [];
  if (buildingCount <= 0) return out;

  const lotsPerBlock = BLOCK_SIZE * BLOCK_SIZE; // 16
  const totalBlocks = Math.ceil(buildingCount / lotsPerBlock);

  const occupied = new Set<string>();
  const blocks: { bx: number; bz: number; cx: number; cz: number }[] = [];
  for (let i = 0; i < totalBlocks; i++) {
    const [bx, bz] = spiralCoord(i);
    occupied.add(`${bx},${bz}`);
    const worldX = bx * BLOCK_STEP_X;
    const worldZ = bz * BLOCK_STEP_Z;
    // Block visual centre = midpoint of the 4x4 lot grid (matches placement).
    const cx = worldX + ((BLOCK_SIZE - 1) / 2) * LOT_PITCH_X;
    const cz = worldZ + ((BLOCK_SIZE - 1) / 2) * LOT_PITCH_Z;
    blocks.push({ bx, bz, cx, cz });
  }

  const hbx = BLOCK_FOOTPRINT_X / 2;
  const hbz = BLOCK_FOOTPRINT_Z / 2;
  const DASH = 6;
  const DASH_GAP = 7;

  // One asphalt slab covering the union of all block tiles + an outer street
  // margin, so even a single block is framed by a proper road (not a thin ring).
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const { cx, cz } of blocks) {
    minX = Math.min(minX, cx - BLOCK_STEP_X / 2);
    maxX = Math.max(maxX, cx + BLOCK_STEP_X / 2);
    minZ = Math.min(minZ, cz - BLOCK_STEP_Z / 2);
    maxZ = Math.max(maxZ, cz + BLOCK_STEP_Z / 2);
  }
  const margin = STREET_W;
  out.push({
    type: "asphalt",
    position: [(minX + maxX) / 2, 0.02, (minZ + maxZ) / 2],
    size: [maxX - minX + margin * 2, maxZ - minZ + margin * 2],
  });

  for (const { bx, bz, cx, cz } of blocks) {
    // Sidewalk pad sits on top, exactly covering the building lots.
    out.push({ type: "sidewalk", position: [cx, 0.06, cz], size: [BLOCK_FOOTPRINT_X, BLOCK_FOOTPRINT_Z] });

    // Lamps at the four block corners.
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        out.push({ type: "streetLamp", position: [cx + sx * hbx, 0, cz + sz * hbz] });
      }
    }

    const seed = Math.abs((bx * 73856093) ^ (bz * 19349663)) + 1;

    // Trees along the front/back curb.
    const treeCount = 2 + Math.floor(seededRandom(seed) * 3);
    for (let t = 0; t < treeCount; t++) {
      const along = (seededRandom(seed + t * 17) - 0.5) * BLOCK_FOOTPRINT_X * 0.9;
      const side = seededRandom(seed + t * 31) < 0.5 ? -1 : 1;
      out.push({
        type: "tree",
        position: [cx + along, 0, cz + side * (hbz + 4)],
        variant: Math.floor(seededRandom(seed + t * 5) * 3),
      });
    }

    // A parked car or two along a side curb.
    const carCount = 1 + Math.floor(seededRandom(seed + 7) * 2);
    for (let c = 0; c < carCount; c++) {
      const along = (seededRandom(seed + c * 53) - 0.5) * BLOCK_FOOTPRINT_Z * 0.8;
      const side = seededRandom(seed + c * 91) < 0.5 ? -1 : 1;
      out.push({
        type: "car",
        position: [cx + side * (hbx + 4), 0.0, cz + along],
        rotation: Math.PI / 2,
        variant: Math.floor(seededRandom(seed + c * 13) * 4),
      });
    }

    // Dashed centre lines in shared streets. The block on the -X / -Z side
    // owns the line so each shared street is drawn exactly once.
    if (occupied.has(`${bx + 1},${bz}`)) {
      const mx = cx + BLOCK_STEP_X / 2;
      for (let z = cz - hbz; z <= cz + hbz; z += DASH + DASH_GAP) {
        out.push({ type: "roadMarking", position: [mx, 0.08, z], size: [1.4, DASH] });
      }
    }
    if (occupied.has(`${bx},${bz + 1}`)) {
      const mz = cz + BLOCK_STEP_Z / 2;
      for (let x = cx - hbx; x <= cx + hbx; x += DASH + DASH_GAP) {
        out.push({ type: "roadMarking", position: [x, 0.08, mz], size: [DASH, 1.4] });
      }
    }
  }

  return out;
}
