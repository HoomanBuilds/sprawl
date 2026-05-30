import type { MarketSnapshot } from './market';
import type { PolicyRule } from './agent';

export interface AgentDecision {
    action: 'swap' | 'provideLiquidity' | 'removeLiquidity' | 'harvest' | 'hold' | 'raid';
    protocol: string;
    params: Record<string, any>;
    rationale: string;
}

export interface StrategyEngine {
    decide(ctx: AgentContext): Promise<AgentDecision>;
}

export interface AgentContext {
    iss: {
        name: string;
        persona: string;
        strategy_type: 0 | 1 | 2;
        goal: string;
        constraints: string;
    };
    portfolio: {
        holdings: Record<string, number>;
        totalValueUSD: number;
        unrealizedPnl: number;
        sprawlEarned: number;
        sprawlBalance: number;
    };
    recentTrades: Array<{
        action: string;
        pair: string;
        amount: number;
        pnl: number;
        rationale: string;
        time: string;
    }>;
    market: MarketSnapshot;
    memories: string[];
    skills: Array<{ name: string; description: string; successRate: number }>;
    policyRules: PolicyRule[];
}

export interface GuardrailConfig {
    maxPositionPct: number;
    maxSlippageBps: number;
    maxTxPerHour: number;
    allowedProtocols: string[];
    dryRun: boolean;
}

export interface ExecutionResult {
    txHash: string;
    success: boolean;
    amountIn: string;
    amountOut: string;
    realizedPnl: number;
    error?: string;
}
