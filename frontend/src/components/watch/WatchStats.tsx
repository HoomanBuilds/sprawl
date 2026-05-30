'use client'

import { useState, useEffect } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase';
import { StatBar } from '@/components/ui/StatBar';

interface CityStats {
  totalAgents: number;
  activeAgents: number;
  totalVolume: number;
  totalRaids: number;
  sprawlPrice: number;
}

export function WatchStats() {
  const [stats, setStats] = useState<CityStats>({
    totalAgents: 0, activeAgents: 0, totalVolume: 0, totalRaids: 0, sprawlPrice: 1.0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      const supabase = getSupabaseBrowser();

      const [{ count: total }, { count: active }, { data: aggregates }] = await Promise.all([
        supabase.from('agents').select('*', { count: 'exact', head: true }),
        supabase.from('agents').select('*', { count: 'exact', head: true })
          .gte('last_action_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()),
        supabase.from('agents').select('total_volume, raid_wins').limit(1000),
      ]);

      const totalVolume = (aggregates ?? []).reduce((sum, a) => sum + (a.total_volume || 0), 0);
      const totalRaids = (aggregates ?? []).reduce((sum, a) => sum + (a.raid_wins || 0), 0);

      let sprawlPrice = 1.0;
      try {
        const priceRes = await fetch('/api/price-history');
        if (priceRes.ok) {
          const priceData = await priceRes.json();
          sprawlPrice = priceData.currentPrice;
        }
      } catch { /* use default */ }

      setStats({
        totalAgents: total ?? 0,
        activeAgents: active ?? 0,
        totalVolume,
        totalRaids,
        sprawlPrice,
      });
    };

    fetchStats();
    const interval = setInterval(fetchStats, 15_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-sprawl-accent)] uppercase tracking-widest mb-1">
        City Stats
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="border border-[color:var(--color-sprawl-accent)]/20 p-2">
          <div className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-sprawl-muted)] uppercase">Agents</div>
          <div className="font-[family-name:var(--font-pixel)] text-lg text-[color:var(--color-sprawl-cream)]">{stats.totalAgents}</div>
        </div>
        <div className="border border-[color:var(--color-sprawl-accent)]/20 p-2">
          <div className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-sprawl-muted)] uppercase">Active</div>
          <div className="font-[family-name:var(--font-pixel)] text-lg text-[color:var(--color-sprawl-lime)]">{stats.activeAgents}</div>
        </div>
        <div className="border border-[color:var(--color-sprawl-accent)]/20 p-2">
          <div className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-sprawl-muted)] uppercase">$SPRAWL</div>
          <div className="font-[family-name:var(--font-pixel)] text-lg text-[color:var(--color-sprawl-accent)]">${stats.sprawlPrice.toFixed(2)}</div>
        </div>
        <div className="border border-[color:var(--color-sprawl-accent)]/20 p-2">
          <div className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-sprawl-muted)] uppercase">Raids</div>
          <div className="font-[family-name:var(--font-pixel)] text-lg text-[color:var(--color-sprawl-red)]">{stats.totalRaids}</div>
        </div>
      </div>
      <StatBar label="Active" value={stats.activeAgents} max={Math.max(stats.totalAgents, 1)} variant="sprawl" segments={10} />
    </div>
  );
}
