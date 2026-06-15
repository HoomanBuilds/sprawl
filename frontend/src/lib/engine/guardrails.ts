import type { AgentDecision, GuardrailConfig } from '@/types/engine';
import type { AgentRecord } from '@/types/agent';
import type { MarketSnapshot } from '@/types/market';
import { supabaseAdmin } from '../supabase';
import { MAX_TX_PER_HOUR, DEFAULT_SLIPPAGE_BPS } from './constants';

const DEFAULT_CONFIG: GuardrailConfig = {
    maxPositionPct: 60,
    maxSlippageBps: 600,
    maxTxPerHour: MAX_TX_PER_HOUR,
    allowedProtocols: ['SprawlDEX'],
    dryRun: false,
};

interface RateEntry {
    count: number;
    windowStart: number;
}

const rateCounts = new Map<number, RateEntry>();

function checkRateLimit(agentId: number, maxPerHour: number): boolean {
    const now = Date.now();
    const entry = rateCounts.get(agentId);

    if (!entry || now - entry.windowStart > 3_600_000) {
        rateCounts.set(agentId, { count: 1, windowStart: now });
        return true;
    }

    if (entry.count >= maxPerHour) return false;
    entry.count++;
    return true;
}

function calculateMinOutput(
    amountIn: number,
    price: number,
    maxSlippageBps: number,
): string {
    const expectedOut = amountIn * price;
    const minOut = expectedOut * (1 - maxSlippageBps / 10_000);
    return minOut.toFixed(6);
}

export class GuardrailLayer {
    private config: GuardrailConfig;

    constructor(config?: Partial<GuardrailConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    async validate(
        decision: AgentDecision,
        agent: AgentRecord,
        market: MarketSnapshot,
    ): Promise<{ valid: boolean; reason?: string; amended?: AgentDecision }> {
        if (decision.action === 'hold') {
            return { valid: true };
        }

        // Protocol allowlist check
        if (!this.config.allowedProtocols.includes(decision.protocol)) {
            return {
                valid: false,
                reason: `Protocol ${decision.protocol} not in allowlist: [${this.config.allowedProtocols.join(', ')}]`,
            };
        }

        // Rate limit check
        if (!checkRateLimit(agent.agent_id, this.config.maxTxPerHour)) {
            return {
                valid: false,
                reason: `Rate limit exceeded: ${this.config.maxTxPerHour} tx/hour`,
            };
        }

        if (decision.action === 'swap') {
            const { tokenIn, tokenOut } = decision.params;
            const hasPool = market.pools.some(
                (p) =>
                    (p.tokenA === tokenIn && p.tokenB === tokenOut) ||
                    (p.tokenA === tokenOut && p.tokenB === tokenIn),
            );
            if (!hasPool) {
                return {
                    valid: false,
                    reason: `No pool for ${tokenIn}/${tokenOut} — route through sUSDC`,
                };
            }
        }

        // Position size + slippage checks for swaps
        if (decision.action === 'swap' && decision.params.amountIn) {
            const amountIn = parseFloat(decision.params.amountIn);
            const tokenIn = decision.params.tokenIn;
            const portfolioValue = agent.last_portfolio_value / 1e18;
            const tokenPrice = market.prices[tokenIn] ?? 0;
            const positionValue = amountIn * tokenPrice;
            const positionPct = portfolioValue > 0
                ? (positionValue / portfolioValue) * 100
                : 100;

            if (positionPct > this.config.maxPositionPct) {
                return {
                    valid: false,
                    reason: `Position ${positionPct.toFixed(1)}% exceeds max ${this.config.maxPositionPct}%`,
                };
            }

            // Slippage limit — calculate amountOutMin from pool price
            const tokenOut = decision.params.tokenOut;
            const outPrice = market.prices[tokenOut] ?? 0;
            const inPrice = market.prices[tokenIn] ?? 0;
            if (inPrice > 0 && outPrice > 0) {
                const slippageBps = decision.params.maxSlippageBps ?? DEFAULT_SLIPPAGE_BPS;
                const effectiveSlippage = Math.min(slippageBps, this.config.maxSlippageBps);

                const amended: AgentDecision = {
                    ...decision,
                    params: {
                        ...decision.params,
                        amountOutMin: calculateMinOutput(
                            amountIn,
                            inPrice / outPrice,
                            effectiveSlippage,
                        ),
                        maxSlippageBps: effectiveSlippage,
                    },
                };

                return { valid: true, amended };
            }
        }

        return { valid: true };
    }

    isDryRun(): boolean {
        return this.config.dryRun;
    }

    async logDryRun(decision: AgentDecision, agent: AgentRecord): Promise<void> {
        console.log(
            `[DRY RUN] Agent ${agent.agent_id}: ${decision.action} ${JSON.stringify(decision.params)} — ${decision.rationale}`,
        );

        await supabaseAdmin.from('activity_feed').insert({
            event_type: 'dry_run',
            actor_id: agent.agent_id,
            metadata: {
                action: decision.action,
                params: decision.params,
                rationale: decision.rationale,
            },
        });
    }
}
