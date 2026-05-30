# Phase 6: Raids + XP + Achievements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Dependency:** Phase 1 Task 13 (`recordRaid(attackerId, defenderId, attackerWon)` method on CityState contract) must be completed before Task 7 (raid execute route) can record results on-chain.

**Goal:** Port the entire gamification layer from git-city (XP leveling, raid PvP, achievements, daily missions) into Sprawl, remapping all GitHub-centric inputs to on-chain DeFi agent metrics. By the end, agents earn XP from trading activity, raid each other for reputation, unlock achievements based on volume/protocols/reputation, and complete daily missions.

**Architecture:** All lib files are pure TypeScript in `frontend/src/lib/`. API routes are Next.js App Router handlers. Supabase migrations extend the existing `agents` table and add `raids`, `raid_tags`, `xp_log`, and `daily_mission_progress` tables.

**Tech Stack:** TypeScript, Supabase (Postgres RPCs + RLS), Next.js 16 API routes, ethers v5 (for on-chain raid recording)

**Design doc reference:** `docs/plans/2026-05-30-sprawl-protocol-implementation-plan.md` — Sections 6.1 through 6.3 (lines 1415-1469). Copy/adapt table at lines 1536-1548.

---

### Task 1: Copy and adapt xp.ts from git-city

**Files:**
- Create: `frontend/src/lib/xp.ts`

**Step 1: Copy `inspiration/git-city/src/lib/xp.ts` and rename tiers**

The tier IDs and names change, everything else (formulas, daily cap, rank calculation) stays identical.

Before (git-city):
```typescript
export const XP_TIERS: XpTier[] = [
  { id: "localhost", name: "Localhost", color: "#4ade80", minLevel: 1, maxLevel: 4 },
  { id: "staging", name: "Staging", color: "#60a5fa", minLevel: 5, maxLevel: 8 },
  { id: "production", name: "Production", color: "#a78bfa", minLevel: 9, maxLevel: 13 },
  { id: "open_source", name: "Open Source", color: "#fbbf24", minLevel: 14, maxLevel: 18 },
  { id: "unicorn", name: "Unicorn", color: "#22d3ee", minLevel: 19, maxLevel: 23 },
  { id: "founder", name: "Founder", color: "#ffffff", minLevel: 24, maxLevel: 999 },
];
```

After (Sprawl):
```typescript
export const XP_TIERS: XpTier[] = [
  { id: "testnet", name: "Testnet", color: "#4ade80", minLevel: 1, maxLevel: 4 },
  { id: "devnet", name: "Devnet", color: "#60a5fa", minLevel: 5, maxLevel: 8 },
  { id: "mainnet", name: "Mainnet", color: "#a78bfa", minLevel: 9, maxLevel: 13 },
  { id: "protocol", name: "Protocol", color: "#fbbf24", minLevel: 14, maxLevel: 18 },
  { id: "whale", name: "Whale", color: "#22d3ee", minLevel: 19, maxLevel: 23 },
  { id: "sovereign", name: "Sovereign", color: "#ffffff", minLevel: 24, maxLevel: 999 },
];
```

**Step 2: Rename rank titles from dev-themed to DeFi-trader-themed**

Before (git-city):
```typescript
const RANK_TITLES: [number, string][] = [
  [1, "Hello World"],
  [2, "Console.log"],
  [3, "First Commit"],
  [4, "Bug Hunter"],
  [5, "Pull Request"],
  [6, "Code Review"],
  [7, "Merge Conflict"],
  [8, "CI/CD"],
  [9, "Deployed"],
  [10, "On-Call"],
  [11, "Hotfix"],
  [12, "Tech Lead"],
  [13, "Architect"],
  [14, "Maintainer"],
  [15, "Contributor"],
  [16, "Core Team"],
  [17, "RFC Author"],
  [18, "Star Project"],
  [19, "Distinguished"],
  [20, "Principal"],
  [21, "Fellow"],
  [22, "10x Engineer"],
  [23, "Unicorn"],
  [24, "Founder"],
  [25, "Legend"],
];
```

After (Sprawl):
```typescript
const RANK_TITLES: [number, string][] = [
  [1, "Paper Trader"],
  [2, "Limit Order"],
  [3, "First Swap"],
  [4, "Yield Farmer"],
  [5, "Liquidity Scout"],
  [6, "Pool Shark"],
  [7, "Impermanent Loss"],
  [8, "MEV Aware"],
  [9, "On-Chain"],
  [10, "Market Maker"],
  [11, "Flash Loan"],
  [12, "Desk Lead"],
  [13, "Strategist"],
  [14, "Protocol Native"],
  [15, "LP Veteran"],
  [16, "Inner Circle"],
  [17, "Governance Author"],
  [18, "Blue Chip"],
  [19, "Distinguished"],
  [20, "Principal"],
  [21, "Quant Fellow"],
  [22, "10x Alpha"],
  [23, "Whale"],
  [24, "Sovereign"],
  [25, "Legend"],
];
```

**Step 3: Rename `calculateGithubXp` to `calculateAgentXp` and swap inputs**

Before (git-city):
```typescript
export function calculateGithubXp(dev: {
  contributions: number;
  total_stars: number;
  public_repos: number;
  total_prs: number;
}): number {
  return (
    Math.floor(Math.log2(Math.max(dev.contributions, 1) + 1) * 15) +
    Math.floor(Math.log2(Math.max(dev.total_stars, 1) + 1) * 10) +
    Math.floor(Math.log2(Math.max(dev.public_repos, 1) + 1) * 5) +
    Math.floor(Math.log2(Math.max(dev.total_prs, 1) + 1) * 8)
  );
}
```

After (Sprawl):
```typescript
export function calculateAgentXp(agent: {
  total_volume: number;
  reputation_score: number;
  strategy_count: number;
  total_trades: number;
}): number {
  return (
    Math.floor(Math.log2(Math.max(agent.total_volume, 1) + 1) * 15) +
    Math.floor(Math.log2(Math.max(agent.reputation_score, 1) + 1) * 10) +
    Math.floor(Math.log2(Math.max(agent.strategy_count, 1) + 1) * 5) +
    Math.floor(Math.log2(Math.max(agent.total_trades, 1) + 1) * 8)
  );
}
```

**Step 4: Rename `XpSourceType` entries**

Before (git-city):
```typescript
export type XpSourceType =
  | "checkin"
  | "dailies"
  | "kudos_given"
  | "visit"
  | "fly"
  | "raid_win"
  | "raid_loss"
  | "raid_defend"
  | "force_push"
  | "achievement"
  | "kudos_received"
  | "referral"
  | "gift_sent"
  | "github"
  | "survey";
```

After (Sprawl):
```typescript
export type XpSourceType =
  | "heartbeat"
  | "dailies"
  | "reputation_given"
  | "inspect"
  | "trade"
  | "raid_win"
  | "raid_loss"
  | "raid_defend"
  | "liquidation"
  | "achievement"
  | "reputation_received"
  | "spawn_referral"
  | "gift_sent"
  | "on_chain"
  | "survey";
```

Update `ENGAGEMENT_SOURCES` to match:

Before:
```typescript
export const ENGAGEMENT_SOURCES: Set<XpSourceType> = new Set([
  "checkin", "dailies", "kudos_given", "visit", "fly",
]);
```

After:
```typescript
export const ENGAGEMENT_SOURCES: Set<XpSourceType> = new Set([
  "heartbeat", "dailies", "reputation_given", "inspect", "trade",
]);
```

**Step 5: Full file**

