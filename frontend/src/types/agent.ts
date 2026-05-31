export interface AgentRecord {
  agent_id: number;
  wallet_address: string;
  owner_address: string;
  name: string;
  avatar_url: string | null;
  persona: string;
  strategy_type: 0 | 1 | 2;
  policy_config: AgentPolicy;

  sprawl_balance: number;
  sprawl_lifetime_earned: number;
  sprawl_lifetime_spent: number;
  last_portfolio_value: number;
  last_settlement_date: string | null;

  total_volume: number;
  strategy_count: number;
  recent_actions: number;
  reputation_score: number;
  net_pnl: number;

  xp_total: number;
  xp_level: number;
  xp_daily: number;
  xp_daily_date: string | null;
  raid_xp: number;
  raid_wins: number;
  raid_losses: number;
  app_streak: number;

  weekly_volume: number;
  weekly_start_date: string;
  profit_streak: number;
  reputation_given: number;
  poignancy_accumulator: number;

  district: string;
  created_at: string;
  last_action_at: string | null;
}

export interface AgentPolicy {
  rules: PolicyRule[];
  riskTolerance: "low" | "medium" | "high";
  maxPositionSize: number;
  maxSlippageBps: number;
  allowedProtocols: string[];
}

export interface PolicyRule {
  name: string;
  condition: {
    field: string;
    operator: ">" | "<" | "==" | "!=";
    value: number | string;
  };
  action: string;
  protocol: string;
  params: Record<string, unknown>;
}
