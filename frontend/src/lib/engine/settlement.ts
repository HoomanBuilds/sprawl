import { Contract, parseEther, ZeroHash } from 'ethers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { readPortfolio, calculatePortfolioValue, readMarketContext } from './market-reader';
import { getDeployerWallet, getRefereeWallet } from '@/lib/ethers-provider';
import { CONTRACTS, ERC8004 } from '@/lib/config';
import CityRefereeABI from '@/constants/abi/CityReferee.json';
import { addMemory } from '@/lib/memory/memory-stream';
import { withTxLock } from '@/lib/execution/tx-lock';
import type { AgentRecord } from '@/types/agent';

// Exact BigInt math for the wei NUMERIC ledger (avoids Number()*1e18 float loss).
function addWei(current: number | string | null, humanReward: number): string {
  const base = BigInt(String(current ?? '0').split('.')[0] || '0');
  return (base + BigInt(Math.round(humanReward)) * 10n ** 18n).toString();
}

const SPRAWL_REWARD_PCT = 10;
const MIN_PROFIT_FOR_REWARD = 5;
const MAX_DAILY_SPRAWL = 500;

// Reputation drifts ±1 with settlement P&L (within noise = unchanged), clamped 0-100.
function reputationDrift(currentRep: number, pnl: number): number {
  let delta = 0;
  if (pnl > MIN_PROFIT_FOR_REWARD) delta = 1;
  else if (pnl < -MIN_PROFIT_FOR_REWARD) delta = -1;
  return Math.max(0, Math.min(100, Number(currentRep ?? 0) + delta));
}

// Canonical ERC-8004 ReputationRegistry, Jan 2026 interface (no feedbackAuth).
const REPUTATION_REGISTRY_ABI = [
  'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)',
];

// Post the day's P&L (whole dollars, clamped to ±100000) as on-chain feedback
// under tag "daily-pnl". Best-effort: skipped when no referee key is set.
export async function pushErc8004Feedback(agentId: number, pnl: number): Promise<void> {
  const referee = getRefereeWallet();
  if (!referee) return;
  try {
    const registry = new Contract(ERC8004.ReputationRegistry, REPUTATION_REGISTRY_ABI, referee);
    const score = Math.max(-100_000, Math.min(100_000, Math.round(pnl)));
    const tx = await registry.giveFeedback(agentId, score, 0, 'daily-pnl', 'sprawl', '', '', ZeroHash);
    await tx.wait();
    console.log(`[Settlement] ERC-8004 feedback: agent ${agentId} daily P&L ${score} → ReputationRegistry`);
  } catch (err) {
    console.error(`[Settlement] ERC-8004 feedback failed for agent ${agentId}: ${(err as Error).message}`);
  }
}

export async function settleDaily(agent: AgentRecord): Promise<void> {
  const market = await readMarketContext();
  const portfolio = await readPortfolio(agent.wallet_address);
  const currentValue = calculatePortfolioValue(portfolio, market.prices);
  // NUMERIC columns come back from supabase-js as strings — Number() everywhere.
  const lastValue = Number(agent.last_portfolio_value) / 1e18;
  // No baseline yet: adopt the current value rather than banking the starting
  // balance as profit.
  if (Number(agent.last_portfolio_value) <= 0) {
    const supabase = getSupabaseAdmin();
    await supabase
      .from('agents')
      .update({ last_portfolio_value: Math.floor(currentValue * 1e18), net_pnl: 0 })
      .eq('agent_id', agent.agent_id);
    return;
  }
  const dailyPnl = currentValue - lastValue;

  let sprawlReward = 0;
  if (dailyPnl > MIN_PROFIT_FOR_REWARD) {
    sprawlReward = Math.min(
      Math.floor((dailyPnl * SPRAWL_REWARD_PCT) / 100),
      MAX_DAILY_SPRAWL,
    );
  }

  const deployerWallet = getDeployerWallet();
  const cityReferee = new Contract(
    CONTRACTS.CityReferee,
    CityRefereeABI.abi,
    deployerWallet,
  );

  try {
    const pnlWei = parseEther(dailyPnl.toFixed(18));
    const rewardWei = parseEther(sprawlReward.toString());
    await withTxLock(async () => {
      const tx = await cityReferee.settleDaily(agent.agent_id, pnlWei, rewardWei);
      await tx.wait();
    });
  } catch (err: any) {
    console.error(
      `[Settlement] CityReferee.settleDaily failed for agent ${agent.agent_id}: ${err.message}`,
    );
    sprawlReward = 0;
  }

  // Best-effort ERC-8004 feedback via the referee wallet; fire-and-forget so
  // referee gas exhaustion can't wedge the ledger write below.
  void pushErc8004Feedback(agent.agent_id, dailyPnl);

  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().split('T')[0];
  const profitStreak = dailyPnl > 0 ? agent.profit_streak + 1 : 0;

  await supabase
    .from('agents')
    .update({
      last_portfolio_value: Math.floor(currentValue * 1e18),
      last_settlement_date: today,
      // Baseline just rebased to currentValue, so unrealized P&L resets to 0;
      // this keeps the invariant (last_portfolio_value + net_pnl == wealth).
      net_pnl: 0,
      sprawl_balance: addWei(agent.sprawl_balance, sprawlReward),
      sprawl_lifetime_earned: addWei(agent.sprawl_lifetime_earned, sprawlReward),
      profit_streak: profitStreak,
      reputation_score: reputationDrift(agent.reputation_score, dailyPnl),
      xp_daily: 0,
      xp_daily_date: today,
      recent_actions: 0,
    })
    .eq('agent_id', agent.agent_id);

  await addMemory(agent.agent_id, {
    type: 'event',
    description: `Daily settlement: P&L ${dailyPnl >= 0 ? '+' : ''}$${dailyPnl.toFixed(2)}. ${sprawlReward > 0 ? `Earned ${sprawlReward} $SPRAWL.` : 'No $SPRAWL reward.'} Portfolio: $${currentValue.toFixed(2)}.${profitStreak > 1 ? ` Profit streak: ${profitStreak} days.` : ''}`,
    poignancy: Math.min(9, 4 + Math.ceil(Math.abs(dailyPnl) / 200)),
    keywords: ['settlement', 'daily', dailyPnl > 0 ? 'profit' : 'loss', 'sprawl'],
  });

  await supabase.from('activity_feed').insert({
    event_type: 'settlement',
    actor_id: agent.agent_id,
    metadata: {
      pnl: dailyPnl,
      sprawlReward,
      portfolioValue: currentValue,
      profitStreak,
    },
  });

  console.log(
    `[Settlement] Agent ${agent.agent_id}: P&L $${dailyPnl.toFixed(2)}, reward ${sprawlReward} $SPRAWL`,
  );
}