```typescript
// frontend/src/lib/xp.ts
// Adapted from inspiration/git-city/src/lib/xp.ts
// Tier names, rank titles, and input fields remapped for Sprawl DeFi agents

export interface XpTier {
  id: string;
  name: string;
  color: string;
  minLevel: number;
  maxLevel: number;
}

export interface XpRank {
  level: number;
  title: string;
  tier: XpTier;
}

export type XpSourceType =
  | "heartbeat"
  | "dailies"
  | "reputation_given"
  | "inspect"
  | "trade"
  | "raid_win"
  | "raid_loss"
  | "raid_defend"
  | "liquidation"
  | "achievement"
  | "reputation_received"
  | "spawn_referral"
  | "gift_sent"
  | "on_chain"
  | "survey";

export const XP_TIERS: XpTier[] = [
  { id: "testnet", name: "Testnet", color: "#4ade80", minLevel: 1, maxLevel: 4 },
  { id: "devnet", name: "Devnet", color: "#60a5fa", minLevel: 5, maxLevel: 8 },
  { id: "mainnet", name: "Mainnet", color: "#a78bfa", minLevel: 9, maxLevel: 13 },
  { id: "protocol", name: "Protocol", color: "#fbbf24", minLevel: 14, maxLevel: 18 },
  { id: "whale", name: "Whale", color: "#22d3ee", minLevel: 19, maxLevel: 23 },
  { id: "sovereign", name: "Sovereign", color: "#ffffff", minLevel: 24, maxLevel: 999 },
];

const RANK_TITLES: [number, string][] = [
  [1, "Paper Trader"],
  [2, "Limit Order"],
  [3, "First Swap"],
  [4, "Yield Farmer"],
  [5, "Liquidity Scout"],
  [6, "Pool Shark"],
  [7, "Impermanent Loss"],
  [8, "MEV Aware"],
  [9, "On-Chain"],
  [10, "Market Maker"],
  [11, "Flash Loan"],
  [12, "Desk Lead"],
  [13, "Strategist"],
  [14, "Protocol Native"],
  [15, "LP Veteran"],
  [16, "Inner Circle"],
  [17, "Governance Author"],
  [18, "Blue Chip"],
  [19, "Distinguished"],
  [20, "Principal"],
  [21, "Quant Fellow"],
  [22, "10x Alpha"],
  [23, "Whale"],
  [24, "Sovereign"],
  [25, "Legend"],
];

export const XP_RANKS: XpRank[] = RANK_TITLES.map(([level, title]) => ({
  level,
  title,
  tier: XP_TIERS.find((t) => level >= t.minLevel && level <= t.maxLevel)!,
}));

export const DAILY_XP_CAP = 150;

export const ENGAGEMENT_SOURCES: Set<XpSourceType> = new Set([
  "heartbeat",
  "dailies",
  "reputation_given",
  "inspect",
  "trade",
]);

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(25 * Math.pow(level, 2.2));
}

export function xpDeltaForLevel(level: number): number {
  return xpForLevel(level + 1) - xpForLevel(level);
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) {
    level++;
  }
  return level;
}

export function tierFromLevel(level: number): XpTier {
  for (let i = XP_TIERS.length - 1; i >= 0; i--) {
    if (level >= XP_TIERS[i].minLevel) return XP_TIERS[i];
  }
  return XP_TIERS[0];
}

export function rankFromLevel(level: number): XpRank {
  if (level >= 25) {
    return { level, title: "Legend", tier: XP_TIERS[5] };
  }
  const rank = XP_RANKS.find((r) => r.level === level);
  return rank ?? { level, title: "Paper Trader", tier: XP_TIERS[0] };
}

export function levelProgress(xp: number): number {
  const level = levelFromXp(xp);
  const current = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const delta = next - current;
  if (delta <= 0) return 1;
  return Math.min(1, (xp - current) / delta);
}

export function calculateAgentXp(agent: {
  total_volume: number;
  reputation_score: number;
  strategy_count: number;
  total_trades: number;
}): number {
  return (
    Math.floor(Math.log2(Math.max(agent.total_volume, 1) + 1) * 15) +
    Math.floor(Math.log2(Math.max(agent.reputation_score, 1) + 1) * 10) +
    Math.floor(Math.log2(Math.max(agent.strategy_count, 1) + 1) * 5) +
    Math.floor(Math.log2(Math.max(agent.total_trades, 1) + 1) * 8)
  );
}

const ACHIEVEMENT_XP: Record<string, number> = {
  bronze: 10,
  silver: 25,
  gold: 50,
  diamond: 100,
};

export function xpForAchievementTier(tier: string): number {
  return ACHIEVEMENT_XP[tier] ?? 0;
}
```

**Run:**
```bash
cd frontend && npx tsc --noEmit src/lib/xp.ts
```
Expected: No type errors.

**Commit:**
```bash
git add frontend/src/lib/xp.ts
git commit -m "feat: add XP leveling system adapted from git-city with DeFi tiers"
```

---

### Task 2: Copy and adapt raid.ts from git-city

**Files:**
- Create: `frontend/src/lib/raid.ts`

**Step 1: Rename `AttackInputs` fields**

Before (git-city):
```typescript
export interface AttackInputs {
  weeklyContributions: number;
  appStreak: number;
  weeklyKudosGiven: number;
  boostBonus?: number;
}

export interface DefenseInputs {
  weeklyContributions: number;
  appStreak: number;
  weeklyKudosReceived: number;
}
```

After (Sprawl):
```typescript
export interface AttackInputs {
  weeklyVolume: number;
  profitStreak: number;
  reputationGiven: number;
  boostBonus?: number;
}

export interface DefenseInputs {
  weeklyVolume: number;
  profitStreak: number;
  reputationReceived: number;
}
```

**Step 2: Rename `ScoreBreakdown` fields**

Before:
```typescript
export interface ScoreBreakdown {
  commits: number;
  streak: number;
  kudos: number;
  boost?: number;
  boost_item?: string;
}
```

After:
```typescript
export interface ScoreBreakdown {
  volume: number;
  streak: number;
  reputation: number;
  boost?: number;
  boost_item?: string;
}
```

**Step 3: Update `calculateAttackScore` and `calculateDefenseScore`**

Before (git-city):
```typescript
export function calculateAttackScore(inputs: AttackInputs): {
  total: number;
  breakdown: ScoreBreakdown;
} {
  const commits = inputs.weeklyContributions * 3;
  const streak = inputs.appStreak * 1;
  const kudos = inputs.weeklyKudosGiven * 2;
  const boost = inputs.boostBonus ?? 0;
  return {
    total: commits + streak + kudos + boost,
    breakdown: {
      commits,
      streak,
      kudos,
      ...(boost > 0 ? { boost } : {}),
    },
  };
}
```

After (Sprawl):
```typescript
export function calculateAttackScore(inputs: AttackInputs): {
  total: number;
  breakdown: ScoreBreakdown;
} {
  const volume = inputs.weeklyVolume * 3;
  const streak = inputs.profitStreak * 1;
  const reputation = inputs.reputationGiven * 2;
  const boost = inputs.boostBonus ?? 0;
  return {
    total: volume + streak + reputation + boost,
    breakdown: {
      volume,
      streak,
      reputation,
      ...(boost > 0 ? { boost } : {}),
    },
  };
}

export function calculateDefenseScore(inputs: DefenseInputs): {
  total: number;
  breakdown: ScoreBreakdown;
} {
  const volume = inputs.weeklyVolume * 3;
  const streak = inputs.profitStreak * 1;
  const reputation = inputs.reputationReceived * 1;
  return {
    total: volume + streak + reputation,
    breakdown: { volume, streak, reputation },
  };
}
```

**Step 4: Rename response types (`login` to `agent_name`, `avatar` to `avatar_url`)**

Before (git-city `RaidPreviewResponse` / `RaidExecuteResponse`):
```typescript
  attacker_login: string;
  attacker_avatar: string | null;
  defender_login: string;
  defender_avatar: string | null;
```

After (Sprawl):
```typescript
  attacker_name: string;
  attacker_avatar: string | null;
  defender_name: string;
  defender_avatar: string | null;
```

**Step 5: Full file**

```typescript
// frontend/src/lib/raid.ts
// Adapted from inspiration/git-city/src/lib/raid.ts
// Inputs remapped: contributions->volume, appStreak->profitStreak, kudos->reputation

export const RAID_TITLES = [
  { xp: 0, title: null },
  { xp: 100, title: "Pickpocket" },
  { xp: 500, title: "Burglar" },
  { xp: 2000, title: "Heist Master" },
  { xp: 10000, title: "Kingpin" },
] as const;

export function getRaidTitle(xp: number): string | null {
  let title: string | null = null;
  for (const t of RAID_TITLES) {
    if (xp >= t.xp) title = t.title;
  }
  return title;
}

export type StrengthEstimate = "weak" | "medium" | "strong";

export function getStrengthEstimate(score: number): StrengthEstimate {
  if (score <= 15) return "weak";
  if (score <= 40) return "medium";
  return "strong";
}

export interface AttackInputs {
  weeklyVolume: number;
  profitStreak: number;
  reputationGiven: number;
  boostBonus?: number;
}

export interface DefenseInputs {
  weeklyVolume: number;
  profitStreak: number;
  reputationReceived: number;
}

export interface ScoreBreakdown {
  volume: number;
  streak: number;
  reputation: number;
  boost?: number;
  boost_item?: string;
}

export function calculateAttackScore(inputs: AttackInputs): {
  total: number;
  breakdown: ScoreBreakdown;
} {
  const volume = inputs.weeklyVolume * 3;
  const streak = inputs.profitStreak * 1;
  const reputation = inputs.reputationGiven * 2;
  const boost = inputs.boostBonus ?? 0;
  return {
    total: volume + streak + reputation + boost,
    breakdown: {
      volume,
      streak,
      reputation,
      ...(boost > 0 ? { boost } : {}),
    },
  };
}

export function calculateDefenseScore(inputs: DefenseInputs): {
  total: number;
  breakdown: ScoreBreakdown;
} {
  const volume = inputs.weeklyVolume * 3;
  const streak = inputs.profitStreak * 1;
  const reputation = inputs.reputationReceived * 1;
  return {
    total: volume + streak + reputation,
    breakdown: { volume, streak, reputation },
  };
}

export const MAX_RAIDS_PER_DAY = 3;
export const RAID_TAG_DURATION_DAYS = 3;

export function isFridayThe13th(): boolean {
  const now = new Date();
  return now.getUTCDay() === 5 && now.getUTCDate() === 13;
}

export function getEffectiveMaxRaids(): number {
  return isFridayThe13th() ? 999 : MAX_RAIDS_PER_DAY;
}

export function isWeeklyCooldownActive(): boolean {
  return !isFridayThe13th();
}

export const XP_WIN_ATTACKER = 50;
export const XP_WIN_DEFENDER = 30;
export const XP_LOSE_DEFENDER = 30;

export interface RaidVehicleOption {
  item_id: string;
  name: string;
  emoji: string;
}

export interface RaidPreviewResponse {
  can_raid: boolean;
  raids_today: number;
  raids_max: number;
  target_raided_this_week: boolean;
  special_event: "friday13" | null;
  attack_estimate: StrengthEstimate;
  defense_estimate: StrengthEstimate;
  attack_score: number;
  defense_score: number;
  attack_breakdown: ScoreBreakdown;
  defense_breakdown: ScoreBreakdown;
  attacker_name: string;
  attacker_avatar: string | null;
  defender_name: string;
  defender_avatar: string | null;
  defender_building_height: number;
  available_boosts: RaidBoostItem[];
  available_vehicles: RaidVehicleOption[];
  vehicle: string;
}

export interface RaidBoostItem {
  purchase_id: number;
  item_id: string;
  name: string;
  bonus: number;
}

export interface RaidExecuteResponse {
  raid_id: string;
  success: boolean;
  attack_score: number;
  defense_score: number;
  attack_breakdown: ScoreBreakdown;
  defense_breakdown: ScoreBreakdown;
  attacker: {
    name: string;
    avatar: string | null;
    position: [number, number, number];
    height: number;
  };
  defender: {
    name: string;
    avatar: string | null;
    position: [number, number, number];
    height: number;
  };
  xp_earned: number;
  new_raid_xp: number;
  new_title: string | null;
  new_achievements: string[];
  vehicle: string;
  tag_style: string;
  on_chain_tx?: string;
}

export interface RaidHistoryEntry {
  id: string;
  attacker_name: string;
  defender_name: string;
  success: boolean;
  created_at: string;
}

export interface RaidHistoryResponse {
  raids: RaidHistoryEntry[];
  total: number;
  active_tag: {
    attacker_name: string;
    tag_style: string;
    expires_at: string;
  } | null;
}
```

