import type { AgentPolicy } from "@/types/agent";

export interface PresetMeta {
  id: string;
  name: string;
  description: string;
  risk: "low" | "medium" | "high";
  icon: string;
}

export interface StrategyPreset extends PresetMeta {
  policy: AgentPolicy;
}

export const PRESET_META: Record<string, PresetMeta> = {
  "conservative-yield": {
    id: "conservative-yield",
    name: "Conservative Yield",
    description:
      "Farm highest-APR stable pools, rebalance when APR drops. Low risk, steady returns.",
    risk: "low",
    icon: "🛡️",
  },
  "momentum-trader": {
    id: "momentum-trader",
    name: "Momentum Trader",
    description:
      "Buy tokens with strong upward momentum, sell after gains or on drawdown.",
    risk: "medium",
    icon: "📈",
  },
  "arbitrage-hunter": {
    id: "arbitrage-hunter",
    name: "Arbitrage Hunter",
    description:
      "Monitor price discrepancies across pools, execute when spread exceeds 0.5%.",
    risk: "medium",
    icon: "🔍",
  },
  "aggressive-degen": {
    id: "aggressive-degen",
    name: "Aggressive Degen",
    description:
      "Chase high-APR pools, max allocation, frequent rebalances. High risk, high reward.",
    risk: "high",
    icon: "🔥",
  },
  "balanced-defi": {
    id: "balanced-defi",
    name: "Balanced DeFi",
    description:
      "Yield farming, swing trades, and liquidity provision. Well-rounded strategy.",
    risk: "medium",
    icon: "⚖️",
  },
};

