import { Contract, formatEther, EventLog, Log } from 'ethers';
import { getMantleSepoliaProvider } from '../ethers-provider';
import { CONTRACTS, TOKEN_SYMBOLS } from '../config';
import SprawlDEXABI from '@/constants/abi/SprawlDEX.json';
import CityStateABI from '@/constants/abi/CityState.json';
import RaidContractABI from '@/constants/abi/RaidContract.json';
import { supabaseAdmin } from '../supabase';
import { trackDailyMission } from '../dailies';

const CHUNK_SIZE = 1000;
const INDEXER_STATE_KEY = 'main';
const REALTIME_CHANNEL = 'city-feed';

// ---------------------------------------------------------------------------
// Supabase Realtime broadcast (PetSupervisor pattern from eth-open-agents)
// ---------------------------------------------------------------------------

const realtimeChannel = supabaseAdmin.channel(REALTIME_CHANNEL);

async function broadcastEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    try {
        await realtimeChannel.send({
            type: 'broadcast',
            event: eventType,
            payload,
        });
    } catch {
        // Realtime broadcast is best-effort — don't crash the indexer
    }
}

// Write to activity_feed AND broadcast simultaneously
async function writeFeedAndBroadcast(
    eventType: string,
    actorId: number | null,
    targetId: number | null,
    metadata: Record<string, unknown>,
): Promise<void> {
    const row = { event_type: eventType, actor_id: actorId, target_id: targetId, metadata };

    await Promise.all([
        supabaseAdmin.from('activity_feed').insert(row),
        broadcastEvent(eventType, { ...row, timestamp: new Date().toISOString() }),
    ]);
}

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
// Address-to-symbol + agent lookup helpers
// ---------------------------------------------------------------------------

function symbolFromAddress(addr: string): string {
    return TOKEN_SYMBOLS[addr] ?? addr.slice(0, 10);
}

async function findAgentByWallet(walletAddress: string): Promise<number | null> {
    const { data } = await supabaseAdmin
        .from('agents')
        .select('agent_id')
        .eq('wallet_address', walletAddress)
        .single();
    return data?.agent_id ?? null;
}

// ---------------------------------------------------------------------------
// CityState event handlers
// ---------------------------------------------------------------------------

async function handleAgentSpawned(agentId: bigint, wallet: string, strategyType: number): Promise<void> {
    console.log(`[Indexer] AgentSpawned: ${agentId} (${wallet})`);
    try {
        await supabaseAdmin.from('agents').upsert({
            agent_id: Number(agentId),
            wallet_address: wallet,
            owner_address: wallet,
            strategy_type: strategyType,
            total_volume: 0,
            net_pnl: 0,
            xp_level: 1,
            xp_total: 0,
        }, { onConflict: 'agent_id' });

        await writeFeedAndBroadcast('spawn', Number(agentId), null, { wallet, strategyType });
    } catch (err: any) {
        console.error(`[Indexer] AgentSpawned handler error: ${err.message}`);
    }
}

async function handleAgentDecision(agentId: bigint, action: string, protocol: string, params: string, ts: bigint): Promise<void> {
    console.log(`[Indexer] AgentDecision: agent ${agentId} — ${action} on ${protocol}`);
    try {
        await writeFeedAndBroadcast('decision', Number(agentId), null, { action, protocol, ts: Number(ts) });
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
                net_pnl: Number(pnlDelta),
                xp_level: Number(newLevel),
            })
            .eq('agent_id', Number(agentId));

        await writeFeedAndBroadcast('outcome', Number(agentId), null, {
            pnlDelta: formatEther(pnlDelta),
            volume: formatEther(newVolume),
            level: Number(newLevel),
        });
    } catch (err: any) {
        console.error(`[Indexer] AgentOutcome handler error: ${err.message}`);
    }
}

async function handleBuildingGrew(agentId: bigint, newLevel: bigint): Promise<void> {
    console.log(`[Indexer] BuildingGrew: Agent ${agentId} -> level ${newLevel}`);
    await writeFeedAndBroadcast('level_up', Number(agentId), null, { level: Number(newLevel) });
}

async function handleRaidRecorded(attackerId: bigint, defenderId: bigint, attackerWon: boolean): Promise<void> {
    console.log(`[Indexer] RaidRecorded: ${attackerId} vs ${defenderId} — ${attackerWon ? 'attacker won' : 'defender won'}`);

    // Write to raids table
    await supabaseAdmin.from('raids').insert({
        attacker_id: Number(attackerId),
        defender_id: Number(defenderId),
        success: attackerWon,
    });

    // Update agent raid stats
    if (attackerWon) {
        await supabaseAdmin.rpc('increment_field', { p_agent_id: Number(attackerId), p_field: 'raid_wins' });
        await supabaseAdmin.rpc('increment_field', { p_agent_id: Number(defenderId), p_field: 'raid_losses' });
    } else {
        await supabaseAdmin.rpc('increment_field', { p_agent_id: Number(attackerId), p_field: 'raid_losses' });
        await supabaseAdmin.rpc('increment_field', { p_agent_id: Number(defenderId), p_field: 'raid_wins' });
    }

    await writeFeedAndBroadcast('raid', Number(attackerId), Number(defenderId), { attackerWon });
}

// ---------------------------------------------------------------------------
// SprawlDEX event handlers
// ---------------------------------------------------------------------------