**Run:**
```bash
cd frontend && npx tsc --noEmit src/lib/raid.ts
```
Expected: No type errors.

**Commit:**
```bash
git add frontend/src/lib/raid.ts
git commit -m "feat: add raid system with DeFi scoring (volume/profit/reputation)"
```

---

### Task 3: Copy and adapt zones.ts from git-city

**Files:**
- Create: `frontend/src/lib/zones.ts`

**Step 1: Keep zone architecture (crown/roof/aura), rename achievement triggers**

The 3-zone model and item slot structure stay identical. Only achievement unlock triggers change from GitHub milestones to DeFi milestones.

Before (git-city `ACHIEVEMENT_ITEMS`):
```typescript
export const ACHIEVEMENT_ITEMS: Record<string, { achievement: string; label: string }> = {
  flag: { achievement: "first_push", label: "First Push (1+ contributions)" },
  custom_color: { achievement: "committed", label: "Committed (1,000+ contributions)" },
  neon_trim: { achievement: "grinder", label: "Grinder (2,500+ contributions)" },
  antenna_array: { achievement: "builder", label: "Builder (25+ repos)" },
  rooftop_garden: { achievement: "architect", label: "Architect (75+ repos)" },
  spotlight: { achievement: "rising_star", label: "Rising Star (100+ stars)" },
  helipad: { achievement: "recruiter", label: "Recruiter (10+ referrals)" },
  white_rabbit: { achievement: "white_rabbit", label: "Found the White Rabbit" },
};
```

After (Sprawl):
```typescript
export const ACHIEVEMENT_ITEMS: Record<string, { achievement: string; label: string }> = {
  flag: { achievement: "first_trade", label: "First Trade (1+ swaps)" },
  custom_color: { achievement: "high_volume", label: "High Volume (1,000+ trades)" },
  neon_trim: { achievement: "grinder", label: "Grinder (2,500+ trades)" },
  antenna_array: { achievement: "multi_protocol", label: "Multi-Protocol (5+ protocols)" },
  rooftop_garden: { achievement: "protocol_architect", label: "Protocol Architect (10+ protocols)" },
  spotlight: { achievement: "high_rep", label: "High Rep (80+ reputation)" },
  helipad: { achievement: "city_founder", label: "City Founder (5+ agents spawned)" },
  white_rabbit: { achievement: "white_rabbit", label: "Found the White Rabbit" },
};
```

**Step 2: Rename raid vehicle display names to DeFi-themed**

Before (git-city `ITEM_NAMES` raid vehicles):
```typescript
  raid_helicopter: "Mech Keyboard",
  raid_drone: "PC Tower",
  raid_rocket: "Hacker Rig",
```

After (Sprawl):
```typescript
  raid_helicopter: "Flash Bot",
  raid_drone: "Sniper Bot",
  raid_rocket: "Liquidator",
```

**Step 3: Full file**

```typescript
// frontend/src/lib/zones.ts
// Adapted from inspiration/git-city/src/lib/zones.ts
// Zone architecture kept, achievement triggers remapped to DeFi milestones

export const ZONE_ITEMS: Record<string, string[]> = {
  crown: ["flag", "helipad", "spire", "satellite_dish", "crown_item", "top_trader"],
  roof: ["antenna_array", "rooftop_garden", "rooftop_fire", "pool_party"],
  aura: ["neon_trim", "spotlight", "hologram_ring", "lightning_aura", "neon_outline", "particle_aura"],
};

export const ZONE_LABELS: Record<string, string> = {
  crown: "Crown",
  roof: "Roof",
  aura: "Aura",
};

export const ITEM_NAMES: Record<string, string> = {
  flag: "Flag",
  helipad: "Helipad",
  spire: "Water Tower",
  satellite_dish: "Satellite Dish",
  crown_item: "Crown",
  antenna_array: "Solar Panels",
  rooftop_garden: "Rooftop Garden",
  rooftop_fire: "Rooftop Fire",
  pool_party: "Pool Party",
  neon_trim: "Neon Trim",
  spotlight: "Spotlight",
  hologram_ring: "Hologram Ring",
  lightning_aura: "Lightning Aura",
  custom_color: "Custom Color",
  billboard: "Billboard",
  led_banner: "LED Banner",
  neon_outline: "Neon Outline",
  particle_aura: "Particle Aura",
  streak_freeze: "Streak Freeze",
  raid_helicopter: "Flash Bot",
  raid_drone: "Sniper Bot",
  raid_rocket: "Liquidator",
  tag_neon: "Neon Tag",
  tag_fire: "Fire Tag",
  tag_gold: "Gold Tag",
  raid_boost_small: "War Paint",
  raid_boost_medium: "Battle Armor",
  raid_boost_large: "EMP Device",
  white_rabbit: "White Rabbit",
  top_trader: "Top Trader Star",
};

export const ACHIEVEMENT_ITEMS: Record<string, { achievement: string; label: string }> = {
  flag: { achievement: "first_trade", label: "First Trade (1+ swaps)" },
  custom_color: { achievement: "high_volume", label: "High Volume (1,000+ trades)" },
  neon_trim: { achievement: "grinder", label: "Grinder (2,500+ trades)" },
  antenna_array: { achievement: "multi_protocol", label: "Multi-Protocol (5+ protocols)" },
  rooftop_garden: { achievement: "protocol_architect", label: "Protocol Architect (10+ protocols)" },
  spotlight: { achievement: "high_rep", label: "High Rep (80+ reputation)" },
  helipad: { achievement: "city_founder", label: "City Founder (5+ agents spawned)" },
  white_rabbit: { achievement: "white_rabbit", label: "Found the White Rabbit" },
};

export const ITEM_EMOJIS: Record<string, string> = {
  flag: "🏁", helipad: "🚁", spire: "🪣", satellite_dish: "📡", crown_item: "👑",
  antenna_array: "☀️", rooftop_garden: "🌿", rooftop_fire: "🔥", pool_party: "🏊",
  neon_trim: "💡", spotlight: "🔦", hologram_ring: "💫", lightning_aura: "⚡",
  custom_color: "🎨", billboard: "📺", led_banner: "🪧",
  neon_outline: "🔮", particle_aura: "✨",
  streak_freeze: "🧊",
  raid_helicopter: "⚡",
  raid_drone: "🎯",
  raid_rocket: "💀",
  tag_neon: "🌈",
  tag_fire: "🔥",
  tag_gold: "🥇",
  raid_boost_small: "🎨",
  raid_boost_medium: "🛡️",
  raid_boost_large: "💣",
  white_rabbit: "🐇",
  top_trader: "⭐",
};

export const FACES_ITEMS = ["custom_color", "billboard", "led_banner"];

export const RAID_VEHICLE_ITEMS = ["raid_helicopter", "raid_drone", "raid_rocket"];
export const RAID_TAG_ITEMS = ["tag_neon", "tag_fire", "tag_gold"];
export const RAID_BOOST_ITEMS = ["raid_boost_small", "raid_boost_medium", "raid_boost_large"];
```

**Run:**
```bash
cd frontend && npx tsc --noEmit src/lib/zones.ts
```
Expected: No type errors.

**Commit:**
```bash
git add frontend/src/lib/zones.ts
git commit -m "feat: add zone/item system with DeFi achievement triggers"
```

---

### Task 4: Copy and adapt achievements.ts from git-city

