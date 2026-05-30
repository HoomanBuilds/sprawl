import { z } from "zod";
import type { AgentPolicy, PolicyRule } from "@/types/agent";

export const CONDITION_FIELDS = [
  "portfolio.totalValueUSD",
  "portfolio.holdings.sETH",
  "portfolio.holdings.sBTC",
  "portfolio.holdings.sPOL",
  "portfolio.holdings.sSOL",
  "portfolio.holdings.sUSDC",
  "portfolio.holdings.SPRAWL",
  "portfolio.unrealizedPnl",
  "portfolio.sprawlBalance",
  "market.price.sETH",
  "market.price.sBTC",
  "market.price.sPOL",
  "market.price.sSOL",
  "market.priceChange1h.sETH",
  "market.priceChange1h.sBTC",
  "market.priceChange1h.sPOL",
  "market.priceChange1h.sSOL",
  "market.priceChange24h.sETH",
  "market.priceChange24h.sBTC",
  "market.priceChange24h.sPOL",
  "market.priceChange24h.sSOL",
  "market.pool.sETH_sUSDC.apr",
  "market.pool.sBTC_sUSDC.apr",
  "market.pool.sPOL_sUSDC.apr",
  "market.pool.sSOL_sUSDC.apr",
  "market.pool.SPRAWL_sUSDC.apr",
  "market.pool.sETH_sUSDC.tvl",
  "market.pool.sBTC_sUSDC.tvl",
  "agent.level",
  "agent.raidWins",
  "agent.profitStreak",
] as const;

export const OPERATORS = [">", "<", "==", "!="] as const;

export const ACTIONS = [
  "swap",
  "provideLiquidity",
  "removeLiquidity",
  "hold",
  "raid",
] as const;

export const PROTOCOLS = ["SprawlDEX"] as const;

export const DEFAULT_MAX_RULES = 5;
export const PREMIUM_MAX_RULES = 20;

export const PolicyRuleSchema = z.object({
  name: z.string().min(1).max(64),
  condition: z.object({
    field: z.enum(CONDITION_FIELDS),
    operator: z.enum(OPERATORS),
    value: z.union([z.number(), z.string()]),
  }),
  action: z.enum(ACTIONS),
  protocol: z.string().default("SprawlDEX"),
  params: z.record(z.string(), z.unknown()).default({}),
});

export function makeAgentPolicySchema(maxRules: number = DEFAULT_MAX_RULES) {
  return z.object({
    rules: z.array(PolicyRuleSchema).min(0).max(maxRules),
    riskTolerance: z.enum(["low", "medium", "high"]),
    maxPositionSize: z.number().min(1).max(100),
    maxSlippageBps: z.number().min(10).max(500),
    allowedProtocols: z.array(z.string()).min(1),
  });
}

export const AgentPolicySchema = makeAgentPolicySchema(DEFAULT_MAX_RULES);

export interface ValidatePolicyResult {
  ok: boolean;
  policy?: AgentPolicy;
  error?: string;
}

export function validatePolicy(
  json: unknown,
  options?: { premium?: boolean }
): ValidatePolicyResult {
  const schema = options?.premium
    ? makeAgentPolicySchema(PREMIUM_MAX_RULES)
    : AgentPolicySchema;

  const result = schema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path?.length ? `${issue.path.join(".")}: ` : "";
    return { ok: false, error: `${path}${issue?.message ?? "Invalid policy"}` };
  }

  return { ok: true, policy: result.data as AgentPolicy };
}

export type { AgentPolicy, PolicyRule };
