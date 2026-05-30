'use client'

import { useState, useEffect, useCallback } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase';

export interface LeaderboardAgent {
  rank: number;
  agent_id: number;
  name: string;
  strategy_type: 0 | 1 | 2;
  xp_level: number;
  sprawl_lifetime_earned: number;
  total_volume: number;
  net_pnl: number;
  raid_wins: number;
  raid_losses: number;
  reputation_score: number;
  district: string;
  last_action_at: string | null;
}

export type SortField = 'sprawl_lifetime_earned' | 'xp_level' | 'raid_wins' | 'reputation_score' | 'total_volume' | 'net_pnl';
export type StrategyFilter = 'all' | 'preset' | 'rules' | 'llm';

interface LeaderboardState {
  agents: LeaderboardAgent[];
  total: number;
  loading: boolean;
  error: string | null;
}

export function useLeaderboard(
  sort: SortField = 'sprawl_lifetime_earned',
  strategy: StrategyFilter = 'all',
  page: number = 1,
  limit: number = 50,
) {
  const [state, setState] = useState<LeaderboardState>({
    agents: [], total: 0, loading: true, error: null,
  });

  const fetchLeaderboard = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        sort, strategy, page: String(page), limit: String(limit),
      });
      const res = await fetch(`/api/leaderboard?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setState({ agents: data.agents, total: data.pagination.total, loading: false, error: null });
    } catch (err) {
      setState(prev => ({ ...prev, loading: false, error: (err as Error).message }));
    }
  }, [sort, strategy, page, limit]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel('leaderboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, () => {
        fetchLeaderboard();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchLeaderboard]);

  return state;
}