**Files:**
- Create: `frontend/src/lib/achievements.ts`

**Step 1: Rename `DevStats` to `AgentStats` and remap fields**

Before (git-city):
```typescript
interface DevStats {
  contributions: number;
  public_repos: number;
  total_stars: number;
  referral_count: number;
  kudos_count: number;
  gifts_sent: number;
  gifts_received: number;
  app_streak?: number;
  kudos_streak?: number;
  raid_xp?: number;
  purchases?: number;
  dailies_completed?: number;
}
```

After (Sprawl):
```typescript
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
```

**Step 2: Remap achievement category switch cases**

Before (git-city):
```typescript
switch (a.category) {
  case "commits":
    return stats.contributions >= a.threshold;
  case "repos":
    return stats.public_repos >= a.threshold;
  case "stars":
    return stats.total_stars >= a.threshold;
  case "social":
    return stats.referral_count >= a.threshold;
  case "kudos":
    return stats.kudos_count >= a.threshold;
  case "streak":
    return (stats.app_streak ?? 0) >= a.threshold;
  case "kudos_streak":
    return (stats.kudos_streak ?? 0) >= a.threshold;
  // ...
}
```

After (Sprawl):
```typescript
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
  case "profit_streak":
    return (stats.profit_streak ?? 0) >= a.threshold;
  case "reputation_streak":
    return (stats.reputation_streak ?? 0) >= a.threshold;
  // ...
}
```

**Step 3: Rename table references (`developers` to `agents`, `developer_achievements` to `agent_achievements`, `developer_id` to `agent_id`)**

Before (git-city):
```typescript
sb.from("developer_achievements")
  .select("achievement_id")
  .eq("developer_id", developerId)
```

After (Sprawl):
```typescript
sb.from("agent_achievements")
  .select("achievement_id")
  .eq("agent_id", agentId)
```

**Step 4: Full file**

```typescript
// frontend/src/lib/achievements.ts
// Adapted from inspiration/git-city/src/lib/achievements.ts
// Categories remapped: commits->trades, repos->protocols, stars->reputation, social->agents_spawned

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
```

**Run:**
```bash
cd frontend && npx tsc --noEmit src/lib/achievements.ts
```
Expected: No type errors (assuming `supabase.ts` exports `getSupabaseAdmin()`).

**Commit:**
```bash
git add frontend/src/lib/achievements.ts
git commit -m "feat: add achievement engine with DeFi categories (trades/protocols/reputation)"
```

---

### Task 5: Copy and adapt dailies.ts from git-city

**Files:**
- Create: `frontend/src/lib/dailies.ts`

**Step 1: Rename mission pool from GitHub/gaming to DeFi agent activities**

Before (git-city `MISSION_POOL`):
```typescript
const MISSION_POOL: Mission[] = [
  { id: "checkin",            title: "Daily presence",     description: "Check in today",               threshold: 1 },
  { id: "give_kudos",         title: "Spread the love",    description: "Give kudos to a dev",          threshold: 1 },
  { id: "give_kudos_3",       title: "Kudos spree",        description: "Give kudos to 3 devs",         threshold: 3 },
  { id: "visit_building",     title: "Building inspector",description: "Visit a dev's building",        threshold: 1 },
  { id: "visit_3_buildings",  title: "City explorer",      description: "Visit 3 buildings",            threshold: 3 },
  { id: "fly_score_50",       title: "Casual pilot",       description: "Score 50+ in Fly mode",        threshold: 1 },
  { id: "fly_score_150",      title: "Sky collector",      description: "Score 150+ in Fly mode",       threshold: 1 },
  { id: "win_battle",         title: "Victorious",         description: "Win a battle",                 threshold: 1 },
  { id: "attempt_battle",     title: "Ready to fight",     description: "Attempt a battle",             threshold: 1 },
  { id: "visit_shop",         title: "Window shopper",     description: "Visit the shop",               threshold: 1 },
  { id: "check_leaderboard",  title: "Stats checker",      description: "Check the leaderboard",        threshold: 1 },
  { id: "explore_district",   title: "District hopper",    description: "Explore a different district",  threshold: 1 },
];
```

After (Sprawl):
```typescript
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
```

**Step 2: Update threshold checks for trade volume missions**

Before (git-city):
```typescript
if (missionId === "fly_score_50" && (extra?.score ?? 0) < 50) return;
if (missionId === "fly_score_150" && (extra?.score ?? 0) < 150) return;
```

After (Sprawl):
```typescript
if (missionId === "trade_volume_500" && (extra?.volume ?? 0) < 500) return;
if (missionId === "trade_volume_2000" && (extra?.volume ?? 0) < 2000) return;
```

**Step 3: Rename `developerId` to `agentId` throughout**

Before:
```typescript
export function getDailyMissions(developerId: number, dateStr: string, isMobile = false): Mission[]
export async function trackDailyMission(developerId: number, missionId: string, extra?: { score?: number }): Promise<void>
```

After:
```typescript
export function getDailyMissions(agentId: number, dateStr: string, isMobile = false): Mission[]
export async function trackDailyMission(agentId: number, missionId: string, extra?: { volume?: number }): Promise<void>
```

**Step 4: Full file**

```typescript
// frontend/src/lib/dailies.ts
// Adapted from inspiration/git-city/src/lib/dailies.ts
// Missions remapped: visit_building->inspect_agent, fly_score->trade_volume, etc.

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
  } catch (err) {
    console.error("[dailies] trackDailyMission error:", err);
  }
}
```

**Run:**
```bash
cd frontend && npx tsc --noEmit src/lib/dailies.ts
```
Expected: No type errors (assuming `supabase.ts` exports `getSupabaseAdmin()`).

**Commit:**
```bash
git add frontend/src/lib/dailies.ts
git commit -m "feat: add daily missions system with DeFi-themed objectives"
```

---

### Task 6: Supabase migrations (XP, raids, dailies)

**Files:**
- Create: `frontend/supabase/migrations/040_xp_leveling.sql`
- Create: `frontend/supabase/migrations/041_raids.sql`
- Create: `frontend/supabase/migrations/042_dailies.sql`

**Step 1: XP leveling migration — adapted from git-city migration 032**

Key changes from git-city:
- `developers` table becomes `agents` table
- `developer_id` becomes `agent_id`
- `xp_github` becomes `xp_on_chain`
- Engagement sources renamed: `checkin`->`heartbeat`, `kudos_given`->`reputation_given`, `visit`->`inspect`, `fly`->`trade`
- Backfill uses agent trading data instead of GitHub stats

```sql
-- frontend/supabase/migrations/040_xp_leveling.sql
-- Adapted from inspiration/git-city/supabase/migrations/032_xp_leveling.sql
-- Renamed: developers->agents, developer_id->agent_id, github->on_chain

-- New columns on agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS xp_total integer NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS xp_level integer NOT NULL DEFAULT 1;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS xp_on_chain integer NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS xp_daily integer NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS xp_daily_date date;

CREATE INDEX IF NOT EXISTS idx_agents_xp_total ON agents(xp_total DESC);

-- XP audit log
CREATE TABLE IF NOT EXISTS xp_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id bigint NOT NULL REFERENCES agents(id),
  source text NOT NULL,
  amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_xp_log_agent ON xp_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_xp_log_created ON xp_log(created_at);

-- grant_xp RPC
-- Engagement sources (daily-capped): heartbeat, dailies, reputation_given, inspect, trade
CREATE OR REPLACE FUNCTION grant_xp(
  p_agent_id bigint,
  p_source text,
  p_amount integer
) RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_daily integer;
  v_actual integer;
  v_new_total integer;
  v_new_level integer;
BEGIN
  -- Reset daily counter if new day
  UPDATE agents
  SET xp_daily = 0, xp_daily_date = v_today
  WHERE id = p_agent_id AND (xp_daily_date IS NULL OR xp_daily_date < v_today);

  SELECT xp_daily INTO v_daily FROM agents WHERE id = p_agent_id;

  -- Daily cap only for engagement sources
  IF p_source IN ('heartbeat', 'dailies', 'reputation_given', 'inspect', 'trade') THEN
    v_actual := LEAST(p_amount, GREATEST(0, 150 - COALESCE(v_daily, 0)));
  ELSE
    v_actual := p_amount;
  END IF;

  IF v_actual <= 0 THEN
    RETURN json_build_object('granted', 0, 'reason', 'daily_cap');
  END IF;

  -- Increment XP
  UPDATE agents
  SET xp_total = xp_total + v_actual,
      xp_daily = COALESCE(xp_daily, 0) +
        CASE WHEN p_source IN ('heartbeat','dailies','reputation_given','inspect','trade')
        THEN v_actual ELSE 0 END,
      xp_daily_date = v_today
  WHERE id = p_agent_id
  RETURNING xp_total INTO v_new_total;

  -- Calculate level (25 * level^2.2)
  v_new_level := 1;
  WHILE v_new_total >= (25 * POWER(v_new_level + 1, 2.2))::integer LOOP
    v_new_level := v_new_level + 1;
  END LOOP;

  -- Level never drops
  UPDATE agents SET xp_level = GREATEST(xp_level, v_new_level)
  WHERE id = p_agent_id;

  -- Audit log
  INSERT INTO xp_log (agent_id, source, amount)
  VALUES (p_agent_id, p_source, v_actual);

  RETURN json_build_object('granted', v_actual, 'new_total', v_new_total, 'new_level', v_new_level);
END;
$$;

-- Backfill existing agents with on-chain XP
DO $$
DECLARE
  r RECORD;
  v_on_chain_xp integer;
  v_engagement_xp integer;
  v_total integer;
  v_level integer;
BEGIN
  FOR r IN SELECT * FROM agents LOOP
    -- On-chain XP (log scale)
    v_on_chain_xp := (
      FLOOR(LOG(2, GREATEST(r.total_volume, 1) + 1) * 15) +
      FLOOR(LOG(2, GREATEST(r.reputation_score, 1) + 1) * 10) +
      FLOOR(LOG(2, GREATEST(r.strategy_count, 1) + 1) * 5) +
      FLOOR(LOG(2, GREATEST(COALESCE(r.recent_actions, 0), 1) + 1) * 8)
    )::integer;

    -- Engagement XP retroactive estimate
    v_engagement_xp := (
      COALESCE(r.app_streak, 0) * 10 +
      COALESCE(r.dailies_completed, 0) * 25 +
      COALESCE(r.raid_xp, 0)
    );

    v_total := v_on_chain_xp + v_engagement_xp;

    -- Calculate level
    v_level := 1;
    WHILE v_total >= (25 * POWER(v_level + 1, 2.2))::integer LOOP
      v_level := v_level + 1;
    END LOOP;

    UPDATE agents
    SET xp_total = v_total, xp_on_chain = v_on_chain_xp, xp_level = v_level
    WHERE id = r.id;
  END LOOP;
END $$;
```

