import { supabaseAdmin } from '../supabase';
import { readMarketContext, readPortfolio, calculatePortfolioValue, getLargestHolding } from './market-reader';
import { addMemory } from '../memory/memory-stream';
import { retrieveMemories } from '../memory/retrieval';
import { GuardrailLayer } from './guardrails';
import { executeDecision } from '../execution/executor';
import { TICK_INTERVAL_MS, MAX_AGENTS, REFLECTION_THRESHOLD } from './constants';
import type { AgentRecord } from '@/types/agent';
import type { MarketSnapshot } from '@/types/market';
import type { AgentContext, AgentDecision, StrategyEngine } from '@/types/engine';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

function formatUSD(n: number): string {
    return n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Strategy selection (lazy imports to tolerate missing Task 5-7 files)
// ---------------------------------------------------------------------------

async function selectStrategy(agent: AgentRecord): Promise<StrategyEngine> {
    switch (agent.strategy_type) {
        case 0: {
            const { CannedStrategy } = await import('./canned-strategy');
            const presetName = (agent.policy_config as any)?.presetName ?? 'balanced';
            return new CannedStrategy(presetName);
        }
        case 1: {
            const { PolicyStrategy } = await import('./policy-strategy');
            return new PolicyStrategy(agent.policy_config as any);
        }
        case 2: {
            if (!DEEPSEEK_API_KEY) {
                console.warn(`[AgentTick] No DeepSeek key, falling back to canned for agent ${agent.agent_id}`);
                const { CannedStrategy } = await import('./canned-strategy');
                return new CannedStrategy('balanced');
            }
            const { LLMStrategy } = await import('./llm-strategy');
            return new LLMStrategy();
        }
        default: {
            const { CannedStrategy } = await import('./canned-strategy');
            return new CannedStrategy('balanced');
        }
    }
}

// ---------------------------------------------------------------------------
// Per-agent tick — the 10-step cognitive loop
// ---------------------------------------------------------------------------

export async function tickAgent(agent: AgentRecord, market: MarketSnapshot): Promise<void> {
    const startTime = Date.now();

    // 1. PERCEIVE — read portfolio + market from chain
    const portfolio = await readPortfolio(agent.wallet_address);
    const portfolioValueUSD = calculatePortfolioValue(portfolio, market.prices);
    const lastValue = agent.last_portfolio_value / 1e18;
    const unrealizedPnl = portfolioValueUSD - lastValue;

    const { data: recentTrades } = await supabaseAdmin
        .from('trade_history')
        .select('*')
        .eq('agent_id', agent.agent_id)
        .order('created_at', { ascending: false })
        .limit(10);

    // 2. MEMORIZE — create memory events for significant changes
    let newPoignancy = 0;

    if (lastValue > 0 && Math.abs(unrealizedPnl / lastValue) > 0.02) {
        const largestHolding = getLargestHolding(portfolio, market.prices);
        const mem = await addMemory(agent.agent_id, {
            type: 'event',
            description: `Portfolio is ${unrealizedPnl > 0 ? 'up' : 'down'} ${formatUSD(unrealizedPnl)} (${((unrealizedPnl / lastValue) * 100).toFixed(1)}%) since last settlement. Current value: $${portfolioValueUSD.toFixed(2)}. Largest position: ${largestHolding.token} (${largestHolding.pct}%)`,
            poignancy: Math.min(10, Math.ceil(Math.abs(unrealizedPnl) / 100)),
            keywords: ['portfolio', 'pnl', unrealizedPnl > 0 ? 'profit' : 'loss'],
        });
        newPoignancy += mem.poignancy;
    }

    for (const pool of market.pools) {
        if (Math.abs(pool.priceChange1h) > 0.05) {
            const mem = await addMemory(agent.agent_id, {
                type: 'event',
                description: `${pool.name} price moved ${(pool.priceChange1h * 100).toFixed(1)}% in the last hour. Current price: $${pool.price.toFixed(2)}`,
                poignancy: Math.min(8, Math.ceil(Math.abs(pool.priceChange1h) * 40)),
                keywords: ['market', pool.tokenA, pool.tokenB, pool.priceChange1h > 0 ? 'pump' : 'dump'],
            });
            newPoignancy += mem.poignancy;
        }
    }

    // 3. REFLECT — if poignancy budget depleted
    const accum = agent.poignancy_accumulator + newPoignancy;
    if (accum >= REFLECTION_THRESHOLD) {
        try {
            const { shouldReflect, reflect } = await import('../memory/reflection');
            const updatedAgent = { ...agent, poignancy_accumulator: accum };
            if (await shouldReflect(updatedAgent)) {
                await reflect(updatedAgent);
            }
        } catch {
            // reflection module not yet available — reset accumulator anyway
            await supabaseAdmin
                .from('agents')
                .update({ poignancy_accumulator: 0 })
                .eq('agent_id', agent.agent_id);
        }
    } else {
        await supabaseAdmin
            .from('agents')
            .update({ poignancy_accumulator: accum })
            .eq('agent_id', agent.agent_id);
    }

    // 4. RETRIEVE MEMORIES — 3-factor scoring
    const queryText = `Current market: ${Object.entries(market.prices).map(([t, p]) => `${t}=$${p.toFixed(2)}`).join(', ')}. My portfolio: $${portfolioValueUSD.toFixed(2)}. Unrealized P&L: ${formatUSD(unrealizedPnl)}.`;

    const relevantMemories = await retrieveMemories(agent.agent_id, queryText, {
        topK: 5,
        overfetch: 50,
    });

    // 5. COMPOSE CONTEXT — ISS + portfolio + trades + memories + market
    let relevantSkills: Array<{ name: string; description: string; success_rate: number }> = [];
    try {
        const { skillManager } = await import('../skills/skill-manager');
        relevantSkills = await skillManager.retrieveSkills(agent.agent_id, queryText, 3);
    } catch {
        // skill manager not yet available
    }

    const ctx: AgentContext = {
        iss: {
            name: agent.name ?? `Agent-${agent.agent_id}`,
            persona: agent.persona ?? 'A balanced DeFi trading agent',
            strategy_type: agent.strategy_type as 0 | 1 | 2,
            goal: 'Maximize $SPRAWL earnings through profitable DeFi trading on SprawlDEX',
            constraints: `Max position: ${agent.policy_config?.maxPositionSize ?? 30}% of portfolio. Max slippage: ${agent.policy_config?.maxSlippageBps ?? 200}bps.`,
        },
        portfolio: {
            holdings: portfolio,
            totalValueUSD: portfolioValueUSD,
            unrealizedPnl,
            sprawlEarned: agent.sprawl_lifetime_earned,
            sprawlBalance: portfolio.SPRAWL ?? 0,
        },
        recentTrades: (recentTrades ?? []).map((t: any) => ({
            action: t.action,
            pair: `${t.token_in}/${t.token_out}`,
            amount: t.amount_in,
            pnl: t.pnl_realized,
            rationale: t.rationale ?? '',
            time: t.created_at,
        })),
        market: {
            prices: market.prices,
            pools: market.pools,
        },
        memories: relevantMemories.map(m => m.description),
        skills: relevantSkills.map(s => ({
            name: s.name,
            description: s.description,
            successRate: s.success_rate,
        })),
        policyRules: agent.policy_config?.rules ?? [],
    };

    // 6. DECIDE — policy or LLM strategy, with fallback to canned
    const strategy = await selectStrategy(agent);
    const decision: AgentDecision = await strategy.decide(ctx);

    // 7. EXECUTE — through guardrails then executor
    const guardrails = new GuardrailLayer({
        maxPositionPct: agent.policy_config?.maxPositionSize ?? 30,
        maxSlippageBps: agent.policy_config?.maxSlippageBps ?? 200,
        maxTxPerHour: 10,
        allowedProtocols: agent.policy_config?.allowedProtocols ?? ['SprawlDEX'],
        dryRun: false,
    });

    const validation = await guardrails.validate(decision, agent, market);

    if (!validation.valid) {
        console.log(`[AgentTick] Agent ${agent.agent_id} decision blocked: ${validation.reason}`);
        await addMemory(agent.agent_id, {
            type: 'event',
            description: `Attempted ${decision.action} but blocked by guardrails: ${validation.reason}`,
            poignancy: 3,
            keywords: ['guardrail', 'blocked', decision.action],
        });
        return;
    }

    const finalDecision = validation.amended ?? decision;

    if (finalDecision.action === 'hold') {
        console.log(`[AgentTick] Agent ${agent.agent_id} holding: ${finalDecision.rationale}`);
        return;
    }

    const result = await executeDecision(agent, finalDecision, market);

    if (!result.success) {
        console.error(`[AgentTick] Agent ${agent.agent_id} execution failed: ${result.error}`);
        return;
    }

    // 8. RECORD — trade_history + memory + CityState
    await supabaseAdmin.from('trade_history').insert({
        agent_id: agent.agent_id,
        action: finalDecision.action,
        token_in: finalDecision.params.tokenIn ?? finalDecision.params.tokenA,
        token_out: finalDecision.params.tokenOut ?? finalDecision.params.tokenB,
        amount_in: parseFloat(result.amountIn) * 1e18,
        amount_out: parseFloat(result.amountOut) * 1e18,
        price_at_trade: market.prices[finalDecision.params.tokenIn ?? ''] ?? 0,
        pnl_realized: result.realizedPnl,
        tx_hash: result.txHash,
        rationale: finalDecision.rationale,
    });

    await addMemory(agent.agent_id, {
        type: 'trade',
        description: `Executed ${finalDecision.action}: ${finalDecision.params.tokenIn ?? finalDecision.params.tokenA} -> ${finalDecision.params.tokenOut ?? finalDecision.params.tokenB}, amount: ${result.amountIn}, received: ${result.amountOut}, P&L: ${formatUSD(result.realizedPnl)}. Rationale: ${finalDecision.rationale}`,
        poignancy: Math.min(9, 3 + Math.ceil(Math.abs(result.realizedPnl) / 50)),
        keywords: ['trade', finalDecision.action, finalDecision.params.tokenIn, finalDecision.params.tokenOut, result.realizedPnl > 0 ? 'profit' : 'loss'].filter(Boolean) as string[],
    });

    // 9. LEARN — critic verifies, skill manager saves
    if (result.realizedPnl > 0 && agent.strategy_type === 2) {
        try {
            const { skillManager } = await import('../skills/skill-manager');
            await skillManager.maybeLearnSkill(agent.agent_id, finalDecision, result);
        } catch {
            // skill manager not yet available
        }
    }

    // 10. UPDATE agent stats in Supabase
    await supabaseAdmin
        .from('agents')
        .update({
            last_action_at: new Date().toISOString(),
            recent_actions: agent.recent_actions + 1,
        })
        .eq('agent_id', agent.agent_id);

    console.log(`[AgentTick] Agent ${agent.agent_id} completed in ${Date.now() - startTime}ms: ${finalDecision.action} (${formatUSD(result.realizedPnl)})`);
}

// ---------------------------------------------------------------------------
// SettleLatch — next tick only starts after all agents complete current tick
// ---------------------------------------------------------------------------

function createSettleLatch() {
    let resolve: () => void;
    const promise = new Promise<void>((r) => { resolve = r; });
    return { promise, settle: () => resolve!() };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        if (signal.aborted) { resolve(); return; }
        const timer = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve();
        }, { once: true });
    });
}

