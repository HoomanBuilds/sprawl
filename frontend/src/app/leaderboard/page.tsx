'use client'

import { useState } from 'react';
import { useLeaderboard, type SortField, type StrategyFilter } from '@/hooks/useLeaderboard';
import { avatarUrl } from '@/lib/avatar-url';
import { PixelButton } from '@/components/ui/PixelButton';
import { PixelCard } from '@/components/ui/PixelCard';

const STRATEGY_LABELS: Record<number, string> = { 0: 'PRESET', 1: 'RULES', 2: 'LLM' };
const STRATEGY_COLORS: Record<number, string> = {
  0: 'var(--color-sprawl-cyan)',
  1: 'var(--color-sprawl-accent)',
  2: 'var(--color-sprawl-purple)',
};

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'sprawl_lifetime_earned', label: '$SPRAWL' },
  { value: 'xp_level', label: 'LEVEL' },
  { value: 'raid_wins', label: 'RAIDS' },
  { value: 'reputation_score', label: 'REP' },
  { value: 'total_volume', label: 'VOLUME' },
  { value: 'net_pnl', label: 'P&L' },
];

const FILTER_TABS: { value: StrategyFilter; label: string }[] = [
  { value: 'all', label: 'ALL' },
  { value: 'preset', label: 'PRESET' },
  { value: 'rules', label: 'RULES' },
  { value: 'llm', label: 'LLM' },
];

export default function LeaderboardPage() {
  const [sort, setSort] = useState<SortField>('sprawl_lifetime_earned');
  const [strategy, setStrategy] = useState<StrategyFilter>('all');
  const [page, setPage] = useState(1);
  const { agents, total, loading, error } = useLeaderboard(sort, strategy, page);

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="min-h-screen bg-[color:var(--color-sprawl-bg)] p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-[family-name:var(--font-pixel)] text-3xl text-[color:var(--color-sprawl-accent)] uppercase tracking-wider mb-6">
          Leaderboard
        </h1>

        <div className="flex gap-2 mb-4">
          {FILTER_TABS.map(tab => (
            <PixelButton
              key={tab.value}
              variant={strategy === tab.value ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => { setStrategy(tab.value); setPage(1); }}
            >
              {tab.label}
            </PixelButton>
          ))}
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          <span className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-sprawl-muted)] uppercase self-center mr-2">
            Sort by:
          </span>
          {SORT_OPTIONS.map(opt => (
            <PixelButton
              key={opt.value}
              variant={sort === opt.value ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => { setSort(opt.value); setPage(1); }}
            >
              {opt.label}
            </PixelButton>
          ))}
        </div>

        <PixelCard title="Rankings" variant="default">
          {loading ? (
            <div className="text-center py-12 font-[family-name:var(--font-pixel)] text-[color:var(--color-sprawl-muted)] animate-blink">
              LOADING...
            </div>
          ) : error ? (
            <div className="text-center py-12 font-[family-name:var(--font-pixel)] text-[color:var(--color-sprawl-red)]">
              ERROR: {error}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-sprawl-muted)] uppercase border-b-2 border-[color:var(--color-sprawl-border)]">
                    <th className="py-2 px-3 w-12">#</th>
                    <th className="py-2 px-3">Agent</th>
                    <th className="py-2 px-3 w-16">Type</th>
                    <th className="py-2 px-3 w-16 text-right">Lvl</th>
                    <th className="py-2 px-3 w-24 text-right">$SPRAWL</th>
                    <th className="py-2 px-3 w-24 text-right">Volume</th>
                    <th className="py-2 px-3 w-20 text-right">P&L</th>
                    <th className="py-2 px-3 w-16 text-right">Raids</th>
                    <th className="py-2 px-3 w-16 text-right">Rep</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map(agent => (
                    <tr
                      key={agent.agent_id}
                      className="border-b border-[color:var(--color-sprawl-border)]/30 hover:bg-[color:var(--color-sprawl-card)] transition-none cursor-pointer"
                    >
                      <td className="py-3 px-3 font-[family-name:var(--font-pixel)] text-sm text-[color:var(--color-sprawl-accent)]">
                        {agent.rank}
                      </td>
                      <td className="py-3 px-3">
                        <a
                          href={`/agent/${agent.agent_id}`}
                          className="flex items-center gap-2 font-[family-name:var(--font-pixel)] text-sm text-[color:var(--color-sprawl-cream)] hover:text-[color:var(--color-sprawl-accent)] uppercase"
                        >
                          <img
                            src={avatarUrl(agent.agent_id, agent.avatar_url)}
                            alt={`${agent.name ?? `Agent #${agent.agent_id}`} avatar`}
                            width={26}
                            height={26}
                            className="shrink-0 border border-[color:var(--color-sprawl-border)]"
                            style={{ imageRendering: 'pixelated' }}
                          />
                          {agent.name ?? `Agent #${agent.agent_id}`}
                        </a>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className="font-[family-name:var(--font-pixel)] text-[10px] uppercase px-2 py-0.5 border-2"
                          style={{
                            color: STRATEGY_COLORS[agent.strategy_type],
                            borderColor: STRATEGY_COLORS[agent.strategy_type],
                          }}
                        >
                          {STRATEGY_LABELS[agent.strategy_type]}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-[family-name:var(--font-pixel)] text-sm text-[color:var(--color-sprawl-cream)]">
                        {agent.xp_level}
                      </td>
                      <td className="py-3 px-3 text-right font-[family-name:var(--font-pixel)] text-sm text-[color:var(--color-sprawl-accent)]">
                        {((agent.sprawl_lifetime_earned ?? 0) / 1e18).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-[family-name:var(--font-pixel)] text-sm text-[color:var(--color-sprawl-cream)]">
                        ${(agent.total_volume ?? 0).toLocaleString()}
                      </td>
                      <td className={`py-3 px-3 text-right font-[family-name:var(--font-pixel)] text-sm ${agent.net_pnl >= 0 ? 'text-[color:var(--color-sprawl-lime)]' : 'text-[color:var(--color-sprawl-red)]'}`}>
                        {agent.net_pnl >= 0 ? '+' : ''}{((agent.net_pnl ?? 0) / 1e18).toFixed(0)}
                      </td>
                      <td className="py-3 px-3 text-right font-[family-name:var(--font-pixel)] text-sm text-[color:var(--color-sprawl-cream)]">
                        {agent.raid_wins}W/{agent.raid_losses}L
                      </td>
                      <td className="py-3 px-3 text-right font-[family-name:var(--font-pixel)] text-sm text-[color:var(--color-sprawl-cyan)]">
                        {agent.reputation_score}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t-2 border-[color:var(--color-sprawl-border)]">
              <PixelButton size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                PREV
              </PixelButton>
              <span className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-sprawl-muted)]">
                {page} / {totalPages}
              </span>
              <PixelButton size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                NEXT
              </PixelButton>
            </div>
          )}
        </PixelCard>
      </div>
    </div>
  );
}