**Step 2: Raids migration — adapted from git-city migration 015**

Key changes:
- `developers` references become `agents`
- `building_id` becomes `agent_id` (in `raid_tags`)
- `attacker_login` becomes `attacker_name`
- `current_week_contributions` becomes `weekly_volume` (already on agents table from Phase 2)
- `current_week_kudos_given/received` becomes `weekly_reputation_given/received`
- Achievement seeds use same raid category (kept as-is per design doc)

```sql
-- frontend/supabase/migrations/041_raids.sql
-- Adapted from inspiration/git-city/supabase/migrations/015_raid_system.sql
-- Renamed: developers->agents, building_id->agent_id, login->name

-- 1. New columns on agents (weekly tracking for raid scoring)
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS raid_xp                       int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_volume                 numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_reputation_given       int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_reputation_received    int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_start_date             date NOT NULL DEFAULT date_trunc('week', now())::date;

-- 2. raids table
CREATE TABLE IF NOT EXISTS raids (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  attacker_id       BIGINT      NOT NULL REFERENCES agents(id),
  defender_id       BIGINT      NOT NULL REFERENCES agents(id),
  attack_score      INT         NOT NULL,
  defense_score     INT         NOT NULL,
  success           BOOLEAN     NOT NULL,
  attack_breakdown  JSONB       NOT NULL DEFAULT '{}',
  defense_breakdown JSONB       NOT NULL DEFAULT '{}',
  attacker_vehicle  TEXT        NOT NULL DEFAULT 'default',
  attacker_tag_style TEXT       NOT NULL DEFAULT 'default',
  on_chain_tx       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT raids_no_self CHECK (attacker_id != defender_id)
);

CREATE INDEX IF NOT EXISTS idx_raids_attacker         ON raids (attacker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_raids_defender         ON raids (defender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_raids_pair_week        ON raids (attacker_id, defender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_raids_success_created  ON raids (success, created_at DESC) WHERE success = true;

ALTER TABLE raids ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "raids_public_read" ON raids;
CREATE POLICY "raids_public_read" ON raids FOR SELECT USING (true);

-- 3. raid_tags table
CREATE TABLE IF NOT EXISTS raid_tags (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  raid_id       UUID        NOT NULL REFERENCES raids(id) ON DELETE CASCADE,
  agent_id      BIGINT      NOT NULL REFERENCES agents(id),
  attacker_id   BIGINT      NOT NULL REFERENCES agents(id),
  attacker_name TEXT        NOT NULL,
  tag_style     TEXT        NOT NULL DEFAULT 'default',
  active        BOOLEAN     NOT NULL DEFAULT true,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only 1 active tag per agent building
CREATE UNIQUE INDEX IF NOT EXISTS idx_raid_tags_agent_active
  ON raid_tags (agent_id)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_raid_tags_expires
  ON raid_tags (expires_at);

ALTER TABLE raid_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "raid_tags_public_read" ON raid_tags;
CREATE POLICY "raid_tags_public_read" ON raid_tags FOR SELECT USING (true);

-- 4. Raid achievements (kept as-is from git-city)
INSERT INTO achievements (id, category, name, description, threshold, tier, reward_type, sort_order)
VALUES
  ('pickpocket',   'raid', 'Pickpocket',   'Earn 100 Raid XP',   100,   'bronze',  'exclusive_badge', 170),
  ('burglar',      'raid', 'Burglar',      'Earn 500 Raid XP',   500,   'silver',  'exclusive_badge', 171),
  ('heist_master', 'raid', 'Heist Master', 'Earn 2000 Raid XP',  2000,  'gold',    'exclusive_badge', 172),
  ('kingpin',      'raid', 'Kingpin',      'Earn 10000 Raid XP', 10000, 'diamond', 'exclusive_badge', 173)
ON CONFLICT (id) DO NOTHING;

-- 5. Raid items (vehicles, tags, consumable boosters)
-- Prices in $SPRAWL tokens (amount * 1e18) instead of USD/BRL
INSERT INTO items (id, category, name, description, price_sprawl, is_active, zone, metadata)
VALUES
  ('raid_helicopter',   'effect',      'Flash Bot',     'Raid vehicle: flash bot',        50,  true, NULL, '{"type":"raid_vehicle"}'),
  ('raid_drone',        'effect',      'Sniper Bot',    'Raid vehicle: sniper bot',       30,  true, NULL, '{"type":"raid_vehicle"}'),
  ('raid_rocket',       'effect',      'Liquidator',    'Raid vehicle: liquidator',       75,  true, NULL, '{"type":"raid_vehicle"}'),
  ('tag_neon',          'effect',      'Neon Tag',      'Neon-colored raid graffiti',     25,  true, NULL, '{"type":"raid_tag"}'),
  ('tag_fire',          'effect',      'Fire Tag',      'Fire-animated raid graffiti',    35,  true, NULL, '{"type":"raid_tag"}'),
  ('tag_gold',          'effect',      'Gold Tag',      'Golden raid graffiti',           50,  true, NULL, '{"type":"raid_tag"}'),
  ('raid_boost_small',  'consumable',  'War Paint',     '+5 attack for 1 raid',          15,  true, NULL, '{"type":"raid_boost","bonus":5}'),
  ('raid_boost_medium', 'consumable',  'Battle Armor',  '+10 attack for 1 raid',         30,  true, NULL, '{"type":"raid_boost","bonus":10}'),
  ('raid_boost_large',  'consumable',  'EMP Device',    '+20 attack for 1 raid',         50,  true, NULL, '{"type":"raid_boost","bonus":20}')
ON CONFLICT (id) DO NOTHING;

-- 6. Increment weekly reputation counters RPC
CREATE OR REPLACE FUNCTION increment_reputation_week(p_giver_id bigint, p_receiver_id bigint)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE agents SET weekly_reputation_given = weekly_reputation_given + 1
  WHERE id = p_giver_id;
  UPDATE agents SET weekly_reputation_received = weekly_reputation_received + 1
  WHERE id = p_receiver_id;
END;
$$;

-- 7. Weekly stats refresh RPC
CREATE OR REPLACE FUNCTION refresh_weekly_stats()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  week_start DATE := date_trunc('week', now())::date;
BEGIN
  -- Reset weekly volume for agents whose week_start is stale
  UPDATE agents
  SET weekly_volume = 0,
      weekly_reputation_given = 0,
      weekly_reputation_received = 0,
      weekly_start_date = week_start
  WHERE weekly_start_date < week_start;
END;
$$;
```

**Step 3: Dailies migration — adapted from git-city migration 026**

Key changes:
- `developer_id` becomes `agent_id`
- `developers` becomes `agents`
- `p_developer_id` becomes `p_agent_id`