async function handleSwap(
    trader: string, tokenIn: string, tokenOut: string,
    amountIn: bigint, amountOut: bigint, priceAfter: bigint, fee: bigint,
    event?: EventLog,
): Promise<void> {
    const symIn = symbolFromAddress(tokenIn);
    const symOut = symbolFromAddress(tokenOut);
    const txHash = event?.transactionHash ?? 'unknown';
    console.log(`[Indexer] Swap: ${trader} ${formatEther(amountIn)} ${symIn} -> ${formatEther(amountOut)} ${symOut} (tx: ${txHash.slice(0, 10)})`);

    try {
        // Look up agent by wallet address
        const agentId = await findAgentByWallet(trader);

        await supabaseAdmin.from('trade_history').insert({
            agent_id: agentId,
            action: 'swap',
            token_in: symIn,
            token_out: symOut,
            amount_in: amountIn.toString(),
            amount_out: amountOut.toString(),
            price_at_trade: parseFloat(formatEther(priceAfter)),
            tx_hash: txHash,
        });

        // Update agent volume if this is an agent trade (not market maker)
        if (agentId !== null) {
            const amountUSD = parseFloat(formatEther(amountIn));
            await supabaseAdmin.rpc('increment_volume', {
                p_agent_id: agentId,
                p_amount: Math.floor(amountUSD),
            });
            await trackDailyMission(agentId, 'trade_volume_500', { volume: amountUSD });
            await trackDailyMission(agentId, 'trade_volume_2000', { volume: amountUSD });
        }

        await writeFeedAndBroadcast('swap', agentId, null, {
            trader,
            tokenIn: symIn,
            tokenOut: symOut,
            amountIn: formatEther(amountIn),
            amountOut: formatEther(amountOut),
            fee: formatEther(fee),
            txHash,
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
    const agentId = await findAgentByWallet(provider);
    await writeFeedAndBroadcast('liquidity_added', agentId, null, {
        provider, poolId,
        amountA: formatEther(amountA),
        amountB: formatEther(amountB),
        shares: formatEther(shares),
    });
}

async function handleLiquidityRemoved(
    provider: string, poolId: string,
    amountA: bigint, amountB: bigint, shares: bigint,
): Promise<void> {
    console.log(`[Indexer] LiquidityRemoved: ${provider} pool=${poolId.slice(0, 10)} shares=${formatEther(shares)}`);
    const agentId = await findAgentByWallet(provider);
    await writeFeedAndBroadcast('liquidity_removed', agentId, null, {
        provider, poolId,
        amountA: formatEther(amountA),
        amountB: formatEther(amountB),
        shares: formatEther(shares),
    });
}

async function handlePoolCreated(poolId: string, tokenA: string, tokenB: string): Promise<void> {
    const symA = symbolFromAddress(tokenA);
    const symB = symbolFromAddress(tokenB);
    console.log(`[Indexer] PoolCreated: ${symA}/${symB} (${poolId.slice(0, 10)})`);
    await writeFeedAndBroadcast('pool_created', null, null, { poolId, tokenA: symA, tokenB: symB });
}

// ---------------------------------------------------------------------------
// RaidContract event handlers
// ---------------------------------------------------------------------------

async function handleRaidResult(
    attackerId: bigint, defenderId: bigint,
    attackerWon: boolean, attackScore: bigint, defenseScore: bigint,
): Promise<void> {
    console.log(`[Indexer] RaidResult: ${attackerId} vs ${defenderId} (${attackScore} vs ${defenseScore})`);
    await writeFeedAndBroadcast('raid_result', Number(attackerId), Number(defenderId), {
        attackerWon,
        attackScore: Number(attackScore),
        defenseScore: Number(defenseScore),
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
            const ev = (logs: (Log | EventLog)[]): EventLog[] => logs.filter((l): l is EventLog => 'args' in l);

            const [spawns, decisions, outcomes, grows, raidRecords] = (await Promise.all([
                cityState.queryFilter(cityState.filters.AgentSpawned(), start, end),
                cityState.queryFilter(cityState.filters.AgentDecision(), start, end),
                cityState.queryFilter(cityState.filters.AgentOutcome(), start, end),
                cityState.queryFilter(cityState.filters.BuildingGrew(), start, end),
                cityState.queryFilter(cityState.filters.RaidRecorded(), start, end),
            ])).map(ev);

            const [swaps, adds, removes, poolCreated, raidResults] = (await Promise.all([
                dex.queryFilter(dex.filters.Swap(), start, end),
                dex.queryFilter(dex.filters.LiquidityAdded(), start, end),
                dex.queryFilter(dex.filters.LiquidityRemoved(), start, end),
                dex.queryFilter(dex.filters.PoolCreated(), start, end),
                raid.queryFilter(raid.filters.RaidResult(), start, end),
            ])).map(ev);

            for (const e of spawns) await handleAgentSpawned(e.args![0], e.args![1], Number(e.args![2]));
            for (const e of decisions) await handleAgentDecision(e.args![0], e.args![1], e.args![2], e.args![3], e.args![4]);
            for (const e of outcomes) await handleAgentOutcome(e.args![0], e.args![1], e.args![2], e.args![3]);
            for (const e of grows) await handleBuildingGrew(e.args![0], e.args![1]);
            for (const e of raidRecords) await handleRaidRecorded(e.args![0], e.args![1], e.args![2]);
            for (const e of swaps) await handleSwap(e.args![0], e.args![1], e.args![2], e.args![3], e.args![4], e.args![5], e.args![6], e as EventLog);
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

    dex.on('Swap', (...args: any[]) => {
        // ethers v6 passes the event as the last arg in live listeners
        const event = args[args.length - 1];
        handleSwap(args[0], args[1], args[2], args[3], args[4], args[5], args[6], event);
    });
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

    // Subscribe to Realtime channel
    realtimeChannel.subscribe();
    console.log('[Indexer] Realtime broadcast channel active');

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
        realtimeChannel.unsubscribe();
    }, { once: true });

    await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => resolve(), { once: true });
    });
}
