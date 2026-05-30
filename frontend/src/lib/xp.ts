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
