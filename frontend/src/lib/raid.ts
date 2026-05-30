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

export interface RaidCombatant {
  totalVolume: number;
  raidWins: number;
  level: number;
}

export interface RaidPreview {
  attackScore: number;
  defenseScore: number;
  attackerWouldWin: boolean;
}

export function previewRaid(
  attacker: RaidCombatant,
  defender: RaidCombatant,
): RaidPreview {
  const attackScore =
    attacker.totalVolume * 3 + attacker.raidWins * 50 + attacker.level * 10;
  const defenseScore =
    defender.totalVolume * 3 + defender.raidWins * 30 + defender.level * 10;
  return {
    attackScore,
    defenseScore,
    attackerWouldWin: attackScore > defenseScore,
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
