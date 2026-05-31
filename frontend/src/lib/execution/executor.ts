import { Contract, Interface, parseEther, formatEther, MaxUint256 } from 'ethers';
import { CONTRACTS } from '../config';
import SprawlDEXABI from '@/constants/abi/SprawlDEX.json';
import SprawlTokenABI from '@/constants/abi/SprawlToken.json';
import CityStateABI from '@/constants/abi/CityState.json';
import RaidContractABI from '@/constants/abi/RaidContract.json';
import { withTxLock } from './tx-lock';
import { getAgentWallet } from './wallet-manager';
import { getDeployerWallet } from '../ethers-provider';
import { supabaseAdmin } from '../supabase';
import type { AgentDecision, ExecutionResult } from '@/types/engine';
import type { AgentRecord } from '@/types/agent';
import type { MarketSnapshot } from '@/types/market';

export async function executeDecision(
    agent: AgentRecord,
    decision: AgentDecision,
    market: MarketSnapshot,
): Promise<ExecutionResult> {
    switch (decision.action) {
        case 'swap':
            return executeSwap(agent, decision, market);
        case 'provideLiquidity':
            return executeAddLiquidity(agent, decision);
        case 'removeLiquidity':
            return executeRemoveLiquidity(agent, decision);
        case 'raid':
            return executeRaid(agent, decision);
        case 'hold':
            return { txHash: '', success: true, amountIn: '0', amountOut: '0', realizedPnl: 0 };
        default:
            return {
                txHash: '',
                success: false,
                amountIn: '0',
                amountOut: '0',
                realizedPnl: 0,
                error: `Unknown action: ${decision.action}`,
            };
    }
}

async function executeSwap(
    agent: AgentRecord,
    decision: AgentDecision,
    market: MarketSnapshot,
): Promise<ExecutionResult> {
    return withTxLock(async () => {
        const wallet = await getAgentWallet(agent.agent_id);
        const dex = new Contract(CONTRACTS.SprawlDEX, SprawlDEXABI.abi, wallet);

        const tokenInAddress = CONTRACTS[decision.params.tokenIn as keyof typeof CONTRACTS];
        const tokenOutAddress = CONTRACTS[decision.params.tokenOut as keyof typeof CONTRACTS];

        if (!tokenInAddress || !tokenOutAddress) {
            return { txHash: '', success: false, amountIn: '0', amountOut: '0', realizedPnl: 0, error: 'Invalid token' };
        }

        const amountIn = parseEther(decision.params.amountIn);
        const amountOutMin = decision.params.amountOutMin
            ? parseEther(decision.params.amountOutMin)
            : 0n;

        // Approve if needed
        const token = new Contract(tokenInAddress, SprawlTokenABI.abi, wallet);
        const allowance: bigint = await token.allowance(wallet.address, CONTRACTS.SprawlDEX);
        if (allowance < amountIn) {
            const approveTx = await token.approve(CONTRACTS.SprawlDEX, MaxUint256);
            await approveTx.wait();
        }

        const tx = await dex.swap(tokenInAddress, tokenOutAddress, amountIn, amountOutMin);
        const receipt = await tx.wait();

        // Parse swap event for amountOut
        const swapLog = receipt.logs.find(
            (log: any) => log.fragment?.name === 'Swap',
        );
        const amountOut: bigint = swapLog?.args?.amountOut ?? 0n;

        const inPrice = market.prices[decision.params.tokenIn] ?? 0;
        const outPrice = market.prices[decision.params.tokenOut] ?? 0;
        const inValue = parseFloat(formatEther(amountIn)) * inPrice;
        const outValue = parseFloat(formatEther(amountOut)) * outPrice;
        const realizedPnl = outValue - inValue;

        await recordOnChain(wallet, agent.agent_id, decision);

        await supabaseAdmin.from('activity_feed').insert({
            event_type: 'swap',
            actor_id: agent.agent_id,
            metadata: {
                tokenIn: decision.params.tokenIn,
                tokenOut: decision.params.tokenOut,
                amountIn: formatEther(amountIn),
                amountOut: formatEther(amountOut),
                pnl: realizedPnl,
                rationale: decision.rationale,
                tx_hash: receipt.hash,
            },
        });

        return {
            txHash: receipt.hash,
            success: true,
            amountIn: formatEther(amountIn),
            amountOut: formatEther(amountOut),
            realizedPnl,
        };
    });
}

async function executeAddLiquidity(
    agent: AgentRecord,
    decision: AgentDecision,
): Promise<ExecutionResult> {
    return withTxLock(async () => {
        const wallet = await getAgentWallet(agent.agent_id);
        const dex = new Contract(CONTRACTS.SprawlDEX, SprawlDEXABI.abi, wallet);

        const tokenAAddress = CONTRACTS[decision.params.tokenA as keyof typeof CONTRACTS];
        const tokenBAddress = CONTRACTS[decision.params.tokenB as keyof typeof CONTRACTS];
        const amountA = parseEther(decision.params.amountA);
        const amountB = parseEther(decision.params.amountB);

        for (const [addr, amt] of [[tokenAAddress, amountA], [tokenBAddress, amountB]] as const) {
            const tkn = new Contract(addr, SprawlTokenABI.abi, wallet);
            const allowance: bigint = await tkn.allowance(wallet.address, CONTRACTS.SprawlDEX);
            if (allowance < amt) {
                const approveTx = await tkn.approve(CONTRACTS.SprawlDEX, MaxUint256);
                await approveTx.wait();
            }
        }

        const tx = await dex.addLiquidity(tokenAAddress, tokenBAddress, amountA, amountB);
        const receipt = await tx.wait();

        await recordOnChain(wallet, agent.agent_id, decision);

        return {
            txHash: receipt.hash,
            success: true,
            amountIn: formatEther(amountA),
            amountOut: formatEther(amountB),
            realizedPnl: 0,
        };
    });
}