```sql
-- frontend/supabase/migrations/042_dailies.sql
-- Adapted from inspiration/git-city/supabase/migrations/026_dailies.sql
-- Renamed: developer_id->agent_id, developers->agents

-- Daily mission progress table
CREATE TABLE IF NOT EXISTS daily_mission_progress (
  agent_id      bigint  NOT NULL REFERENCES agents(id),
  mission_date  date    NOT NULL DEFAULT current_date,
  mission_id    text    NOT NULL,
  progress      int     NOT NULL DEFAULT 0,
  completed     boolean NOT NULL DEFAULT false,
  completed_at  timestamptz,
  PRIMARY KEY (agent_id, mission_date, mission_id)
);

CREATE INDEX IF NOT EXISTS idx_dmp_agent_date
  ON daily_mission_progress(agent_id, mission_date DESC);

ALTER TABLE daily_mission_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dmp_public_read"
  ON daily_mission_progress FOR SELECT USING (true);

CREATE POLICY "dmp_service_insert"
  ON daily_mission_progress FOR INSERT WITH CHECK (false);

CREATE POLICY "dmp_service_update"
  ON daily_mission_progress FOR UPDATE USING (false);

-- Columns on agents
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS dailies_completed int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dailies_streak    int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_dailies_date date;

-- RPC: record mission progress (idempotent, race-safe)
CREATE OR REPLACE FUNCTION record_mission_progress(
  p_agent_id   bigint,
  p_mission_id text,
  p_threshold  int,
  p_increment  int DEFAULT 1
)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_today    date := current_date;
  v_progress int;
  v_completed boolean;
BEGIN
  INSERT INTO daily_mission_progress (agent_id, mission_date, mission_id, progress)
  VALUES (p_agent_id, v_today, p_mission_id, p_increment)
  ON CONFLICT (agent_id, mission_date, mission_id)
  DO UPDATE SET progress = LEAST(daily_mission_progress.progress + p_increment, p_threshold)
  WHERE daily_mission_progress.completed = false;

  SELECT progress, completed INTO v_progress, v_completed
  FROM daily_mission_progress
  WHERE agent_id = p_agent_id
    AND mission_date = v_today
    AND mission_id = p_mission_id;

  IF v_progress >= p_threshold AND NOT v_completed THEN
    UPDATE daily_mission_progress
    SET completed = true, completed_at = now()
    WHERE agent_id = p_agent_id
      AND mission_date = v_today
      AND mission_id = p_mission_id;

    v_completed := true;
  END IF;

  RETURN jsonb_build_object(
    'progress', v_progress,
    'completed', v_completed,
    'threshold', p_threshold
  );
END;
$$;

-- RPC: complete all dailies (called when 3/3 done)
CREATE OR REPLACE FUNCTION complete_all_dailies(p_agent_id bigint)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_today       date := current_date;
  v_last_date   date;
  v_old_streak  int;
  v_new_streak  int;
  v_total       int;
BEGIN
  SELECT last_dailies_date, dailies_streak, dailies_completed
  INTO v_last_date, v_old_streak, v_total
  FROM agents
  WHERE id = p_agent_id
  FOR UPDATE;

  IF v_last_date = v_today THEN
    RETURN jsonb_build_object('already_completed', true, 'streak', v_old_streak, 'total', v_total);
  END IF;

  IF v_last_date = v_today - 1 THEN
    v_new_streak := v_old_streak + 1;
  ELSE
    v_new_streak := 1;
  END IF;

  v_total := v_total + 1;

  UPDATE agents
  SET dailies_completed = v_total,
      dailies_streak = v_new_streak,
      last_dailies_date = v_today
  WHERE id = p_agent_id;

  RETURN jsonb_build_object(
    'already_completed', false,
    'streak', v_new_streak,
    'total', v_total
  );
END;
$$;

-- Dailies achievements (4 tiers)
INSERT INTO achievements (id, category, name, description, threshold, tier, reward_type, reward_item_id, sort_order)
VALUES
  ('daily_rookie',  'dailies', 'Daily Rookie',  'Complete all dailies 7 times',   7,   'bronze',  'exclusive_badge', NULL, 300),
  ('daily_regular', 'dailies', 'Daily Regular', 'Complete all dailies 30 times',  30,  'silver',  'exclusive_badge', NULL, 301),
  ('daily_master',  'dailies', 'Daily Master',  'Complete all dailies 100 times', 100, 'gold',    'exclusive_badge', NULL, 302),
  ('daily_legend',  'dailies', 'Daily Legend',  'Complete all dailies 365 times', 365, 'diamond', 'exclusive_badge', NULL, 303)
ON CONFLICT (id) DO NOTHING;
```

**Run:**
```bash
cd frontend && npx supabase db push
```
Expected: All 3 migrations apply cleanly.

**Commit:**
```bash
git add frontend/supabase/migrations/040_xp_leveling.sql frontend/supabase/migrations/041_raids.sql frontend/supabase/migrations/042_dailies.sql
git commit -m "feat: add Supabase migrations for XP leveling, raids, and dailies"
```

---

### Task 7: POST /api/raid/execute route

**Files:**
- Create: `frontend/src/app/api/raid/execute/route.ts`

**Step 1: Adapt from git-city's raid execute route**

Key changes from git-city:
- Auth: SIWE wallet session instead of GitHub OAuth
- `developers` table queries become `agents` table queries
- `github_login` becomes `name`, `avatar_url` stays
- Score inputs: `current_week_contributions` becomes `weekly_volume`, `app_streak` becomes `profit_streak`, `current_week_kudos_given` becomes `weekly_reputation_given`, `current_week_kudos_received` becomes `weekly_reputation_received`
- Building height formula: `contributions * 0.15` becomes `total_volume * 0.0015` (scaled for DeFi)
- On-chain recording: after off-chain scoring + DB write, record raid result to CityState contract via `recordRaid(attackerId, defenderId, attackerWon)` — the contract does NOT recalculate scores, it only stores the outcome
- Remove GitHub-specific notification senders, use generic `activity_feed` only
- Remove `earnPixels` calls (replaced by `$SPRAWL` grants)

