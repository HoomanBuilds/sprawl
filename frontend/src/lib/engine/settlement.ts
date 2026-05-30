import { Contract, parseEther } from 'ethers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { readPortfolio, calculatePortfolioValue, readMarketContext } from './market-reader';
import { getDeployerWallet } from '@/lib/ethers-provider';
import { CONTRACTS } from '@/lib/config';
import CityRefereeABI from '@/constants/abi/CityReferee.json';
import { addMemory } from '@/lib/memory/memory-stream';
import type { AgentRecord } from '@/types/agent';

const SPRAWL_REWARD_PCT = 10;
const MIN_PROFIT_FOR_REWARD = 5;
const MAX_DAILY_SPRAWL = 500;

export async function settleDaily(agent: AgentRecord): Promise<void> {
  const market = await readMarketContext();
  const portfolio = await readPortfolio(agent.wallet_address);
  const currentValue = calculatePortfolioValue(portfolio, market.prices);
  const lastValue = agent.last_portfolio_value / 1e18;
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
    const tx = await cityReferee.settleDaily(agent.agent_id, pnlWei, rewardWei);
    await tx.wait();
  } catch (err: any) {
    console.error(
      `[Settlement] CityReferee.settleDaily failed for agent ${agent.agent_id}: ${err.message}`,
    );
    sprawlReward = 0;
  }

  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().split('T')[0];
  const profitStreak = dailyPnl > 0 ? agent.profit_streak + 1 : 0;

  await supabase
    .from('agents')
    .update({
      last_portfolio_value: Math.floor(currentValue * 1e18),
      last_settlement_date: today,
      net_pnl: Math.floor((agent.net_pnl / 1e18 + dailyPnl) * 1e18),
      sprawl_balance: agent.sprawl_balance + sprawlReward * 1e18,
      sprawl_lifetime_earned: agent.sprawl_lifetime_earned + sprawlReward * 1e18,
      profit_streak: profitStreak,
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
