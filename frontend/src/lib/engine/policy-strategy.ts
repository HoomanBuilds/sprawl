import type { StrategyEngine, AgentContext, AgentDecision } from '@/types/engine';
import type { AgentPolicy, PolicyRule } from '@/types/agent';

type ConditionContext = Record<string, number>;

const TOKENS = ['sETH', 'sBTC', 'sPOL', 'sSOL', 'SPRAWL'] as const;

function buildConditionContext(ctx: AgentContext): ConditionContext {
    const c: ConditionContext = {};

    for (const t of TOKENS) {
        c[`market.price.${t}`] = ctx.market.prices[t] ?? 0;
        c[`portfolio.holdings.${t}`] = ctx.portfolio.holdings[t] ?? 0;
    }

    for (const p of ctx.market.pools) {
        const pair = (p.name || `${p.tokenA}_${p.tokenB}`).replace('/', '_');
        c[`market.pool.${pair}.apr`] = p.apr ?? 0;
        c[`market.pool.${pair}.tvl`] = p.tvl ?? 0;
        c[`market.priceChange1h.${p.tokenA}`] = p.priceChange1h ?? 0;
        c[`market.priceChange24h.${p.tokenA}`] = p.priceChange24h ?? 0;
    }

    c['portfolio.totalValueUSD'] = ctx.portfolio.totalValueUSD;
    c['portfolio.unrealizedPnl'] = ctx.portfolio.unrealizedPnl;
    c['portfolio.sprawlBalance'] = ctx.portfolio.sprawlBalance;
    c['agent.level'] = ctx.agentStats.level;
    c['agent.raidWins'] = ctx.agentStats.raidWins;
    c['agent.profitStreak'] = ctx.agentStats.profitStreak;

    return c;
}

function evaluateCondition(
    condition: PolicyRule['condition'],
    context: ConditionContext
): boolean {
    const actual = context[condition.field];
    if (actual === undefined) return false;

    const target = typeof condition.value === 'string'
        ? parseFloat(condition.value)
        : condition.value;

    switch (condition.operator) {
        case '>': return actual > target;
        case '<': return actual < target;
        case '==': return actual === target;
        case '!=': return actual !== target;
        default: return false;
    }
}

export class PolicyStrategy implements StrategyEngine {
    constructor(private policy: AgentPolicy) {}

    async decide(ctx: AgentContext): Promise<AgentDecision> {
        const conditionCtx = buildConditionContext(ctx);

        for (const rule of this.policy.rules) {
            if (evaluateCondition(rule.condition, conditionCtx)) {
                return {
                    action: rule.action as AgentDecision['action'],
                    protocol: rule.protocol,
                    params: { ...rule.params },
                    rationale: `Rule triggered: ${rule.name}`,
                };
            }
        }

        return {
            action: 'hold',
            protocol: '',
            params: {},
            rationale: 'No policy rule triggered',
        };
    }
}