export function shouldSettle(agent: AgentRecord): boolean {
  const now = new Date();
  if (now.getUTCHours() !== 0) return false;

  const today = now.toISOString().split('T')[0];
  return agent.last_settlement_date !== today;
}

// ---------------------------------------------------------------------------
// Rolling settlement — credits $SPRAWL for recent profit every few minutes so
// the economy is visibly live during a demo (the full settleDaily only fires in
// the UTC-midnight hour). DB-only: banks profit into sprawl_lifetime_earned and
// resets the P&L baseline; the on-chain CityReferee settle stays daily.
// ---------------------------------------------------------------------------

const ROLLING_INTERVAL_MS = 5 * 60_000;
const MAX_ROLLING_SPRAWL = 100;
let lastRollingMs = 0;

async function rollingSettle(agent: AgentRecord): Promise<void> {
  const market = await readMarketContext();
  const portfolio = await readPortfolio(agent.wallet_address);
  const currentValue = calculatePortfolioValue(portfolio, market.prices);
  const lastValue = Number(agent.last_portfolio_value) / 1e18;
  const supabase = getSupabaseAdmin();

  // No baseline yet: adopt the current value rather than banking the starting
  // balance as phantom profit.
  if (Number(agent.last_portfolio_value) <= 0) {
    await supabase
      .from('agents')
      .update({ last_portfolio_value: Math.floor(currentValue * 1e18), net_pnl: 0 })
      .eq('agent_id', agent.agent_id);
    return;
  }

  const pnl = currentValue - lastValue;

  let sprawlReward = 0;
  if (pnl > MIN_PROFIT_FOR_REWARD) {
    sprawlReward = Math.min(
      Math.floor((pnl * SPRAWL_REWARD_PCT) / 100),
      MAX_ROLLING_SPRAWL,
    );
  }

  const profitStreak = pnl > 0 ? agent.profit_streak + 1 : 0;

  // Rebase baseline + reset net_pnl together so wealth stays exact (no flicker).
  await supabase
    .from('agents')
    .update({
      last_portfolio_value: Math.floor(currentValue * 1e18),
      net_pnl: 0,
      sprawl_balance: addWei(agent.sprawl_balance, sprawlReward),
      sprawl_lifetime_earned: addWei(agent.sprawl_lifetime_earned, sprawlReward),
      profit_streak: profitStreak,
      reputation_score: reputationDrift(agent.reputation_score, pnl),
    })
    .eq('agent_id', agent.agent_id);

  if (sprawlReward > 0) {
    await supabase.from('activity_feed').insert({
      event_type: 'settlement',
      actor_id: agent.agent_id,
      metadata: { pnl, sprawlReward, portfolioValue: currentValue, rolling: true },
    });
    console.log(
      `[RollingSettle] Agent ${agent.agent_id}: +${sprawlReward} $SPRAWL (P&L $${pnl.toFixed(2)})`,
    );
  }
}

export async function rollingSettlementCron(): Promise<void> {
  const now = Date.now();
  if (now - lastRollingMs < ROLLING_INTERVAL_MS) return;
  lastRollingMs = now;

  const supabase = getSupabaseAdmin();
  const { data: agents, error } = await supabase.from('agents').select('*');
  if (error || !agents) return;

  for (const agent of agents as AgentRecord[]) {
    try {
      await rollingSettle(agent);
    } catch (err: any) {
      console.error(`[RollingSettle] Agent ${agent.agent_id} failed: ${err.message}`);
    }
  }
}

export async function settlementCron(): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: agents, error } = await supabase.from('agents').select('*');
  if (error || !agents) {
    console.error(`[Settlement] Failed to load agents: ${error?.message}`);
    return;
  }

  let settled = 0;
  for (const agent of agents as AgentRecord[]) {
    if (!shouldSettle(agent)) continue;
    try {
      await settleDaily(agent);
      settled++;
    } catch (err: any) {
      console.error(
        `[Settlement] Failed to settle agent ${agent.agent_id}: ${err.message}`,
      );
    }
  }

  if (settled > 0) {
    console.log(`[Settlement] Cron complete: ${settled} agents settled`);
  }
}
