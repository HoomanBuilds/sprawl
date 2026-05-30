import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase';
import { PixelCard } from '@/components/ui/PixelCard';
import { ShareButton } from '@/components/ShareButton';
import { CompareButton } from '@/components/CompareButton';

const STRATEGY_LABELS: Record<number, string> = { 0: 'PRESET', 1: 'RULES', 2: 'LLM' };

export async function generateMetadata(
  { params }: { params: Promise<{ agentId: string }> }
): Promise<Metadata> {
  const { agentId } = await params;
  const supabase = getSupabaseAdmin();
  const { data: agent } = await supabase
    .from('agents')
    .select('name')
    .eq('agent_id', parseInt(agentId, 10))
    .single();

  const title = agent?.name
    ? `${agent.name} — Sprawl Protocol`
    : `Agent #${agentId} — Sprawl Protocol`;
  const cardUrl = `/api/share-card/${agentId}?format=landscape`;

  return {
    title,
    openGraph: {
      title,
      images: [cardUrl],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      images: [cardUrl],
    },
  };
}

export default async function AgentPage(
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const id = parseInt(agentId, 10);
  const supabase = getSupabaseAdmin();

  const { data: agent } = await supabase
    .from('agents')
    .select('agent_id, name, strategy_type, xp_level, sprawl_lifetime_earned, total_volume, net_pnl, raid_wins, raid_losses, reputation_score, district')
    .eq('agent_id', id)
    .single();

  if (!agent) notFound();

  const name = agent.name ?? `Agent #${agent.agent_id}`;
  const pnlPositive = (agent.net_pnl ?? 0) >= 0;
  const pnlFormatted = `${pnlPositive ? '+' : ''}$${((agent.net_pnl ?? 0) / 1e18).toFixed(2)}`;

  return (
    <div className="min-h-screen bg-[color:var(--color-sprawl-bg)] p-4 md:p-8">
      <div className="mx-auto max-w-2xl flex flex-col gap-6">
        <img
          src={`/api/share-card/${agent.agent_id}?format=landscape`}
          alt={`${name} share card`}
          className="w-full border-4 border-[color:var(--color-sprawl-border)]"
          width={1200}
          height={675}
        />

        <PixelCard variant="default" title={name}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-sprawl-muted)] uppercase">
                {STRATEGY_LABELS[agent.strategy_type] ?? 'UNKNOWN'} AGENT
              </span>
              <span className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-sprawl-muted)] uppercase">
                {agent.district ?? '—'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="border-2 border-[color:var(--color-sprawl-border)] p-3">
                <div className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-sprawl-muted)] uppercase mb-1">Level</div>
                <div className="font-[family-name:var(--font-pixel)] text-xl text-[color:var(--color-sprawl-accent)]">{agent.xp_level}</div>
              </div>
              <div className="border-2 border-[color:var(--color-sprawl-border)] p-3">
                <div className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-sprawl-muted)] uppercase mb-1">$SPRAWL</div>
                <div className="font-[family-name:var(--font-pixel)] text-xl text-[color:var(--color-sprawl-accent)]">{(agent.sprawl_lifetime_earned ?? 0).toLocaleString()}</div>
              </div>
              <div className="border-2 border-[color:var(--color-sprawl-border)] p-3">
                <div className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-sprawl-muted)] uppercase mb-1">Volume</div>
                <div className="font-[family-name:var(--font-pixel)] text-xl text-[color:var(--color-sprawl-cream)]">${((agent.total_volume ?? 0) / 1e18).toFixed(0)}</div>
              </div>
              <div className="border-2 border-[color:var(--color-sprawl-border)] p-3">
                <div className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-sprawl-muted)] uppercase mb-1">P&L</div>
                <div className={`font-[family-name:var(--font-pixel)] text-xl ${pnlPositive ? 'text-[color:var(--color-sprawl-lime)]' : 'text-[color:var(--color-sprawl-red)]'}`}>
                  {pnlFormatted}
                </div>
              </div>
              <div className="border-2 border-[color:var(--color-sprawl-border)] p-3">
                <div className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-sprawl-muted)] uppercase mb-1">Raids</div>
                <div className="font-[family-name:var(--font-pixel)] text-xl text-[color:var(--color-sprawl-cream)]">{agent.raid_wins}W / {agent.raid_losses}L</div>
              </div>
              <div className="border-2 border-[color:var(--color-sprawl-border)] p-3">
                <div className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-sprawl-muted)] uppercase mb-1">Reputation</div>
                <div className="font-[family-name:var(--font-pixel)] text-xl text-[color:var(--color-sprawl-cyan)]">{agent.reputation_score}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <ShareButton agentId={agent.agent_id} agentName={name} />
              <CompareButton agentId={agent.agent_id} />
              <a
                href={`/?agent=${agent.agent_id}`}
                className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-sprawl-muted)] hover:text-[color:var(--color-sprawl-accent)] uppercase border-2 border-[color:var(--color-sprawl-border)] hover:border-[color:var(--color-sprawl-accent)] px-4 py-2 transition-none"
              >
                View in city
              </a>
            </div>
          </div>
        </PixelCard>
      </div>
    </div>
  );
}
