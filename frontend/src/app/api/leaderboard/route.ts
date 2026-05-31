import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const VALID_SORT_FIELDS = [
  'sprawl_lifetime_earned',
  'xp_level',
  'raid_wins',
  'reputation_score',
  'total_volume',
  'net_pnl',
] as const;

type SortField = typeof VALID_SORT_FIELDS[number];

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)));
  const sortBy = (url.searchParams.get('sort') ?? 'sprawl_lifetime_earned') as SortField;
  const strategyFilter = url.searchParams.get('strategy');

  if (!VALID_SORT_FIELDS.includes(sortBy)) {
    return NextResponse.json({ error: 'Invalid sort field' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('agents')
    .select(
      'agent_id, name, avatar_url, strategy_type, xp_level, sprawl_lifetime_earned, total_volume, net_pnl, raid_wins, raid_losses, reputation_score, district, last_action_at',
      { count: 'exact' }
    )
    .order(sortBy, { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (strategyFilter === 'preset') query = query.eq('strategy_type', 0);
  else if (strategyFilter === 'rules') query = query.eq('strategy_type', 1);
  else if (strategyFilter === 'llm') query = query.eq('strategy_type', 2);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ranked = (data ?? []).map((agent, index) => ({
    rank: (page - 1) * limit + index + 1,
    ...agent,
  }));

  return NextResponse.json({
    agents: ranked,
    pagination: {
      page,
      limit,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / limit),
    },
    sort: sortBy,
    strategy: strategyFilter ?? 'all',
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30' },
  });
}
