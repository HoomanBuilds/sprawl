import { Contract, formatEther } from 'ethers';
import { getMantleSepoliaProvider } from '../ethers-provider';
import { CONTRACTS, TOKEN_SYMBOLS } from '../config';
import SprawlDEXABI from '@/constants/abi/SprawlDEX.json';
import CityStateABI from '@/constants/abi/CityState.json';
import RaidContractABI from '@/constants/abi/RaidContract.json';
import { supabaseAdmin } from '../supabase';

const CHUNK_SIZE = 1000;
const INDEXER_STATE_KEY = 'main';

// ---------------------------------------------------------------------------
// Block cursor persistence
// ---------------------------------------------------------------------------

async function getLastBlock(): Promise<number> {
    const { data } = await supabaseAdmin
        .from('indexer_state')
        .select('last_block')
        .eq('key', INDEXER_STATE_KEY)
        .single();

    return data?.last_block ?? 0;
}

async function setLastBlock(block: number): Promise<void> {
    await supabaseAdmin
        .from('indexer_state')
        .upsert({ key: INDEXER_STATE_KEY, last_block: block, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

// ---------------------------------------------------------------------------
// Address-to-symbol helper
// ---------------------------------------------------------------------------

function symbolFromAddress(addr: string): string {
    return TOKEN_SYMBOLS[addr] ?? addr.slice(0, 10);
}

// ---------------------------------------------------------------------------
// CityState event handlers
// ---------------------------------------------------------------------------

async function handleAgentSpawned(agentId: bigint, wallet: string, strategyType: number): Promise<void> {
    console.log(`[Indexer] AgentSpawned: ${agentId} (${wallet})`);
    try {
        const { error } = await supabaseAdmin.from('agents').upsert({
            agent_id: Number(agentId),
            wallet_address: wallet,
            owner_address: wallet,
            strategy_type: strategyType,
            total_volume: 0,
            net_pnl: 0,
            xp_level: 1,
            xp_total: 0,
        }, { onConflict: 'agent_id' });

        if (error) console.error(`[Indexer] Failed to upsert agent: ${error.message}`);

        await supabaseAdmin.from('activity_feed').insert({
            event_type: 'spawn',
            actor_id: Number(agentId),
            metadata: { wallet, strategyType },
        });
    } catch (err: any) {
        console.error(`[Indexer] AgentSpawned handler error: ${err.message}`);
    }
}

async function handleAgentDecision(agentId: bigint, action: string, protocol: string, params: string, ts: bigint): Promise<void> {
    console.log(`[Indexer] AgentDecision: agent ${agentId} — ${action} on ${protocol}`);
    try {
        await supabaseAdmin.from('activity_feed').insert({
            event_type: 'decision',
            actor_id: Number(agentId),
            metadata: { action, protocol, ts: Number(ts) },
        });
    } catch (err: any) {
        console.error(`[Indexer] AgentDecision handler error: ${err.message}`);
    }
}

async function handleAgentOutcome(agentId: bigint, pnlDelta: bigint, newVolume: bigint, newLevel: bigint): Promise<void> {
    console.log(`[Indexer] AgentOutcome: ${agentId} volume=${newVolume} level=${newLevel}`);
    try {
        await supabaseAdmin
            .from('agents')
            .update({
                total_volume: newVolume.toString(),
                xp_level: Number(newLevel),
            })
            .eq('agent_id', Number(agentId));
    } catch (err: any) {
        console.error(`[Indexer] AgentOutcome handler error: ${err.message}`);
    }
}

async function handleBuildingGrew(agentId: bigint, newLevel: bigint): Promise<void> {
    console.log(`[Indexer] BuildingGrew: Agent ${agentId} -> level ${newLevel}`);
    await supabaseAdmin.from('activity_feed').insert({
        event_type: 'level_up',
        actor_id: Number(agentId),
        metadata: { level: Number(newLevel) },
    });
}

async function handleRaidRecorded(attackerId: bigint, defenderId: bigint, attackerWon: boolean): Promise<void> {
    console.log(`[Indexer] RaidRecorded: ${attackerId} vs ${defenderId} — ${attackerWon ? 'attacker won' : 'defender won'}`);
    await supabaseAdmin.from('activity_feed').insert({
        event_type: 'raid',
        actor_id: Number(attackerId),
        metadata: { defenderId: Number(defenderId), attackerWon },
    });
}

// ---------------------------------------------------------------------------
// SprawlDEX event handlers
// ---------------------------------------------------------------------------

async function handleSwap(
    trader: string, tokenIn: string, tokenOut: string,
    amountIn: bigint, amountOut: bigint, priceAfter: bigint, fee: bigint,
): Promise<void> {
    const symIn = symbolFromAddress(tokenIn);
    const symOut = symbolFromAddress(tokenOut);
    console.log(`[Indexer] Swap: ${trader} ${formatEther(amountIn)} ${symIn} -> ${formatEther(amountOut)} ${symOut}`);

    try {
        await supabaseAdmin.from('trade_history').insert({
            agent_id: null,
            action: 'swap',
            token_in: symIn,
            token_out: symOut,
            amount_in: amountIn.toString(),
            amount_out: amountOut.toString(),
            price_at_trade: parseFloat(formatEther(priceAfter)),
            tx_hash: trader,
        });

        await supabaseAdmin.from('activity_feed').insert({
            event_type: 'swap',
            metadata: {
                trader,
                tokenIn: symIn,
                tokenOut: symOut,
                amountIn: formatEther(amountIn),
                amountOut: formatEther(amountOut),
                fee: formatEther(fee),
            },
        });
    } catch (err: any) {
        console.error(`[Indexer] Swap handler error: ${err.message}`);
    }
}

async function handleLiquidityAdded(
    provider: string, poolId: string,
    amountA: bigint, amountB: bigint, shares: bigint,
): Promise<void> {
    console.log(`[Indexer] LiquidityAdded: ${provider} pool=${poolId.slice(0, 10)} shares=${formatEther(shares)}`);
    await supabaseAdmin.from('activity_feed').insert({
        event_type: 'liquidity_added',
        metadata: {
            provider,
            poolId,
            amountA: formatEther(amountA),
            amountB: formatEther(amountB),
            shares: formatEther(shares),
        },
    });
}

async function handleLiquidityRemoved(
    provider: string, poolId: string,
    amountA: bigint, amountB: bigint, shares: bigint,
): Promise<void> {
    console.log(`[Indexer] LiquidityRemoved: ${provider} pool=${poolId.slice(0, 10)} shares=${formatEther(shares)}`);
    await supabaseAdmin.from('activity_feed').insert({
        event_type: 'liquidity_removed',
        metadata: {
            provider,
            poolId,
            amountA: formatEther(amountA),
            amountB: formatEther(amountB),
            shares: formatEther(shares),
        },
    });
}

async function handlePoolCreated(poolId: string, tokenA: string, tokenB: string): Promise<void> {
    const symA = symbolFromAddress(tokenA);
    const symB = symbolFromAddress(tokenB);
    console.log(`[Indexer] PoolCreated: ${symA}/${symB} (${poolId.slice(0, 10)})`);
    await supabaseAdmin.from('activity_feed').insert({
        event_type: 'pool_created',
        metadata: { poolId, tokenA: symA, tokenB: symB },
    });
}

// ---------------------------------------------------------------------------
// RaidContract event handlers
// ---------------------------------------------------------------------------

async function handleRaidResult(
    attackerId: bigint, defenderId: bigint,
    attackerWon: boolean, attackScore: bigint, defenseScore: bigint,
): Promise<void> {
    console.log(`[Indexer] RaidResult: ${attackerId} vs ${defenderId} (${attackScore} vs ${defenseScore})`);
    await supabaseAdmin.from('activity_feed').insert({
        event_type: 'raid_result',
        actor_id: Number(attackerId),
        metadata: {
            defenderId: Number(defenderId),
            attackerWon,
            attackScore: Number(attackScore),
            defenseScore: Number(defenseScore),
        },
    });
}

// ---------------------------------------------------------------------------
// Historical catch-up: process old events in chunks
// ---------------------------------------------------------------------------

async function catchUp(
    cityState: Contract, dex: Contract, raid: Contract,
    fromBlock: number, toBlock: number,
): Promise<void> {
    console.log(`[Indexer] Catching up from block ${fromBlock} to ${toBlock}`);

    for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
        const end = Math.min(start + CHUNK_SIZE - 1, toBlock);

        try {
            const [spawns, decisions, outcomes, grows, raids] = await Promise.all([
                cityState.queryFilter(cityState.filters.AgentSpawned(), start, end),
                cityState.queryFilter(cityState.filters.AgentDecision(), start, end),
                cityState.queryFilter(cityState.filters.AgentOutcome(), start, end),
                cityState.queryFilter(cityState.filters.BuildingGrew(), start, end),
                cityState.queryFilter(cityState.filters.RaidRecorded(), start, end),
            ]);

            const [swaps, adds, removes, poolCreated, raidResults] = await Promise.all([
                dex.queryFilter(dex.filters.Swap(), start, end),
                dex.queryFilter(dex.filters.LiquidityAdded(), start, end),
                dex.queryFilter(dex.filters.LiquidityRemoved(), start, end),
                dex.queryFilter(dex.filters.PoolCreated(), start, end),
                raid.queryFilter(raid.filters.RaidResult(), start, end),
            ]);

            for (const e of spawns) await handleAgentSpawned(e.args![0], e.args![1], Number(e.args![2]));
            for (const e of decisions) await handleAgentDecision(e.args![0], e.args![1], e.args![2], e.args![3], e.args![4]);
            for (const e of outcomes) await handleAgentOutcome(e.args![0], e.args![1], e.args![2], e.args![3]);
            for (const e of grows) await handleBuildingGrew(e.args![0], e.args![1]);
            for (const e of raids) await handleRaidRecorded(e.args![0], e.args![1], e.args![2]);
            for (const e of swaps) await handleSwap(e.args![0], e.args![1], e.args![2], e.args![3], e.args![4], e.args![5], e.args![6]);
            for (const e of adds) await handleLiquidityAdded(e.args![0], e.args![1], e.args![2], e.args![3], e.args![4]);
            for (const e of removes) await handleLiquidityRemoved(e.args![0], e.args![1], e.args![2], e.args![3], e.args![4]);
            for (const e of poolCreated) await handlePoolCreated(e.args![0], e.args![1], e.args![2]);
            for (const e of raidResults) await handleRaidResult(e.args![0], e.args![1], e.args![2], e.args![3], e.args![4]);

            await setLastBlock(end);
        } catch (err: any) {
            console.error(`[Indexer] Catch-up chunk ${start}-${end} failed: ${err.message}`);
        }
    }
}

// ---------------------------------------------------------------------------
// Real-time listener
// ---------------------------------------------------------------------------

function attachListeners(cityState: Contract, dex: Contract, raid: Contract): void {
    cityState.on('AgentSpawned', handleAgentSpawned);
    cityState.on('AgentDecision', handleAgentDecision);
    cityState.on('AgentOutcome', handleAgentOutcome);
    cityState.on('BuildingGrew', handleBuildingGrew);
    cityState.on('RaidRecorded', handleRaidRecorded);

    dex.on('Swap', handleSwap);
    dex.on('LiquidityAdded', handleLiquidityAdded);
    dex.on('LiquidityRemoved', handleLiquidityRemoved);
    dex.on('PoolCreated', handlePoolCreated);

    raid.on('RaidResult', handleRaidResult);
}

function detachListeners(cityState: Contract, dex: Contract, raid: Contract): void {
    cityState.removeAllListeners();
    dex.removeAllListeners();
    raid.removeAllListeners();
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export async function startIndexer(signal: AbortSignal): Promise<void> {
    const provider = getMantleSepoliaProvider();
    const cityState = new Contract(CONTRACTS.CityState, CityStateABI.abi, provider);
    const dex = new Contract(CONTRACTS.SprawlDEX, SprawlDEXABI.abi, provider);
    const raid = new Contract(CONTRACTS.RaidContract, RaidContractABI.abi, provider);

    console.log('[Indexer] Starting chain event indexer');

    const lastBlock = await getLastBlock();
    const latestBlock = await provider.getBlockNumber();

    if (lastBlock < latestBlock) {
        await catchUp(cityState, dex, raid, lastBlock + 1, latestBlock);
        await setLastBlock(latestBlock);
    }

    attachListeners(cityState, dex, raid);

    provider.on('block', async (blockNumber: number) => {
        await setLastBlock(blockNumber);
    });

    console.log('[Indexer] Listening for CityState + SprawlDEX + RaidContract events');

    signal.addEventListener('abort', () => {
        console.log('[Indexer] Shutting down');
        detachListeners(cityState, dex, raid);
        provider.removeAllListeners();
    }, { once: true });

    await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => resolve(), { once: true });
    });
}