// ---------------------------------------------------------------------------
// The main tick loop
// ---------------------------------------------------------------------------

interface EngineConfig {
    signal: AbortSignal;
    tickIntervalMs?: number;
    maxAgentsPerTick?: number;
}

async function tickLoop(config: EngineConfig): Promise<void> {
    const interval = config.tickIntervalMs ?? TICK_INTERVAL_MS;
    const maxAgents = config.maxAgentsPerTick ?? MAX_AGENTS;

    console.log(`[TickLoop] Starting tick loop (interval: ${interval}ms, max agents: ${maxAgents})`);

    let tickNumber = 0;

    while (!config.signal.aborted) {
        tickNumber++;
        const tickStart = Date.now();
        const latch = createSettleLatch();

        try {
            const market = await readMarketContext();

            const { data: agents, error } = await supabaseAdmin
                .from('agents')
                .select('*')
                .order('last_action_at', { ascending: true, nullsFirst: true })
                .limit(maxAgents);

            if (error) {
                console.error(`[TickLoop] Failed to load agents: ${error.message}`);
                latch.settle();
                await sleep(interval, config.signal);
                continue;
            }

            if (!agents || agents.length === 0) {
                console.log(`[TickLoop] No agents to process (tick #${tickNumber})`);
                latch.settle();
                await sleep(interval, config.signal);
                continue;
            }

            console.log(`[TickLoop] Tick #${tickNumber}: processing ${agents.length} agents`);

            const results = await Promise.allSettled(
                (agents as AgentRecord[]).map(agent =>
                    tickAgent(agent, market).catch(err => {
                        console.error(`[TickLoop] Agent ${agent.agent_id} failed: ${err.message}`);
                    }),
                ),
            );

            const succeeded = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            const elapsed = Date.now() - tickStart;

            console.log(`[TickLoop] Tick #${tickNumber} complete: ${succeeded} ok, ${failed} failed, ${elapsed}ms`);
        } catch (err: any) {
            console.error(`[TickLoop] Tick #${tickNumber} error: ${err.message}`);
        } finally {
            latch.settle();
        }

        await latch.promise;

        const elapsed = Date.now() - tickStart;
        const sleepTime = Math.max(0, interval - elapsed);
        await sleep(sleepTime, config.signal);
    }

    console.log('[TickLoop] Shut down');
}

// ---------------------------------------------------------------------------
// Public entry point — called by frontend/scripts/run-engine.ts
// ---------------------------------------------------------------------------

export async function startEngine(agents: AgentRecord[]): Promise<void> {
    console.log(`[Engine] Starting engine with ${agents.length} agents registered`);

    const controller = new AbortController();

    process.on('SIGINT', () => {
        console.log('[Engine] SIGINT received, shutting down...');
        controller.abort();
    });
    process.on('SIGTERM', () => {
        console.log('[Engine] SIGTERM received, shutting down...');
        controller.abort();
    });

    await tickLoop({
        signal: controller.signal,
        tickIntervalMs: TICK_INTERVAL_MS,
        maxAgentsPerTick: MAX_AGENTS,
    });
}
