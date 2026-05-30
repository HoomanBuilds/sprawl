import type { StrategyEngine, AgentContext, AgentDecision } from '@/types/engine';

const CANNED_STRATEGIES: Record<string, (ctx: AgentContext) => AgentDecision> = {
    'momentum': (ctx) => {
        const ethPool = ctx.market.pools.find(p => p.tokenA === 'sETH');
        if (ethPool && ethPool.priceChange1h > 0.02) {
            const usdcBalance = ctx.portfolio.holdings.sUSDC ?? 0;
            if (usdcBalance > 100) {
                const amount = Math.min(usdcBalance * 0.2, 500);
                return {
                    action: 'swap',
                    protocol: 'SprawlDEX',
                    params: { tokenIn: 'sUSDC', tokenOut: 'sETH', amountIn: amount.toFixed(2), maxSlippageBps: 100 },
                    rationale: `Canned momentum: sETH up ${(ethPool.priceChange1h * 100).toFixed(1)}%, buying dip`,
                };
            }
        }
        return { action: 'hold', protocol: '', params: {}, rationale: 'Canned momentum: no signal' };
    },

    'mean_reversion': (ctx) => {
        for (const pool of ctx.market.pools) {
            if (pool.priceChange1h < -0.05) {
                const usdcBalance = ctx.portfolio.holdings.sUSDC ?? 0;
                if (usdcBalance > 100) {
                    const amount = Math.min(usdcBalance * 0.15, 300);
                    return {
                        action: 'swap',
                        protocol: 'SprawlDEX',
                        params: { tokenIn: 'sUSDC', tokenOut: pool.tokenA, amountIn: amount.toFixed(2), maxSlippageBps: 150 },
                        rationale: `Canned reversion: ${pool.tokenA} down ${(pool.priceChange1h * 100).toFixed(1)}%, buying`,
                    };
                }
            }
        }
        return { action: 'hold', protocol: '', params: {}, rationale: 'Canned reversion: no dip found' };
    },

    'conservative': (ctx) => {
        const bestPool = ctx.market.pools.reduce((best, p) =>
            p.apr > (best?.apr ?? 0) ? p : best, ctx.market.pools[0]);

        if (bestPool && bestPool.apr > 10) {
            const usdcBalance = ctx.portfolio.holdings.sUSDC ?? 0;
            const tokenBalance = ctx.portfolio.holdings[bestPool.tokenA] ?? 0;
            if (usdcBalance > 200 && tokenBalance > 0) {
                return {
                    action: 'provideLiquidity',
                    protocol: 'SprawlDEX',
                    params: {
                        tokenA: bestPool.tokenA,
                        tokenB: bestPool.tokenB,
                        amountA: (tokenBalance * 0.1).toFixed(4),
                        amountB: (usdcBalance * 0.1).toFixed(2),
                    },
                    rationale: `Canned conservative: ${bestPool.name} APR ${bestPool.apr.toFixed(1)}%`,
                };
            }
        }
        return { action: 'hold', protocol: '', params: {}, rationale: 'Canned conservative: no good pool' };
    },

    'balanced': (ctx) => {
        const totalValue = ctx.portfolio.totalValueUSD;
        const usdcPct = ((ctx.portfolio.holdings.sUSDC ?? 0) / totalValue) * 100;

        if (usdcPct > 60) {
            const bestMover = ctx.market.pools
                .filter(p => p.priceChange1h > 0)
                .sort((a, b) => b.priceChange1h - a.priceChange1h)[0];

            if (bestMover) {
                const amount = Math.min((ctx.portfolio.holdings.sUSDC ?? 0) * 0.1, 200);
                return {
                    action: 'swap',
                    protocol: 'SprawlDEX',
                    params: { tokenIn: 'sUSDC', tokenOut: bestMover.tokenA, amountIn: amount.toFixed(2), maxSlippageBps: 100 },
                    rationale: `Canned balanced: rebalancing, too much USDC (${usdcPct.toFixed(0)}%)`,
                };
            }
        }
        return { action: 'hold', protocol: '', params: {}, rationale: 'Canned balanced: portfolio balanced' };
    },

    'degen': (ctx) => {
        const bestMover = ctx.market.pools
            .sort((a, b) => Math.abs(b.priceChange1h) - Math.abs(a.priceChange1h))[0];

        if (bestMover && Math.abs(bestMover.priceChange1h) > 0.01) {
            const usdcBalance = ctx.portfolio.holdings.sUSDC ?? 0;
            if (usdcBalance > 50) {
                const amount = Math.min(usdcBalance * 0.3, 1000);
                return {
                    action: 'swap',
                    protocol: 'SprawlDEX',
                    params: { tokenIn: 'sUSDC', tokenOut: bestMover.tokenA, amountIn: amount.toFixed(2), maxSlippageBps: 200 },
                    rationale: `Canned degen: ${bestMover.tokenA} moving ${(bestMover.priceChange1h * 100).toFixed(1)}%, aping in`,
                };
            }
        }
        return { action: 'hold', protocol: '', params: {}, rationale: 'Canned degen: nothing moving' };
    },

    'take_profit': (ctx) => {
        const pnlPct = ctx.portfolio.totalValueUSD > 0
            ? (ctx.portfolio.unrealizedPnl / ctx.portfolio.totalValueUSD) * 100
            : 0;

        if (pnlPct > 10) {
            for (const [token, amount] of Object.entries(ctx.portfolio.holdings)) {
                if (token === 'sUSDC' || amount < 0.001) continue;
                const sellAmount = (amount * 0.5).toFixed(4);
                return {
                    action: 'swap',
                    protocol: 'SprawlDEX',
                    params: { tokenIn: token, tokenOut: 'sUSDC', amountIn: sellAmount, maxSlippageBps: 100 },
                    rationale: `Canned take-profit: unrealized gain ${pnlPct.toFixed(1)}%, selling half ${token}`,
                };
            }
        }
        return { action: 'hold', protocol: '', params: {}, rationale: 'Canned take-profit: no gains to take' };
    },
};

export class CannedStrategy implements StrategyEngine {
    constructor(private strategyName: string) {}

    async decide(ctx: AgentContext): Promise<AgentDecision> {
        const fn = CANNED_STRATEGIES[this.strategyName] ?? CANNED_STRATEGIES['balanced'];
        return fn(ctx);
    }
}

export function getCannedStrategyNames(): string[] {
    return Object.keys(CANNED_STRATEGIES);
}
