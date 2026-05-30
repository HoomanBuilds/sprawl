import type { StrategyEngine, AgentContext, AgentDecision } from '@/types/engine';
import type { AgentPolicy, PolicyRule } from '@/types/agent';

type ConditionContext = {
    'pool.apr': number;
    'pool.price': number;
    'pool.priceChange1h': number;
    'pool.priceChange24h': number;
    'pool.volume24h': number;
    'portfolio.totalValueUSD': number;
    'portfolio.unrealizedPnl': number;
    'portfolio.pnlPct': number;
    'holding.pct': number;
    'price.sETH': number;
    'price.sBTC': number;
    'price.sPOL': number;
    'price.sSOL': number;
    'price.SPRAWL': number;
    [key: string]: number | string;
};

function buildConditionContext(ctx: AgentContext): ConditionContext {
    const bestPool = ctx.market.pools.reduce((best, p) =>
        p.apr > (best?.apr ?? 0) ? p : best, ctx.market.pools[0]);

    const totalValue = ctx.portfolio.totalValueUSD;
    const pnlPct = totalValue > 0
        ? (ctx.portfolio.unrealizedPnl / totalValue) * 100
        : 0;

    return {
        'pool.apr': bestPool?.apr ?? 0,
        'pool.price': bestPool?.price ?? 0,
        'pool.priceChange1h': bestPool?.priceChange1h ?? 0,
        'pool.priceChange24h': bestPool?.priceChange24h ?? 0,
        'pool.volume24h': bestPool?.volume24h ?? 0,
        'portfolio.totalValueUSD': totalValue,
        'portfolio.unrealizedPnl': ctx.portfolio.unrealizedPnl,
        'portfolio.pnlPct': pnlPct,
        'holding.pct': 0,
        'price.sETH': ctx.market.prices.sETH ?? 0,
        'price.sBTC': ctx.market.prices.sBTC ?? 0,
        'price.sPOL': ctx.market.prices.sPOL ?? 0,
        'price.sSOL': ctx.market.prices.sSOL ?? 0,
        'price.SPRAWL': ctx.market.prices.SPRAWL ?? 0,
    };
}

function evaluateCondition(
    condition: PolicyRule['condition'],
    context: ConditionContext
): boolean {
    const fieldValue = context[condition.field];
    if (fieldValue === undefined) return false;

    const target = typeof condition.value === 'string'
        ? parseFloat(condition.value)
        : condition.value;

    const actual = typeof fieldValue === 'string'
        ? parseFloat(fieldValue)
        : fieldValue;

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