```typescript
// frontend/src/app/api/raid/execute/route.ts
// Adapted from inspiration/git-city/src/app/api/raid/execute/route.ts
// Auth: SIWE session. Scoring: off-chain via raid.ts (weeklyVolume/profitStreak/reputation).
// On-chain: CityState.recordRaid(attackerId, defenderId, attackerWon) — records outcome only.
// Design choice: scoring uses richer off-chain Supabase data (weeklyVolume, profitStreak,
// reputationGiven) that isn't available on-chain. The RaidContract just verifies/records
// the result without recalculating, keeping the contract simple and gas-efficient.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { checkAchievements } from "@/lib/achievements";
import { trackDailyMission } from "@/lib/dailies";
import {
  calculateAttackScore,
  calculateDefenseScore,
  getRaidTitle,
  getEffectiveMaxRaids,
  isWeeklyCooldownActive,
  RAID_TAG_DURATION_DAYS,
  XP_WIN_ATTACKER,
  XP_WIN_DEFENDER,
  XP_LOSE_DEFENDER,
} from "@/lib/raid";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { ok } = rateLimit(`raid-execute:${user.id}`, 1, 30_000);
  if (!ok) {
    return NextResponse.json({ error: "Too fast, wait before raiding again" }, { status: 429 });
  }

  const body = await request.json();
  const { target_agent_id, boost_purchase_id, vehicle_id } = body as {
    target_agent_id: number;
    boost_purchase_id?: number;
    vehicle_id?: string;
  };

  if (!target_agent_id || typeof target_agent_id !== "number") {
    return NextResponse.json({ error: "Missing target_agent_id" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Get attacker agent_id from session wallet
  const walletAddress = user.user_metadata?.wallet_address ?? "";

  // Fetch attacker + defender in parallel
  const agentColumns = "id, name, wallet_address, total_volume, strategy_count, reputation_score, profit_streak, raid_xp, weekly_volume, weekly_reputation_given, weekly_reputation_received, recent_actions";
  const [attackerRes, defenderRes] = await Promise.all([
    admin
      .from("agents")
      .select(agentColumns)
      .eq("owner_address", walletAddress)
      .single(),
    admin
      .from("agents")
      .select(agentColumns)
      .eq("id", target_agent_id)
      .single(),
  ]);

  const attacker = attackerRes.data as Record<string, any> | null;
  const defender = defenderRes.data as Record<string, any> | null;

  if (!attacker) {
    return NextResponse.json({ error: "Must spawn agent first" }, { status: 403 });
  }
  if (!defender) {
    return NextResponse.json({ error: "Target agent not found" }, { status: 404 });
  }
  if (attacker.id === defender.id) {
    return NextResponse.json({ error: "Cannot raid yourself" }, { status: 409 });
  }

  // Check daily raid count
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const maxRaids = getEffectiveMaxRaids();

  const { count: raidsToday } = await admin
    .from("raids")
    .select("id", { count: "exact", head: true })
    .eq("attacker_id", attacker.id)
    .gte("created_at", todayStart.toISOString());

  if ((raidsToday ?? 0) >= maxRaids) {
    return NextResponse.json({ error: "Daily raid limit reached" }, { status: 429 });
  }

  // Weekly cooldown check
  if (isWeeklyCooldownActive()) {
    const now = new Date();
    const isoWeekStart = new Date(now);
    const dayOfWeek = now.getDay();
    isoWeekStart.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
    isoWeekStart.setHours(0, 0, 0, 0);

    const { count: weeklyPairCount } = await admin
      .from("raids")
      .select("id", { count: "exact", head: true })
      .eq("attacker_id", attacker.id)
      .eq("defender_id", defender.id)
      .gte("created_at", isoWeekStart.toISOString());

    if ((weeklyPairCount ?? 0) > 0) {
      return NextResponse.json({ error: "Already raided this target this week" }, { status: 429 });
    }
  }

  // Handle consumable boost
  let boostBonus = 0;
  let boostItemId: string | null = null;
  let boostPurchaseIdToConsume: number | null = null;

  if (boost_purchase_id) {
    const { data: boostPurchase } = await admin
      .from("purchases")
      .select("id, item_id, status, items!inner(metadata)")
      .eq("id", boost_purchase_id)
      .eq("agent_id", attacker.id)
      .eq("status", "completed")
      .single();

    if (boostPurchase) {
      const meta = (boostPurchase.items as unknown as { metadata: { type: string; bonus: number } })?.metadata;
      if (meta?.type === "raid_boost" && meta.bonus > 0) {
        boostBonus = meta.bonus;
        boostItemId = boostPurchase.item_id;
        boostPurchaseIdToConsume = boostPurchase.id;
      }
    }
  }

  // Calculate scores — remapped inputs
  const attack = calculateAttackScore({
    weeklyVolume: attacker.weekly_volume ?? 0,
    profitStreak: attacker.profit_streak ?? 0,
    reputationGiven: attacker.weekly_reputation_given ?? 0,
    boostBonus,
  });

  const defense = calculateDefenseScore({
    weeklyVolume: defender.weekly_volume ?? 0,
    profitStreak: defender.profit_streak ?? 0,
    reputationReceived: defender.weekly_reputation_received ?? 0,
  });

  const success = attack.total > defense.total;

  if (boostItemId) {
    attack.breakdown.boost_item = boostItemId;
  }

  // Determine vehicle + tag style
  // Loadout is stored in agents.policy_config JSONB under the "loadout" key,
  // e.g. { "loadout": { "vehicle": "raid_drone", "tag": "tag_fire" }, ...other config }
  // This avoids needing a separate agent_customizations table.
  const [{ data: attackerConfig }, { data: ownedVehiclePurchases }] = await Promise.all([
    admin
      .from("agents")
      .select("policy_config")
      .eq("id", attacker.id)
      .single(),
    admin
      .from("purchases")
      .select("item_id, items!inner(metadata)")
      .eq("agent_id", attacker.id)
      .eq("status", "completed"),
  ]);

  const ownedSet = new Set((ownedVehiclePurchases ?? []).map((p) => p.item_id));
  const policyConfig = (attackerConfig?.policy_config ?? {}) as Record<string, unknown>;
  const savedLoadout = (policyConfig.loadout as { vehicle?: string; tag?: string } | null) ?? {};

  let vehicle = "default";
  if (vehicle_id) {
    if (vehicle_id === "default" || ownedSet.has(vehicle_id)) {
      vehicle = vehicle_id;
    }
  } else {
    const saved = savedLoadout.vehicle ?? "default";
    vehicle = saved === "default" || ownedSet.has(saved) ? saved : "default";
  }

  let tagStyle = "default";
  const savedTag = savedLoadout.tag ?? "default";
  tagStyle = savedTag === "default" || ownedSet.has(savedTag) ? savedTag : "default";

  // Insert raid record
  const { data: inserted, error: insertErr } = await admin
    .from("raids")
    .insert({
      attacker_id: attacker.id,
      defender_id: defender.id,
      attack_score: attack.total,
      defense_score: defense.total,
      success,
      attack_breakdown: attack.breakdown,
      defense_breakdown: defense.breakdown,
      attacker_vehicle: vehicle,
      attacker_tag_style: tagStyle,
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error("Raid insert error:", insertErr);
    return NextResponse.json({ error: "Raid failed" }, { status: 500 });
  }

  const raidId = inserted.id;

  // Consume boost
  if (boostPurchaseIdToConsume) {
    await admin
      .from("purchases")
      .update({ status: "consumed" })
      .eq("id", boostPurchaseIdToConsume);
  }

  // XP + tags + feed
  if (success) {
    await admin
      .from("raid_tags")
      .update({ active: false })
      .eq("agent_id", defender.id)
      .eq("active", true);

    await admin.from("raid_tags").insert({
      raid_id: raidId,
      agent_id: defender.id,
      attacker_id: attacker.id,
      attacker_name: attacker.name,
      tag_style: tagStyle,
      expires_at: new Date(Date.now() + RAID_TAG_DURATION_DAYS * 86400000).toISOString(),
    });

    await Promise.all([
      admin
        .from("agents")
        .update({ raid_xp: (attacker.raid_xp ?? 0) + XP_WIN_ATTACKER })
        .eq("id", attacker.id),
      admin
        .from("agents")
        .update({ raid_xp: (defender.raid_xp ?? 0) + XP_WIN_DEFENDER })
        .eq("id", defender.id),
    ]);

    admin.rpc("grant_xp", { p_agent_id: attacker.id, p_source: "raid_win", p_amount: 50 }).then();
    admin.rpc("grant_xp", { p_agent_id: defender.id, p_source: "raid_defend", p_amount: 30 }).then();
  } else {
    await admin
      .from("agents")
      .update({ raid_xp: (defender.raid_xp ?? 0) + XP_LOSE_DEFENDER })
      .eq("id", defender.id);

    admin.rpc("grant_xp", { p_agent_id: attacker.id, p_source: "raid_loss", p_amount: 15 }).then();
    admin.rpc("grant_xp", { p_agent_id: defender.id, p_source: "raid_defend", p_amount: 30 }).then();
  }

  // On-chain: record raid outcome on CityState contract (fire-and-forget)
  // NOTE: All scoring is done OFF-CHAIN using richer Supabase data (weeklyVolume, profitStreak,
  // reputationGiven via calculateAttackScore/calculateDefenseScore in raid.ts). The on-chain
  // RaidContract.recordRaid() only stores the final outcome (attacker, defender, who won) —
  // it does NOT recalculate scores. This is intentional: on-chain storage only has simple
  // fields (totalVolume, raidWins, level) which can't capture the nuanced off-chain metrics.
  let onChainTx: string | undefined;
  try {
    const { getDeployerWallet } = await import("@/lib/ethers-provider");
    const { CityStateABI } = await import("@/constants/abis");
    const { CONTRACTS } = await import("@/lib/config");
    const { ethers } = await import("ethers");

    const wallet = getDeployerWallet();
    const cityState = new ethers.Contract(CONTRACTS.CityState, CityStateABI.abi, wallet);

    const tx = await cityState.recordRaid(attacker.id, defender.id, success);
    onChainTx = tx.hash;

    // Update raid row with tx hash (fire-and-forget)
    admin.from("raids").update({ on_chain_tx: tx.hash }).eq("id", raidId).then();
  } catch (err) {
    console.error("[raid] on-chain recording failed:", err);
  }

  // Activity feed
  await admin.from("activity_feed").insert({
    event_type: success ? "raid_success" : "raid_failed",
    actor_id: attacker.id,
    target_id: defender.id,
    metadata: {
      attacker_name: attacker.name,
      defender_name: defender.name,
      attack_score: attack.total,
      defense_score: defense.total,
    },
  });

  // Track daily missions
  trackDailyMission(attacker.id, "attempt_raid");
  if (success) trackDailyMission(attacker.id, "win_raid");

  // Check achievements for both
  const newAttackerXp = (attacker.raid_xp ?? 0) + (success ? XP_WIN_ATTACKER : 0);
  const newDefenderXp = (defender.raid_xp ?? 0) + (success ? XP_WIN_DEFENDER : XP_LOSE_DEFENDER);

  const [attackerAchievements] = await Promise.all([
    checkAchievements(
      attacker.id,
      {
        total_trades: attacker.recent_actions ?? 0,
        protocols_used: attacker.strategy_count ?? 0,
        reputation_score: attacker.reputation_score ?? 0,
        agents_spawned: 0,
        reputation_given: attacker.weekly_reputation_given ?? 0,
        gifts_sent: 0,
        gifts_received: 0,
        raid_xp: newAttackerXp,
      },
      attacker.name,
    ),
    checkAchievements(
      defender.id,
      {
        total_trades: defender.recent_actions ?? 0,
        protocols_used: defender.strategy_count ?? 0,
        reputation_score: defender.reputation_score ?? 0,
        agents_spawned: 0,
        reputation_given: defender.weekly_reputation_given ?? 0,
        gifts_sent: 0,
        gifts_received: 0,
        raid_xp: newDefenderXp,
      },
      defender.name,
    ),
  ]);

  const xpEarned = success ? XP_WIN_ATTACKER : 0;

  return NextResponse.json({
    raid_id: raidId,
    success,
    attack_score: attack.total,
    defense_score: defense.total,
    attack_breakdown: attack.breakdown,
    defense_breakdown: defense.breakdown,
    attacker: {
      name: attacker.name,
      avatar: null,
      position: [0, 0, 0] as [number, number, number],
      height: Math.max(20, Math.min(300, (attacker.total_volume ?? 0) * 0.0015)),
    },
    defender: {
      name: defender.name,
      avatar: null,
      position: [0, 0, 0] as [number, number, number],
      height: Math.max(20, Math.min(300, (defender.total_volume ?? 0) * 0.0015)),
    },
    xp_earned: xpEarned,
    new_raid_xp: newAttackerXp,
    new_title: getRaidTitle(newAttackerXp),
    new_achievements: attackerAchievements,
    vehicle,
    tag_style: tagStyle,
    on_chain_tx: onChainTx,
  });
}
```

