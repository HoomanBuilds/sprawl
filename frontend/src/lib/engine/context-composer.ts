import type { AgentContext } from '@/types/engine';

function formatUSD(n: number): string {
    return n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;
}

function formatPortfolio(holdings: Record<string, number>, prices: Record<string, number>): string {
    return Object.entries(holdings)
        .filter(([_, amount]) => amount > 0.001)
        .map(([token, amount]) => {
            const value = amount * (prices[token] ?? 0);
            return `  ${token}: ${amount.toFixed(4)} ($${value.toFixed(2)})`;
        })
        .join('\n');
}

export function buildSystemPrompt(ctx: AgentContext): string {
    return `You are ${ctx.iss.name}, a DeFi trading agent on SprawlDEX.
Persona: ${ctx.iss.persona}
Goal: ${ctx.iss.goal}
Constraints: ${ctx.iss.constraints}

You make trading decisions based on market data, your portfolio, memories, and learned skills.
ALWAYS use one of the provided tools to take action. If uncertain, use the "hold" tool.
Be concise in your rationale — 1-2 sentences max.`;
}

export function buildUserPrompt(ctx: AgentContext): string {
    const tradeHistory = ctx.recentTrades.length > 0
        ? ctx.recentTrades.map((t, i) =>
            `  ${i + 1}. ${t.time}: ${t.action} ${t.pair}, amount: ${t.amount}, P&L: ${formatUSD(t.pnl)} — "${t.rationale}"`
          ).join('\n')
        : '  No recent trades.';

    const memoriesStr = ctx.memories.length > 0
        ? ctx.memories.map((m, i) => `  - ${m}`).join('\n')
        : '  No relevant memories yet.';

    const skillsStr = ctx.skills.length > 0
        ? ctx.skills.map(s =>
            `  - ${s.name} (${(s.successRate * 100).toFixed(0)}% success): ${s.description}`
          ).join('\n')
        : '  No learned skills yet.';

    const poolsStr = ctx.market.pools
        .map(p =>
            `  ${p.name}: $${p.price.toFixed(2)} (${(p.priceChange1h * 100).toFixed(1)}% 1h) | Vol: $${p.volume24h.toFixed(0)} | TVL: $${p.tvl.toFixed(0)}`
        )
        .join('\n');

    return `PORTFOLIO:
${formatPortfolio(ctx.portfolio.holdings, ctx.market.prices)}
  Total: $${ctx.portfolio.totalValueUSD.toFixed(2)} | Unrealized P&L: ${formatUSD(ctx.portfolio.unrealizedPnl)} today
  $SPRAWL earned lifetime: ${ctx.portfolio.sprawlEarned}

RECENT TRADES:
${tradeHistory}

RELEVANT MEMORIES:
${memoriesStr}

LEARNED SKILLS:
${skillsStr}

MARKET:
${poolsStr}

Available actions: swap, provideLiquidity, removeLiquidity, hold
What is your next move?`;
}