async function executeRemoveLiquidity(
    agent: AgentRecord,
    decision: AgentDecision,
): Promise<ExecutionResult> {
    return withTxLock(async () => {
        const wallet = await getAgentWallet(agent.agent_id);
        const dex = new Contract(CONTRACTS.SprawlDEX, SprawlDEXABI.abi, wallet);

        const tokenAAddress = CONTRACTS[decision.params.tokenA as keyof typeof CONTRACTS];
        const tokenBAddress = CONTRACTS[decision.params.tokenB as keyof typeof CONTRACTS];
        const shares = parseEther(decision.params.shares);

        const tx = await dex.removeLiquidity(tokenAAddress, tokenBAddress, shares);
        const receipt = await tx.wait();

        await recordOnChain(wallet, agent.agent_id, decision);

        return {
            txHash: receipt.hash,
            success: true,
            amountIn: formatEther(shares),
            amountOut: '0',
            realizedPnl: 0,
        };
    });
}

const RAID_COST = '5';
const MAX_RAIDS_PER_DAY = 3;

// Autonomous raid: the agent picks a rival, burns 5 SPRAWL, the deployer settles
// the on-chain raid (scoring + winner), and we record + grant raid XP. The indexer
// syncs the raids table + raid_wins/losses from the RaidRecorded event.
async function executeRaid(
    agent: AgentRecord,
    decision: AgentDecision,
): Promise<ExecutionResult> {
    return withTxLock(async () => {
        const fail = (error: string): ExecutionResult => ({
            txHash: '', success: false, amountIn: '0', amountOut: '0', realizedPnl: 0, error,
        });

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const { count } = await supabaseAdmin
            .from('raids')
            .select('id', { count: 'exact', head: true })
            .eq('attacker_id', agent.agent_id)
            .gte('created_at', todayStart.toISOString());
        if ((count ?? 0) >= MAX_RAIDS_PER_DAY) return fail('daily raid limit reached');

        // Pick a rival: the target named by the decision, else a random other agent.
        let defenderId = Number(decision.params?.targetId);
        if (!defenderId || defenderId === agent.agent_id) {
            const { data: rivals } = await supabaseAdmin
                .from('agents')
                .select('agent_id')
                .neq('agent_id', agent.agent_id)
                .not('wallet_address', 'is', null)
                .limit(50);
            if (!rivals || rivals.length === 0) return fail('no rival to raid');
            defenderId = rivals[Math.floor(Math.random() * rivals.length)].agent_id;
        }

        const wallet = await getAgentWallet(agent.agent_id);
        const cost = parseEther(RAID_COST);
        const sprawl = new Contract(CONTRACTS.SPRAWL, SprawlTokenABI.abi, wallet);
        const allowance: bigint = await sprawl.allowance(wallet.address, CONTRACTS.RaidContract);
        if (allowance < cost) {
            await (await sprawl.approve(CONTRACTS.RaidContract, MaxUint256)).wait();
        }

        const raid = new Contract(CONTRACTS.RaidContract, RaidContractABI.abi, getDeployerWallet());
        const receipt = await (await raid.initiateRaid(agent.agent_id, defenderId, wallet.address)).wait();

        const iface = new Interface(RaidContractABI.abi);
        let attackerWon = false, attackScore = 0, defenseScore = 0;
        for (const log of receipt.logs) {
            try {
                const p = iface.parseLog({ topics: log.topics, data: log.data });
                if (p && p.name === 'RaidResult') {
                    attackerWon = Boolean(p.args.attackerWon);
                    attackScore = Number(p.args.attackScore);
                    defenseScore = Number(p.args.defenseScore);
                    break;
                }
            } catch { /* not a RaidResult log */ }
        }

        const xp = attackerWon ? 50 : 15;
        await Promise.all([
            supabaseAdmin.rpc('increment_raid_xp', { p_agent_id: agent.agent_id, p_amount: xp }),
            supabaseAdmin.rpc('grant_xp', {
                p_agent_id: agent.agent_id,
                p_source: attackerWon ? 'raid_win' : 'raid_loss',
                p_amount: xp,
            }),
        ]);

        await supabaseAdmin.from('activity_feed').insert({
            event_type: attackerWon ? 'raid_success' : 'raid_failed',
            actor_id: agent.agent_id,
            target_id: defenderId,
            metadata: {
                attacker_won: attackerWon,
                attack_score: attackScore,
                defense_score: defenseScore,
                rationale: decision.rationale,
                tx_hash: receipt.hash,
            },
        });

        return {
            txHash: receipt.hash,
            success: true,
            amountIn: RAID_COST,
            amountOut: '0',
            realizedPnl: 0,
        };
    });
}

async function recordOnChain(
    wallet: any,
    agentId: number,
    decision: AgentDecision,
): Promise<void> {
    try {
        const cityState = new Contract(CONTRACTS.CityState, CityStateABI.abi, wallet);
        const { AbiCoder } = await import('ethers');
        const coder = new AbiCoder();
        const encodedParams = coder.encode(
            ['string'],
            [JSON.stringify(decision.params)],
        );
        await cityState.recordDecision(
            agentId,
            decision.action,
            decision.protocol,
            encodedParams,
        );
    } catch (err: any) {
        console.error(`[Executor] Failed to record decision on-chain: ${err.message}`);
    }
}