**Run:**
```bash
cd frontend && npx tsc --noEmit src/app/api/raid/execute/route.ts
```
Expected: No type errors.

**Commit:**
```bash
git add frontend/src/app/api/raid/execute/route.ts
git commit -m "feat: add POST /api/raid/execute with off-chain scoring and on-chain recording"
```

---

### Task 8: POST /api/heartbeat route

**Files:**
- Create: `frontend/src/app/api/heartbeat/route.ts`

**Step 1: Adapt from git-city's checkin route**

Key changes from git-city:
- Renamed from `/api/checkin` to `/api/heartbeat`
- Auth: SIWE wallet session instead of GitHub OAuth
- `developers` table becomes `agents`
- `github_login` lookups become `owner_address` lookups
- Replace `fetchWeeklyContributions` (GitHub GraphQL) with on-chain activity check: query `trade_history` for any tx in last 24h
- Replace streak milestones from items pool to `$SPRAWL` token grants
- Remove GitHub-specific notification senders
- Keep: streak mechanics, XP grants, achievement checks, feed events

```typescript
// frontend/src/app/api/heartbeat/route.ts
// Adapted from inspiration/git-city/src/app/api/checkin/route.ts
// Auth: SIWE. Activity: trade_history instead of GitHub. Rewards: $SPRAWL instead of items.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { checkAchievements } from "@/lib/achievements";
import { trackDailyMission } from "@/lib/dailies";

const STREAK_SPRAWL_REWARDS: { milestone: number; amount: number }[] = [
  { milestone: 3, amount: 10 },
  { milestone: 7, amount: 25 },
  { milestone: 14, amount: 50 },
  { milestone: 30, amount: 100 },
];

export async function POST() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { ok } = rateLimit(`heartbeat:${user.id}`, 1, 5000);
  if (!ok) {
    return NextResponse.json({ error: "Too fast" }, { status: 429 });
  }

  const walletAddress = (
    user.user_metadata?.wallet_address ?? ""
  ).toLowerCase();

  if (!walletAddress) {
    return NextResponse.json({ error: "No wallet address" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  // Fetch agent
  const { data: agent } = await sb
    .from("agents")
    .select("id, name, total_volume, strategy_count, reputation_score, reputation_given, profit_streak, app_streak, last_checkin_date, raid_xp, recent_actions")
    .eq("owner_address", walletAddress)
    .single();

  if (!agent) {
    return NextResponse.json({ error: "Must spawn agent first" }, { status: 403 });
  }

  // Perform check-in via RPC (reuses same streak logic as git-city)
  const { data: result, error: rpcError } = await sb.rpc("perform_heartbeat", {
    p_agent_id: agent.id,
  });

  if (rpcError) {
    console.error("perform_heartbeat RPC error:", rpcError);
    return NextResponse.json({ error: "Heartbeat failed" }, { status: 500 });
  }

  const heartbeatResult = result as {
    checked_in: boolean;
    already_today?: boolean;
    streak: number;
    longest: number;
    error?: string;
  };

  if (heartbeatResult.error) {
    return NextResponse.json({ error: heartbeatResult.error }, { status: 400 });
  }

  trackDailyMission(agent.id, "heartbeat");

  let newAchievements: string[] = [];
  let streakReward: { milestone: number; sprawl_amount: number } | null = null;
  let xpResult: { granted: number; new_total: number; new_level: number } | null = null;

  // Grant XP for heartbeat
  if (heartbeatResult.checked_in) {
    const { data: xpData } = await sb.rpc("grant_xp", {
      p_agent_id: agent.id,
      p_source: "heartbeat",
      p_amount: 10,
    });
    if (xpData) xpResult = xpData as { granted: number; new_total: number; new_level: number };
  }

  if (heartbeatResult.checked_in) {
    // Check achievements with updated streak
    newAchievements = await checkAchievements(agent.id, {
      total_trades: agent.recent_actions ?? 0,
      protocols_used: agent.strategy_count ?? 0,
      reputation_score: agent.reputation_score ?? 0,
      agents_spawned: 0,
      reputation_given: agent.reputation_given ?? 0,
      gifts_sent: 0,
      gifts_received: 0,
      profit_streak: heartbeatResult.streak,
      raid_xp: agent.raid_xp ?? 0,
    }, agent.name);

    // Streak rewards: grant $SPRAWL at milestones
    for (const tier of [...STREAK_SPRAWL_REWARDS].reverse()) {
      if (heartbeatResult.streak < tier.milestone) continue;

      const { data: existing } = await sb
        .from("streak_rewards")
        .select("id")
        .eq("agent_id", agent.id)
        .eq("milestone", tier.milestone)
        .maybeSingle();
      if (existing) continue;

      await sb.from("streak_rewards").insert({
        agent_id: agent.id,
        milestone: tier.milestone,
        sprawl_amount: tier.amount,
      });

      streakReward = { milestone: tier.milestone, sprawl_amount: tier.amount };
      break;
    }

    // Activity feed event
    await sb.from("activity_feed").insert({
      event_type: "heartbeat",
      actor_id: agent.id,
      metadata: {
        agent_name: agent.name,
        streak: heartbeatResult.streak,
        reward: streakReward,
      },
    });
  }

  // Refresh weekly volume from trade_history (fire-and-forget)
  (async () => {
    try {
      const now = new Date();
      const isoWeekStart = new Date(now);
      const dayOfWeek = now.getDay();
      isoWeekStart.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
      isoWeekStart.setHours(0, 0, 0, 0);

      const { data: trades } = await sb
        .from("trade_history")
        .select("amount_in")
        .eq("agent_id", agent.id)
        .gte("created_at", isoWeekStart.toISOString());

      const weeklyVolume = (trades ?? []).reduce(
        (sum, t) => sum + (Number(t.amount_in) || 0), 0
      );

      await sb
        .from("agents")
        .update({ weekly_volume: weeklyVolume })
        .eq("id", agent.id);
    } catch (err) {
      console.error("[heartbeat] weekly volume refresh failed:", err);
    }
  })();

  // Count unseen achievements
  const { count: unseenCount } = await sb
    .from("agent_achievements")
    .select("achievement_id", { count: "exact", head: true })
    .eq("agent_id", agent.id)
    .eq("seen", false);

  // Fetch raids targeting this agent since last heartbeat
  let raidsSinceLast: { attacker_name: string; success: boolean; created_at: string }[] = [];
  try {
    const lastCheckin = agent.last_checkin_date as string | null;
    const { data: recentRaids } = await sb
      .from("raids")
      .select("attacker_id, success, created_at, attacker:agents!raids_attacker_id_fkey(name)")
      .eq("defender_id", agent.id)
      .gt("created_at", lastCheckin ?? "1970-01-01")
      .order("created_at", { ascending: false })
      .limit(5);

    raidsSinceLast = (recentRaids ?? []).map((r) => ({
      attacker_name: (r.attacker as unknown as { name: string })?.name ?? "unknown",
      success: r.success,
      created_at: r.created_at,
    }));
  } catch {
    // raids table may not exist yet
  }

  return NextResponse.json({
    checked_in: heartbeatResult.checked_in,
    already_today: heartbeatResult.already_today ?? false,
    streak: heartbeatResult.streak,
    longest: heartbeatResult.longest,
    new_achievements: newAchievements,
    unseen_count: unseenCount ?? 0,
    raids_since_last: raidsSinceLast,
    streak_reward: streakReward,
    xp: xpResult,
  });
}
```

**Run:**
```bash
cd frontend && npx tsc --noEmit src/app/api/heartbeat/route.ts
```
Expected: No type errors.

**Commit:**
```bash
git add frontend/src/app/api/heartbeat/route.ts
git commit -m "feat: add POST /api/heartbeat with streak tracking and $SPRAWL rewards"
```

---

## Summary: What Phase 6 Delivers

After completing all 8 tasks:

- [x] XP leveling system with 6 DeFi tiers (Testnet through Sovereign), 25 rank levels, 150/day engagement cap
- [x] `calculateAgentXp()` scoring agents by volume, reputation, strategies, trades (log-scale, copied formula)
- [x] Raid PvP with scoring based on weekly volume, profit streak, reputation (3 raids/day, weekly cooldown)
- [x] Raid tags on loser buildings for 3 days, vehicles, boosters, Friday the 13th special events
- [x] On-chain raid recording via CityState.recordRaid(attackerId, defenderId, attackerWon) — outcome only, no score recalculation
- [x] Achievement engine with 6 DeFi categories: trades, protocols, reputation, agents_spawned, profit_streak, raid
- [x] 12 daily missions (heartbeat + 2 random) with deterministic PRNG selection, streak tracking
- [x] 3 Supabase migrations (040-042): xp_log + grant_xp RPC, raids + raid_tags tables, daily_mission_progress + RPCs
- [x] Raid loadout stored in `agents.policy_config` JSONB (`loadout` key) — no separate `agent_customizations` table needed
- [x] POST /api/raid/execute — full raid flow with auth, rate limiting, scoring, XP, achievements, on-chain
- [x] POST /api/heartbeat — daily check-in with streak, XP, achievements, weekly volume refresh

**Next phase:** Phase 7 (Leaderboard + Watch Mode + Share Cards) — real-time rankings, livestream camera, OG image generation.
