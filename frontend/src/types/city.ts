export interface CityBuilding {
  agent_id: number;
  name: string;
  strategy_type: 0 | 1 | 2;
  district: string;

  position: [number, number, number];
  height: number;
  width: number;
  depth: number;
  floors: number;
  windowsPerFloor: number;
  sideWindowsPerFloor: number;
  litPercentage: number;

  tint: [number, number, number, number];
  glow: number;

  xp_level: number;
  xp_total: number;
  sprawl_lifetime_earned: number;
  net_pnl: number;
  raid_wins: number;
  raid_losses: number;
  reputation_score: number;

  loadout: {
    crown: string | null;
    roof: string | null;
    aura: string | null;
  };
  active_raid_tag: {
    attacker_name: string;
    tag_style: string;
    expires_at: string;
  } | null;
  is_active: boolean;
}