export const STRATEGY_PRESETS: Record<string, AgentPolicy> = {
  "conservative-yield": {
    rules: [
      {
        name: "Enter high APR pool",
        condition: { field: "market.pool.sETH_sUSDC.apr", operator: ">", value: 10 },
        action: "provideLiquidity",
        protocol: "SprawlDEX",
        params: { tokenA: "sETH", tokenB: "sUSDC", amountPercent: 20 },
      },
      {
        name: "Exit low APR pool",
        condition: { field: "market.pool.sETH_sUSDC.apr", operator: "<", value: 5 },
        action: "removeLiquidity",
        protocol: "SprawlDEX",
        params: { tokenA: "sETH", tokenB: "sUSDC", percentToRemove: 100 },
      },
      {
        name: "Hold when uncertain",
        condition: { field: "portfolio.totalValueUSD", operator: ">", value: 0 },
        action: "hold",
        protocol: "SprawlDEX",
        params: {},
      },
    ],
    riskTolerance: "low",
    maxPositionSize: 25,
    maxSlippageBps: 50,
    allowedProtocols: ["SprawlDEX"],
  },
  "momentum-trader": {
    rules: [
      {
        name: "Buy sETH on momentum",
        condition: { field: "market.priceChange1h.sETH", operator: ">", value: 0.03 },
        action: "swap",
        protocol: "SprawlDEX",
        params: { tokenIn: "sUSDC", tokenOut: "sETH", amountPercent: 15 },
      },
      {
        name: "Buy sBTC on momentum",
        condition: { field: "market.priceChange1h.sBTC", operator: ">", value: 0.03 },
        action: "swap",
        protocol: "SprawlDEX",
        params: { tokenIn: "sUSDC", tokenOut: "sBTC", amountPercent: 15 },
      },
      {
        name: "Sell on drawdown",
        condition: { field: "portfolio.unrealizedPnl", operator: "<", value: -250 },
        action: "swap",
        protocol: "SprawlDEX",
        params: { tokenIn: "sETH", tokenOut: "sUSDC", amountPercent: 100 },
      },
    ],
    riskTolerance: "medium",
    maxPositionSize: 40,
    maxSlippageBps: 100,
    allowedProtocols: ["SprawlDEX"],
  },
  "arbitrage-hunter": {
    rules: [
      {
        name: "Arb sETH price gap",
        condition: { field: "market.priceChange1h.sETH", operator: ">", value: 0.005 },
        action: "swap",
        protocol: "SprawlDEX",
        params: { tokenIn: "sUSDC", tokenOut: "sETH", amountPercent: 30 },
      },
      {
        name: "Reverse arb sETH",
        condition: { field: "market.priceChange1h.sETH", operator: "<", value: -0.005 },
        action: "swap",
        protocol: "SprawlDEX",
        params: { tokenIn: "sETH", tokenOut: "sUSDC", amountPercent: 30 },
      },
      {
        name: "Provide LP during calm",
        condition: { field: "market.pool.sETH_sUSDC.apr", operator: ">", value: 8 },
        action: "provideLiquidity",
        protocol: "SprawlDEX",
        params: { tokenA: "sETH", tokenB: "sUSDC", amountPercent: 15 },
      },
    ],
    riskTolerance: "medium",
    maxPositionSize: 35,
    maxSlippageBps: 30,
    allowedProtocols: ["SprawlDEX"],
  },
  "aggressive-degen": {
    rules: [
      {
        name: "Ape into high APR",
        condition: { field: "market.pool.sETH_sUSDC.apr", operator: ">", value: 15 },
        action: "provideLiquidity",
        protocol: "SprawlDEX",
        params: { tokenA: "sETH", tokenB: "sUSDC", amountPercent: 40 },
      },
      {
        name: "Momentum buy any spike",
        condition: { field: "market.priceChange1h.sSOL", operator: ">", value: 0.02 },
        action: "swap",
        protocol: "SprawlDEX",
        params: { tokenIn: "sUSDC", tokenOut: "sSOL", amountPercent: 25 },
      },
      {
        name: "Raid when strong",
        condition: { field: "agent.profitStreak", operator: ">", value: 3 },
        action: "raid",
        protocol: "SprawlDEX",
        params: { targetAgentId: 0 },
      },
    ],
    riskTolerance: "high",
    maxPositionSize: 60,
    maxSlippageBps: 200,
    allowedProtocols: ["SprawlDEX"],
  },
  "balanced-defi": {
    rules: [
      {
        name: "LP when APR attractive",
        condition: { field: "market.pool.sETH_sUSDC.apr", operator: ">", value: 8 },
        action: "provideLiquidity",
        protocol: "SprawlDEX",
        params: { tokenA: "sETH", tokenB: "sUSDC", amountPercent: 20 },
      },
      {
        name: "Buy dip sETH",
        condition: { field: "market.priceChange24h.sETH", operator: "<", value: -0.05 },
        action: "swap",
        protocol: "SprawlDEX",
        params: { tokenIn: "sUSDC", tokenOut: "sETH", amountPercent: 15 },
      },
      {
        name: "Sell rally sETH",
        condition: { field: "market.priceChange24h.sETH", operator: ">", value: 0.08 },
        action: "swap",
        protocol: "SprawlDEX",
        params: { tokenIn: "sETH", tokenOut: "sUSDC", amountPercent: 30 },
      },
      {
        name: "Diversify into sBTC",
        condition: { field: "portfolio.holdings.sBTC", operator: "<", value: 0.01 },
        action: "swap",
        protocol: "SprawlDEX",
        params: { tokenIn: "sUSDC", tokenOut: "sBTC", amountPercent: 10 },
      },
    ],
    riskTolerance: "medium",
    maxPositionSize: 30,
    maxSlippageBps: 100,
    allowedProtocols: ["SprawlDEX"],
  },
};

export function getStrategyPreset(id: string): StrategyPreset | null {
  const meta = PRESET_META[id];
  const policy = STRATEGY_PRESETS[id];
  if (!meta || !policy) return null;
  return { ...meta, policy };
}

export const STRATEGY_PRESET_LIST: StrategyPreset[] = Object.keys(
  PRESET_META
).map((id) => ({ ...PRESET_META[id], policy: STRATEGY_PRESETS[id] }));
