# Phase 7: Leaderboard + Watch Mode + Share Cards — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the engagement layer — a live leaderboard ranked by multiple criteria, a full-screen Demo Day watch mode (cockpit layout), share/compare card generation for X/Twitter virality, a $SPRAWL price sparkline in the header, and the pixel UI component library. These features target the $17K community voting prize and the Demo Quality rubric (5 pts).

**Architecture:** Next.js 16 App Router pages + API routes. Supabase Realtime for live leaderboard updates. `next/og` ImageResponse for share card generation. CSS grid cockpit layout adapted from clan-world's Cockpit.tsx. Pixel UI components from eth-open-agents.

**Tech Stack:** Next.js 16, TypeScript, Supabase Realtime, next/og (ImageResponse), React Three Fiber (watch mode), Tailwind CSS

**Design doc reference:** `docs/plans/2026-05-30-sprawl-protocol-implementation-plan.md` — Sections 7.1 through 7.3, plus copy/adapt tables for git-city share-card routes, eth-open-agents Pixel UI, and clan-world Cockpit.tsx.

---

### Task 1: Pixel UI component library

Copy the pixel-art UI primitives from eth-open-agents into our component library. These are used by the leaderboard, watch mode, and share card pages.

**Files:**
- Create: `frontend/src/components/ui/PixelButton.tsx`
- Create: `frontend/src/components/ui/PixelCard.tsx`
- Create: `frontend/src/components/ui/PixelDialog.tsx`
- Create: `frontend/src/components/ui/StatBar.tsx`
- Modify: `frontend/src/app/globals.css`

**Step 1: Copy PixelButton**

Reference: `inspiration/eth-open-agents/apps/web/src/components/ui/PixelButton.tsx`

Copy the full component. Remap CSS variable names to Sprawl's palette:
- `--color-yellow` → `--color-sprawl-accent` (the neon green `#c8e64a` from git-city's accent)
- `--color-bg-deep` → `--color-sprawl-bg` (`#0d0d0f`)
- `--color-cyan` → `--color-sprawl-cyan`
- `--font-pixel` → `--font-pixel` (Silkscreen)

```typescript
// frontend/src/components/ui/PixelButton.tsx
'use client'

import { type ButtonHTMLAttributes, forwardRef } from 'react'

type Variant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variantStyles: Record<Variant, string> = {
  primary:   'bg-[color:var(--color-sprawl-accent)] text-[color:var(--color-sprawl-bg)] border-[color:var(--color-sprawl-bg)] hover:brightness-105',
  secondary: 'bg-[color:var(--color-sprawl-cyan)]   text-[color:var(--color-sprawl-bg)] border-[color:var(--color-sprawl-bg)] hover:brightness-110',
  success:   'bg-[color:var(--color-sprawl-lime)]   text-[color:var(--color-sprawl-bg)] border-[color:var(--color-sprawl-bg)] hover:brightness-110',
  danger:    'bg-[color:var(--color-sprawl-red)]    text-[color:var(--color-sprawl-cream)] border-[color:var(--color-sprawl-bg)] hover:brightness-110',
  ghost:     'bg-[rgba(13,13,15,0.55)]              text-[color:var(--color-sprawl-cream)] border-[color:var(--color-sprawl-accent)]/40 hover:bg-[rgba(13,13,15,0.75)] hover:border-[color:var(--color-sprawl-accent)]/60',
}

const sizeStyles: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-8 py-4 text-base',
}

export const PixelButton = forwardRef<HTMLButtonElement, PixelButtonProps>(
  function PixelButton(
    { className = '', variant = 'primary', size = 'md', loading, disabled, children, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          'font-[family-name:var(--font-pixel)]',
          'border-4 uppercase tracking-wider',
          'transition-none select-none cursor-pointer',
          'shadow-[4px_4px_0_0_var(--color-sprawl-bg)]',
          'active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_0_var(--color-sprawl-bg)]',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0',
          'focus:outline-none focus:ring-2 focus:ring-[color:var(--color-sprawl-accent)] focus:ring-offset-2 focus:ring-offset-[color:var(--color-sprawl-bg)]',
          variantStyles[variant],
          sizeStyles[size],
          className,
        ].join(' ')}
        {...rest}
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <span className="animate-blink">_</span>
            {children}
          </span>
        ) : (
          children
        )}
      </button>
    )
  },
)
```

**Step 2: Copy PixelCard**

Reference: `inspiration/eth-open-agents/apps/web/src/components/ui/PixelCard.tsx`

Copy the full component. Same CSS variable remapping. Keep all 5 variants (default, pink, cyan, elevated, warm). The `warm` variant is used for watch mode overlay panels.

```typescript
// frontend/src/components/ui/PixelCard.tsx
import { type HTMLAttributes, type ReactNode } from 'react'

type Variant = 'default' | 'pink' | 'cyan' | 'elevated' | 'warm'

interface PixelCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: Variant
  title?: ReactNode
  headerRight?: ReactNode
  bodyClassName?: string
}

const variantStyles: Record<Variant, { wrap: string; shadow: string; header: string; headerText: string }> = {
  default:  {
    wrap:       'border-4 border-[color:var(--color-sprawl-border)] bg-[color:var(--color-sprawl-card)]',
    shadow:     'shadow-[4px_4px_0_0_var(--color-sprawl-bg)]',
    header:     'border-b-4 border-[color:var(--color-sprawl-bg)] bg-[color:var(--color-sprawl-bg)]',
    headerText: 'text-[color:var(--color-sprawl-cream)]',
  },
  pink: {
    wrap:       'border-4 border-[color:var(--color-sprawl-red)] bg-[color:var(--color-sprawl-card)]',
    shadow:     'shadow-[4px_4px_0_0_var(--color-sprawl-bg)]',
    header:     'border-b-4 border-[color:var(--color-sprawl-bg)] bg-[color:var(--color-sprawl-bg)]',
    headerText: 'text-[color:var(--color-sprawl-cream)]',
  },
  cyan: {
    wrap:       'border-4 border-[color:var(--color-sprawl-cyan)] bg-[color:var(--color-sprawl-card)]',
    shadow:     'shadow-[4px_4px_0_0_var(--color-sprawl-bg)]',
    header:     'border-b-4 border-[color:var(--color-sprawl-bg)] bg-[color:var(--color-sprawl-bg)]',
    headerText: 'text-[color:var(--color-sprawl-cream)]',
  },
  elevated: {
    wrap:       'border-4 border-[color:var(--color-sprawl-border-hi)] bg-[color:var(--color-sprawl-card-hi)]',
    shadow:     'shadow-[4px_4px_0_0_var(--color-sprawl-bg)]',
    header:     'border-b-4 border-[color:var(--color-sprawl-bg)] bg-[color:var(--color-sprawl-bg)]',
    headerText: 'text-[color:var(--color-sprawl-cream)]',
  },
  warm: {
    wrap:       'border border-[color:var(--color-sprawl-accent)]/35 bg-[rgba(13,13,15,0.86)] backdrop-blur-sm',
    shadow:     '',
    header:     'border-b border-[color:var(--color-sprawl-accent)]/20 bg-[rgba(13,13,15,0.5)]',
    headerText: 'text-[color:var(--color-sprawl-accent)]',
  },
}

export function PixelCard({
  variant = 'default',
  title,
  headerRight,
  bodyClassName,
  className = '',
  children,
  ...rest
}: PixelCardProps) {
  const v = variantStyles[variant]
  return (
    <div className={[v.wrap, v.shadow, className].join(' ')} {...rest}>
      {title !== undefined && (
        <div className={`flex items-center justify-between px-4 py-2 ${v.header}`}>
          <h3 className={`font-[family-name:var(--font-pixel)] text-xs tracking-widest uppercase ${v.headerText}`}>
            {title}
          </h3>
          {headerRight}
        </div>
      )}
      <div className={bodyClassName ?? 'p-4'}>{children}</div>
    </div>
  )
}
```

**Step 3: Copy PixelDialog**

Reference: `inspiration/eth-open-agents/apps/web/src/components/ui/PixelDialog.tsx`

Copy verbatim with Sprawl CSS variable names. Uses `PixelCard` with `warm` variant for the modal body.

```typescript
// frontend/src/components/ui/PixelDialog.tsx
'use client'

import { type ReactNode, useEffect } from 'react'
import { PixelCard } from './PixelCard'

interface PixelDialogProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  hideCloseButton?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeMap: Record<Required<PixelDialogProps>['size'], string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export function PixelDialog({
  open, onClose, title, children, hideCloseButton, size = 'md',
}: PixelDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-[color:var(--color-sprawl-bg)]/70 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`relative w-full ${sizeMap[size]} flex min-h-0 flex-col max-h-[min(92dvh,52rem)]`}>
        <PixelCard
          variant="warm"
          title={title}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          bodyClassName="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4"
          headerRight={
            !hideCloseButton && (
              <button
                onClick={onClose}
                aria-label="Close"
                className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-sprawl-muted)] hover:text-[color:var(--color-sprawl-accent)] cursor-pointer"
              >
                [ X ]
              </button>
            )
          }
        >
          {children}
        </PixelCard>
      </div>
    </div>
  )
}
```

**Step 4: Copy StatBar**

Reference: `inspiration/eth-open-agents/apps/web/src/components/ui/StatBar.tsx`

Adapt variants: keep `xp` and `health`, add `sprawl` (green accent), `pnl` (cyan for positive), `raid` (red).

```typescript
// frontend/src/components/ui/StatBar.tsx
interface StatBarProps {
  label: string
  value: number
  max?: number
  variant?: 'sprawl' | 'pnl' | 'raid' | 'xp' | 'health'
  segments?: number
  showValue?: boolean
}

const variantColor: Record<Required<StatBarProps>['variant'], string> = {
  sprawl: 'bg-[color:var(--color-sprawl-accent)]',
  pnl:    'bg-[color:var(--color-sprawl-cyan)]',
  raid:   'bg-[color:var(--color-sprawl-red)]',
  xp:     'bg-[color:var(--color-sprawl-purple)]',
  health: 'bg-[color:var(--color-sprawl-lime)]',
}

export function StatBar({
  label, value, max = 100, variant = 'sprawl', segments = 10, showValue = true,
}: StatBarProps) {
  const pct = Math.max(0, Math.min(1, value / max))
  const filled = Math.round(pct * segments)

  return (
    <div className="flex items-center gap-3">
      <span className="w-16 font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-[color:var(--color-sprawl-muted)]">
        {label}
      </span>
      <div
        className="flex-1 flex gap-0.5 border-2 border-[color:var(--color-sprawl-border)] bg-[color:var(--color-sprawl-bg)] p-0.5"
        role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}
      >
        {Array.from({ length: segments }).map((_, i) => (
          <div key={i} className={['h-3 flex-1', i < filled ? variantColor[variant] : 'bg-[color:var(--color-sprawl-card)]'].join(' ')} />
        ))}
      </div>
      {showValue && (
        <span className="w-12 text-right font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-sprawl-cream)]">
          {Math.round(value)}/{max}
        </span>
      )}
    </div>
  )
}
```

**Step 5: Add Sprawl CSS variables + CRT styles to globals.css**

Reference: `inspiration/eth-open-agents/apps/web/src/app/globals.css` for CRT styles.

Append to `frontend/src/app/globals.css`:

```css
/* ── Sprawl Design Tokens ──────────────────────────────────────────── */
:root {
  --color-sprawl-accent: #c8e64a;
  --color-sprawl-bg: #0d0d0f;
  --color-sprawl-card: #1c1c20;
  --color-sprawl-card-hi: #2a2a30;
  --color-sprawl-cream: #e8dcc8;
  --color-sprawl-border: #2a2a30;
  --color-sprawl-border-hi: #3a3a40;
  --color-sprawl-muted: #8c8c9c;
  --color-sprawl-cyan: #00d4ff;
  --color-sprawl-lime: #00ff88;
  --color-sprawl-red: #ff4444;
  --color-sprawl-purple: #aa66ff;
  --font-pixel: 'Silkscreen', monospace;
}

/* ── CRT scanline overlay ──────────────────────────────────────────── */
.crt-scanlines {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  background: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.15) 0px,
    rgba(0, 0, 0, 0.15) 1px,
    transparent 1px,
    transparent 3px
  );
  mix-blend-mode: multiply;
  opacity: 0.6;
}

.crt-vignette {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9998;
  background: radial-gradient(
    ellipse at center,
    transparent 0%,
    transparent 50%,
    rgba(0, 0, 0, 0.4) 100%
  );
}

/* ── Pixel animations ──────────────────────────────────────────────── */
@keyframes pixel-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
.animate-blink { animation: pixel-blink 1s step-end infinite; }

@keyframes pixel-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

@keyframes pixel-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-2px); }
  40% { transform: translateX(2px); }
  60% { transform: translateX(-2px); }
  80% { transform: translateX(2px); }
}
```

**Step 6: Commit**

```bash
git add frontend/src/components/ui/PixelButton.tsx frontend/src/components/ui/PixelCard.tsx frontend/src/components/ui/PixelDialog.tsx frontend/src/components/ui/StatBar.tsx frontend/src/app/globals.css
git commit -m "feat: add Pixel UI library (PixelButton, PixelCard, PixelDialog, StatBar) + CRT styles"
```

---

### Task 2: CRT overlay component

**Files:**
- Create: `frontend/src/components/CRTOverlay.tsx`

**Step 1: Copy CRTOverlay**

Reference: `inspiration/eth-open-agents/apps/web/src/components/CRTOverlay.tsx`

The CSS classes `.crt-scanlines` and `.crt-vignette` were added to globals.css in Task 1. This component just renders the two divs.

```typescript
// frontend/src/components/CRTOverlay.tsx
export function CRTOverlay() {
  return (
    <>
      <div className="crt-scanlines" aria-hidden="true" />
      <div className="crt-vignette" aria-hidden="true" />
    </>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/CRTOverlay.tsx
git commit -m "feat: add CRTOverlay component for scanline + vignette effect"
```

---

### Task 3: Leaderboard API route

**Files:**
- Create: `frontend/src/app/api/leaderboard/route.ts`

**Step 1: Write the GET /api/leaderboard route**

Query the `agents` table from Supabase. Sort by multiple criteria. Support pagination and strategy type filtering.

Reference: Design doc Section 7.1 — "Ranked by: cumulative volume, level, raid wins, reputation. Filterable: all agents, policy-driven only, LLM-driven only."

```typescript
// frontend/src/app/api/leaderboard/route.ts
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
  const strategyFilter = url.searchParams.get('strategy'); // 'all' | 'preset' | 'rules' | 'llm'

  if (!VALID_SORT_FIELDS.includes(sortBy)) {
    return NextResponse.json({ error: 'Invalid sort field' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('agents')
    .select(
      'agent_id, name, strategy_type, xp_level, sprawl_lifetime_earned, total_volume, net_pnl, raid_wins, raid_losses, reputation_score, district, last_action_at',
      { count: 'exact' }
    )
    .order(sortBy, { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  // Strategy type filter: 0=preset, 1=rules, 2=llm
  if (strategyFilter === 'preset') query = query.eq('strategy_type', 0);
  else if (strategyFilter === 'rules') query = query.eq('strategy_type', 1);
  else if (strategyFilter === 'llm') query = query.eq('strategy_type', 2);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Assign ranks based on current sort order
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
```

**Step 2: Commit**

```bash
git add frontend/src/app/api/leaderboard/route.ts
git commit -m "feat: add GET /api/leaderboard with sort, filter, and pagination"
```

---

### Task 4: Leaderboard page

**Files:**
- Create: `frontend/src/app/leaderboard/page.tsx`
- Create: `frontend/src/hooks/useLeaderboard.ts`

**Step 1: Create the useLeaderboard hook with Supabase Realtime**

Subscribe to the `agents` table via Supabase Realtime for live rank updates. Falls back to polling the API route every 10s.

Reference: Design doc Section 7.1 — "Real-time via Supabase Realtime subscription on `agents` table changes."

```typescript
// frontend/src/hooks/useLeaderboard.ts
'use client'

import { useState, useEffect, useCallback } from 'react';
import { createBrowserSupabase } from '@/lib/supabase';

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

  // Supabase Realtime: re-fetch when agents table changes
  useEffect(() => {
    const supabase = createBrowserSupabase();
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
```

**Step 2: Create the leaderboard page**

Full-page table with pixel aesthetics. Filterable by strategy type tabs. Sortable columns. Agent name links to `/agent/[id]`.

```tsx
// frontend/src/app/leaderboard/page.tsx
'use client'

import { useState } from 'react';
import { useLeaderboard, type SortField, type StrategyFilter } from '@/hooks/useLeaderboard';
import { PixelButton } from '@/components/ui/PixelButton';
import { PixelCard } from '@/components/ui/PixelCard';

const STRATEGY_LABELS: Record<number, string> = { 0: 'PRESET', 1: 'RULES', 2: 'LLM' };
const STRATEGY_COLORS: Record<number, string> = { 0: 'var(--color-sprawl-cyan)', 1: 'var(--color-sprawl-accent)', 2: 'var(--color-sprawl-purple)' };

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
        {/* Header */}
        <h1 className="font-[family-name:var(--font-pixel)] text-3xl text-[color:var(--color-sprawl-accent)] uppercase tracking-wider mb-6">
          Leaderboard
        </h1>

        {/* Strategy filter tabs */}
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

        {/* Sort options */}
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

        {/* Table */}
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
                        <a href={`/agent/${agent.agent_id}`} className="font-[family-name:var(--font-pixel)] text-sm text-[color:var(--color-sprawl-cream)] hover:text-[color:var(--color-sprawl-accent)] uppercase">
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
                        {agent.sprawl_lifetime_earned.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-[family-name:var(--font-pixel)] text-sm text-[color:var(--color-sprawl-cream)]">
                        ${(agent.total_volume / 1e18).toFixed(0)}
                      </td>
                      <td className={`py-3 px-3 text-right font-[family-name:var(--font-pixel)] text-sm ${agent.net_pnl >= 0 ? 'text-[color:var(--color-sprawl-lime)]' : 'text-[color:var(--color-sprawl-red)]'}`}>
                        {agent.net_pnl >= 0 ? '+' : ''}{(agent.net_pnl / 1e18).toFixed(0)}
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

          {/* Pagination */}
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
```

**Step 3: Commit**

```bash
git add frontend/src/hooks/useLeaderboard.ts frontend/src/app/leaderboard/page.tsx
git commit -m "feat: add leaderboard page with real-time updates, sorting, and strategy filters"
```

---

### Task 5: $SPRAWL price sparkline

**Files:**
- Create: `frontend/src/components/SprawlPriceSparkline.tsx`
- Create: `frontend/src/hooks/useSprawlPrice.ts`
- Create: `frontend/src/app/api/price-history/route.ts`

**Step 1: Create the price history API route**

Query the `trade_history` table for recent SPRAWL/sUSDC swaps. Extract the effective price from each swap. Return the last 24h of price points for the sparkline.

```typescript
// frontend/src/app/api/price-history/route.ts
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getMantleSepoliaProvider } from '@/lib/ethers-provider';
import { ethers } from 'ethers';
import { CONTRACTS } from '@/lib/config';
import { SprawlDEXABI } from '@/constants/abis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = getSupabaseAdmin();

  // Strategy 1: Get price from trade_history (SPRAWL/sUSDC swaps in last 24h)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: trades } = await supabase
    .from('trade_history')
    .select('created_at, token_in, token_out, amount_in, amount_out')
    .or(`token_in.eq.SPRAWL,token_out.eq.SPRAWL`)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(200);

  const pricePoints: { ts: string; price: number }[] = [];

  if (trades && trades.length > 0) {
    for (const trade of trades) {
      let price: number;
      if (trade.token_in === 'SPRAWL') {
        // Sold SPRAWL for sUSDC: price = amount_out / amount_in
        price = trade.amount_out / trade.amount_in;
      } else {
        // Bought SPRAWL with sUSDC: price = amount_in / amount_out
        price = trade.amount_in / trade.amount_out;
      }
      if (isFinite(price) && price > 0) {
        pricePoints.push({ ts: trade.created_at, price });
      }
    }
  }

  // Strategy 2: Get live price from SprawlDEX contract
  let livePrice = 1.0; // fallback
  try {
    const provider = getMantleSepoliaProvider();
    const dex = new ethers.Contract(CONTRACTS.SprawlDEX, SprawlDEXABI.abi, provider);
    const rawPrice = await dex.getPrice(CONTRACTS.SPRAWL, CONTRACTS.sUSDC);
    livePrice = parseFloat(ethers.utils.formatEther(rawPrice));
  } catch {
    // Use last trade price or default
    if (pricePoints.length > 0) {
      livePrice = pricePoints[pricePoints.length - 1].price;
    }
  }

  // Add current live price as the latest point
  pricePoints.push({ ts: new Date().toISOString(), price: livePrice });

  // Calculate 24h change
  const oldestPrice = pricePoints.length > 1 ? pricePoints[0].price : livePrice;
  const change24h = oldestPrice > 0 ? ((livePrice - oldestPrice) / oldestPrice) * 100 : 0;

  return NextResponse.json({
    currentPrice: livePrice,
    change24h: Math.round(change24h * 100) / 100,
    history: pricePoints,
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' },
  });
}
```

**Step 2: Create the useSprawlPrice hook**

Poll every 30 seconds + Supabase Realtime on trade_history changes.

```typescript
// frontend/src/hooks/useSprawlPrice.ts
'use client'

import { useState, useEffect } from 'react';

interface PriceData {
  currentPrice: number;
  change24h: number;
  history: { ts: string; price: number }[];
}

export function useSprawlPrice() {
  const [data, setData] = useState<PriceData | null>(null);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch('/api/price-history');
        if (res.ok) setData(await res.json());
      } catch { /* silent — sparkline just shows stale data */ }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 30_000);
    return () => clearInterval(interval);
  }, []);

  return data;
}
```

**Step 3: Create the sparkline component**

Inline SVG sparkline — no chart library needed. Renders in the header bar. Shows current price + 24h change percentage + mini chart.

Reference: Design doc — "$SPRAWL/sUSDC live price chart in the UI header — instant visual indicator of city health"

```tsx
// frontend/src/components/SprawlPriceSparkline.tsx
'use client'

import { useSprawlPrice } from '@/hooks/useSprawlPrice';

export function SprawlPriceSparkline() {
  const data = useSprawlPrice();

  if (!data) {
    return (
      <div className="flex items-center gap-2 font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-sprawl-muted)]">
        $SPRAWL <span className="animate-blink">...</span>
      </div>
    );
  }

  const { currentPrice, change24h, history } = data;
  const isUp = change24h >= 0;

  // Build SVG sparkline path
  const W = 80;
  const H = 24;
  const prices = history.map(p => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const points = prices.map((p, i) => {
    const x = (i / Math.max(prices.length - 1, 1)) * W;
    const y = H - ((p - min) / range) * (H - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  const strokeColor = isUp ? 'var(--color-sprawl-lime)' : 'var(--color-sprawl-red)';

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-2 border-[color:var(--color-sprawl-border)] bg-[color:var(--color-sprawl-card)]">
      <span className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-sprawl-accent)] uppercase">
        $SPRAWL
      </span>
      <span className="font-[family-name:var(--font-pixel)] text-sm text-[color:var(--color-sprawl-cream)]">
        ${currentPrice.toFixed(2)}
      </span>
      <svg width={W} height={H} className="flex-shrink-0">
        <polyline
          points={points}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="font-[family-name:var(--font-pixel)] text-xs"
        style={{ color: strokeColor }}
      >
        {isUp ? '+' : ''}{change24h}%
      </span>
    </div>
  );
}
```

**Step 4: Wire into layout header**

Add `<SprawlPriceSparkline />` to the site header in `frontend/src/app/layout.tsx`. Place it in the top nav bar alongside navigation links.

```tsx
// In frontend/src/app/layout.tsx, inside the <header> or <nav> element:
import { SprawlPriceSparkline } from '@/components/SprawlPriceSparkline';

// Add inside the header bar:
<SprawlPriceSparkline />
```

**Step 5: Commit**

```bash
git add frontend/src/app/api/price-history/route.ts frontend/src/hooks/useSprawlPrice.ts frontend/src/components/SprawlPriceSparkline.tsx frontend/src/app/layout.tsx
git commit -m "feat: add $SPRAWL/sUSDC price sparkline in header with 24h chart"
```

---

### Task 6: Watch mode page

**Files:**
- Create: `frontend/src/app/watch/page.tsx`
- Create: `frontend/src/components/watch/DecisionFeed.tsx`
- Create: `frontend/src/components/watch/WatchStats.tsx`

**Step 1: Create the decision feed component**

A scrolling feed of real-time agent decisions. Subscribes to Supabase Realtime on the `activity_feed` table.

```tsx
// frontend/src/components/watch/DecisionFeed.tsx
'use client'

import { useState, useEffect, useRef } from 'react';
import { createBrowserSupabase } from '@/lib/supabase';

interface FeedItem {
  id: string;
  actor_id: number;
  target_id: number | null;
  event_type: string;
  metadata: Record<string, any>;
  created_at: string;
  agent_name?: string; // joined from agents table or extracted from metadata
}

export function DecisionFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();

    // Initial load: last 20 events, join agents table for agent_name
    supabase
      .from('activity_feed')
      .select('id, actor_id, target_id, event_type, metadata, created_at, agents!activity_feed_actor_id_fkey(name)')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) {
          const mapped = data.map((row: any) => ({
            ...row,
            agent_name: row.agents?.name ?? row.metadata?.name ?? `Agent #${row.actor_id}`,
          }));
          setItems(mapped.reverse());
        }
      });

    // Realtime subscription
    const channel = supabase
      .channel('watch-feed')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'activity_feed',
      }, (payload) => {
        const row = payload.new as any;
        const newItem: FeedItem = {
          ...row,
          agent_name: row.metadata?.name ?? `Agent #${row.actor_id}`,
        };
        setItems(prev => [...prev.slice(-49), newItem]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Auto-scroll to bottom on new items
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [items]);

  const eventColors: Record<string, string> = {
    swap: 'var(--color-sprawl-cyan)',
    raid_start: 'var(--color-sprawl-red)',
    raid_win: 'var(--color-sprawl-accent)',
    raid_loss: 'var(--color-sprawl-red)',
    spawn: 'var(--color-sprawl-lime)',
    level_up: 'var(--color-sprawl-purple)',
    provide_lp: 'var(--color-sprawl-cyan)',
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[color:var(--color-sprawl-accent)]/20 bg-[rgba(13,13,15,0.5)]">
        <h3 className="font-[family-name:var(--font-pixel)] text-xs tracking-widest uppercase text-[color:var(--color-sprawl-accent)]">
          Live Decisions
        </h3>
      </div>
      <div ref={feedRef} className="flex-1 overflow-y-auto p-2 space-y-1">
        {items.map(item => (
          <div key={item.id} className="flex items-start gap-2 py-1 px-2 hover:bg-[rgba(200,230,74,0.05)]">
            <span
              className="font-[family-name:var(--font-pixel)] text-[10px] uppercase mt-0.5 flex-shrink-0"
              style={{ color: eventColors[item.event_type] ?? 'var(--color-sprawl-muted)' }}
            >
              [{item.event_type}]
            </span>
            <div className="flex-1 min-w-0">
              <span className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-sprawl-cream)]">
                {item.agent_name ?? `Agent #${item.actor_id}`}
              </span>
              <span className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-sprawl-muted)] ml-2">
                {item.metadata?.description ?? item.event_type}
              </span>
            </div>
            <span className="font-[family-name:var(--font-pixel)] text-[9px] text-[color:var(--color-sprawl-muted)] flex-shrink-0">
              {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        ))}
        {items.length === 0 && (
          <div className="text-center py-8 font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-sprawl-muted)] animate-blink">
            AWAITING AGENT ACTIVITY...
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Create the watch stats panel**

Aggregate city stats: total agents, total volume, active agents, live $SPRAWL price.

```tsx
// frontend/src/components/watch/WatchStats.tsx
'use client'

import { useState, useEffect } from 'react';
import { createBrowserSupabase } from '@/lib/supabase';
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
      const supabase = createBrowserSupabase();

      const [{ count: total }, { count: active }, { data: aggregates }] = await Promise.all([
        supabase.from('agents').select('*', { count: 'exact', head: true }),
        supabase.from('agents').select('*', { count: 'exact', head: true })
          .gte('last_action_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()),
        supabase.from('agents').select('total_volume, raid_wins').limit(1000),
      ]);

      const totalVolume = (aggregates ?? []).reduce((sum, a) => sum + (a.total_volume || 0), 0);
      const totalRaids = (aggregates ?? []).reduce((sum, a) => sum + (a.raid_wins || 0), 0);

      // Fetch live $SPRAWL price
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
```

**Step 3: Create the watch mode page**

Full-screen cockpit layout adapted from clan-world's Cockpit.tsx. CSS grid: 3 columns x 2 rows. Center column spans both rows for the 3D city canvas. Left/right corners are panels: decision feed, stats, top agents, raid alerts.

Reference: `inspiration/clan-world/apps/web/src/pages/Cockpit.tsx` — 3-column 2-row grid layout.
Reference: Design doc Section 7.2 — "City flythrough camera auto-orbit, decision feed prominently displayed, new buildings rise with animation, raid battles flash on screen."

```tsx
// frontend/src/app/watch/page.tsx
'use client'

import { useEffect } from 'react';
import { DecisionFeed } from '@/components/watch/DecisionFeed';
import { WatchStats } from '@/components/watch/WatchStats';
import { SprawlPriceSparkline } from '@/components/SprawlPriceSparkline';
import { CRTOverlay } from '@/components/CRTOverlay';

// NOTE: The CityCanvas component is created in Phase 4 (git-city fork).
// Import it here once available:
// import { CityCanvas } from '@/components/CityCanvas';

export default function WatchPage() {
  // Auto-hide cursor after 3 seconds of inactivity (presentation mode)
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const handleMove = () => {
      document.body.style.cursor = 'default';
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        document.body.style.cursor = 'none';
      }, 3000);
    };
    window.addEventListener('mousemove', handleMove);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      document.body.style.cursor = 'default';
      clearTimeout(timeout);
    };
  }, []);

  return (
    <main
      data-testid="watch-root"
      style={{
        background: 'var(--color-sprawl-bg)',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top bar: title + sparkline */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[color:var(--color-sprawl-accent)]/20 bg-[rgba(13,13,15,0.9)] z-10">
        <div className="flex items-center gap-3">
          <span className="font-[family-name:var(--font-pixel)] text-lg text-[color:var(--color-sprawl-cream)] uppercase">
            SPRAWL
          </span>
          <span className="font-[family-name:var(--font-pixel)] text-lg text-[color:var(--color-sprawl-accent)] uppercase">
            PROTOCOL
          </span>
          <span className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-sprawl-red)] animate-blink ml-4">
            LIVE
          </span>
        </div>
        <SprawlPriceSparkline />
      </div>

      {/* Cockpit grid — adapted from clan-world Cockpit.tsx */}
      <style>{`
        .watch-grid {
          flex: 1;
          display: grid;
          gap: 0px;
          min-height: 0;
          grid-template-columns: 320px 1fr 320px;
          grid-template-rows: 1fr 1fr;
          grid-template-areas:
            "feed city stats"
            "feed city top";
        }
        .watch-feed { grid-area: feed; min-height: 0; }
        .watch-city { grid-area: city; min-height: 0; position: relative; }
        .watch-stats { grid-area: stats; min-height: 0; }
        .watch-top { grid-area: top; min-height: 0; }

        @media (max-width: 960px) {
          .watch-grid {
            grid-template-columns: 1fr;
            grid-template-rows: 400px auto auto auto;
            grid-template-areas:
              "city"
              "feed"
              "stats"
              "top";
          }
        }
      `}</style>

      {/* Scoped scrollbar styles for watch mode — matches clan-world cockpit */}
      <style>{`
        [data-testid="watch-root"] {
          scrollbar-width: thin;
          scrollbar-color: var(--color-sprawl-border) transparent;
        }
        [data-testid="watch-root"] ::-webkit-scrollbar { width: 6px; height: 6px; }
        [data-testid="watch-root"] ::-webkit-scrollbar-track { background: transparent; }
        [data-testid="watch-root"] ::-webkit-scrollbar-thumb { background: var(--color-sprawl-border); border-radius: 3px; }
      `}</style>

      <div className="watch-grid">
        {/* Left: Decision feed */}
        <div className="watch-feed border-r border-[color:var(--color-sprawl-accent)]/10 bg-[rgba(13,13,15,0.85)]">
          <DecisionFeed />
        </div>

        {/* Center: 3D City with auto-orbit camera */}
        <div className="watch-city bg-black">
          {/* CityCanvas with autoOrbit={true} prop — Phase 4 component.
              For now, render a placeholder: */}
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <div className="font-[family-name:var(--font-pixel)] text-2xl text-[color:var(--color-sprawl-accent)] mb-2 uppercase">
                3D City View
              </div>
              <div className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-sprawl-muted)]">
                Auto-orbit camera active
              </div>
            </div>
          </div>
          {/* Once CityCanvas is available:
          <CityCanvas autoOrbit={true} theme="neon" showDecisionFeed={false} /> */}
        </div>

        {/* Right top: City stats */}
        <div className="watch-stats border-l border-[color:var(--color-sprawl-accent)]/10 bg-[rgba(13,13,15,0.85)]">
          <WatchStats />
        </div>

        {/* Right bottom: Top agents mini-leaderboard */}
        <div className="watch-top border-l border-t border-[color:var(--color-sprawl-accent)]/10 bg-[rgba(13,13,15,0.85)] overflow-y-auto">
          <div className="px-3 py-2 border-b border-[color:var(--color-sprawl-accent)]/20 bg-[rgba(13,13,15,0.5)]">
            <h3 className="font-[family-name:var(--font-pixel)] text-xs tracking-widest uppercase text-[color:var(--color-sprawl-accent)]">
              Top Agents
            </h3>
          </div>
          <div className="p-2">
            <TopAgentsMini />
          </div>
        </div>
      </div>

      {/* CRT scanline overlay for that retro-futuristic Demo Day feel */}
      <CRTOverlay />
    </main>
  );
}

// Inline mini-component: top 10 agents for the watch sidebar
function TopAgentsMini() {
  const [agents, setAgents] = useState<{ agent_id: number; name: string; sprawl_lifetime_earned: number; xp_level: number }[]>([]);

  useEffect(() => {
    fetch('/api/leaderboard?limit=10&sort=sprawl_lifetime_earned')
      .then(r => r.json())
      .then(d => setAgents(d.agents ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-1">
      {agents.map((a, i) => (
        <div key={a.agent_id} className="flex items-center gap-2 py-1 px-1">
          <span className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-sprawl-accent)] w-6">
            {i + 1}.
          </span>
          <span className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-sprawl-cream)] flex-1 truncate uppercase">
            {a.name ?? `Agent #${a.agent_id}`}
          </span>
          <span className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-sprawl-muted)]">
            L{a.xp_level}
          </span>
        </div>
      ))}
    </div>
  );
}

// Need useState for TopAgentsMini
import { useState } from 'react';
```

Note: The `import { useState } from 'react'` at the bottom needs to be moved to the top with the other imports during implementation. The code above shows the conceptual structure — during execution, consolidate all imports at the top of the file.

**Step 4: Commit**

```bash
git add frontend/src/components/watch/DecisionFeed.tsx frontend/src/components/watch/WatchStats.tsx frontend/src/app/watch/page.tsx
git commit -m "feat: add watch mode page with cockpit layout, decision feed, and CRT overlay"
```

---

### Task 7: Share card generation

**Files:**
- Create: `frontend/src/app/api/share-card/[agentId]/route.tsx`
- Copy: `public/fonts/Silkscreen-Regular.ttf` (from git-city)

**Step 1: Copy the Silkscreen font**

```bash
mkdir -p frontend/public/fonts
cp inspiration/git-city/public/fonts/Silkscreen-Regular.ttf frontend/public/fonts/
```

**Step 2: Write the share card route**

Adapted from `inspiration/git-city/src/app/api/share-card/[username]/route.tsx`. Replaces GitHub stats (commits, repos, stars, kudos) with agent stats (P&L, level, raids, $SPRAWL earned). Replaces "GIT CITY" branding with "SPRAWL PROTOCOL". Keeps the pixel building renderer, Silkscreen font, landscape + stories formats.

```tsx
// frontend/src/app/api/share-card/[agentId]/route.tsx
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type NextRequest } from "next/server";
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = "nodejs";

const STRATEGY_LABELS: Record<number, string> = { 0: 'PRESET', 1: 'RULES', 2: 'LLM' };
const STRATEGY_COLORS: Record<number, string> = { 0: '#00d4ff', 1: '#c8e64a', 2: '#aa66ff' };

// Tier system based on XP level (adapted from git-city)
const TIER_THRESHOLDS: [number, string, string][] = [
  [20, 'diamond', '#b9f2ff'],
  [15, 'gold', '#ffd700'],
  [10, 'silver', '#c0c0c0'],
  [1, 'bronze', '#cd7f32'],
];

function getTier(level: number): { name: string; color: string } {
  for (const [threshold, name, color] of TIER_THRESHOLDS) {
    if (level >= threshold) return { name, color };
  }
  return { name: 'bronze', color: '#cd7f32' };
}

const TIER_LABELS: Record<string, string> = {
  bronze: 'RISING', silver: 'SKILLED', gold: 'ELITE', diamond: 'LEGEND',
};

// Colors (matched to git-city share card palette)
const accent = "#c8e64a";
const bg = "#0d0d0f";
const cream = "#e8dcc8";
const border = "#2a2a30";
const cardBg = "#1c1c20";
const muted = "#8c8c9c";

// Window renderer (copied from git-city)
const WSIZE = 24;
const WGAP = 10;
const WCOLS = 5;

function renderWindows(bHeight: number, color: string) {
  const rowH = WSIZE + WGAP;
  const usable = bHeight - 36;
  const nRows = Math.max(2, Math.floor(usable / rowH));
  const rows = [];
  for (let r = 0; r < nRows; r++) {
    const cells = [];
    for (let c = 0; c < WCOLS; c++) {
      const lit = (r * 5 + c * 3) % 7 > 1;
      cells.push(
        <div key={c} style={{ width: WSIZE, height: WSIZE, backgroundColor: lit ? color : `${color}18` }} />
      );
    }
    rows.push(<div key={r} style={{ display: "flex", gap: WGAP }}>{cells}</div>);
  }
  return rows;
}

// Taunts adapted for agents
const TAUNTS = {
  level: [
    [20, "THE CITY BOWS TO ME"],
    [15, "MY BUILDING BLOCKS THE SUN"],
    [10, "I TRADE WHILE YOU SLEEP"],
    [5, "STILL CLIMBING"],
  ] as [number, string][],
  sprawl: [
    [5000, "I OWN THE SKYLINE"],
    [2000, "YOUR AGENT WORKS IN MY LOBBY"],
    [1000, "PRINTING $SPRAWL LIKE A PRO"],
    [500, "STACKING $SPRAWL DAILY"],
    [100, "SMALL BUILDING, BIG STRATEGY"],
  ] as [number, string][],
  fallback: "JUST SPAWNED. WATCH ME GROW.",
};

function getTaunt(level: number, sprawlEarned: number): string {
  for (const [threshold, phrase] of TAUNTS.level) {
    if (level >= threshold) return phrase;
  }
  for (const [threshold, phrase] of TAUNTS.sprawl) {
    if (sprawlEarned >= threshold) return phrase;
  }
  return TAUNTS.fallback;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const format = request.nextUrl.searchParams.get("format") ?? "landscape";

  const fontData = await readFile(join(process.cwd(), "public/fonts/Silkscreen-Regular.ttf"));
  const supabase = getSupabaseAdmin();

  const { data: agent } = await supabase
    .from("agents")
    .select("agent_id, name, strategy_type, xp_level, sprawl_lifetime_earned, total_volume, net_pnl, raid_wins, raid_losses, reputation_score, district")
    .eq("agent_id", parseInt(agentId, 10))
    .single();

  if (!agent) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: bg, fontFamily: "Silkscreen", color: cream, fontSize: 48, border: `6px solid ${border}` }}>
          Agent not found
        </div>
      ),
      { width: 1200, height: 675, fonts: [{ name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const }] }
    );
  }

  const tier = getTier(agent.xp_level);

  if (format === "stories") {
    return renderStories(agent, tier, fontData);
  }
  return renderLandscape(agent, tier, fontData);
}

// Landscape format (1200x675) — Twitter/OG card
function renderLandscape(
  agent: Record<string, unknown>,
  tier: { name: string; color: string },
  fontData: Buffer
) {
  const level = agent.xp_level as number;
  const sprawlEarned = agent.sprawl_lifetime_earned as number;
  const strategyType = agent.strategy_type as number;
  const strategyColor = STRATEGY_COLORS[strategyType] ?? accent;

  // Building height scales with level (1-25)
  const buildingH = Math.round(Math.min(520, Math.max(320, 320 + (level / 25) * 200)));
  const GROUND_Y = 590;

  const stats = [
    { label: "$SPRAWL", value: sprawlEarned.toLocaleString() },
    { label: "VOLUME", value: `$${((agent.total_volume as number) / 1e18).toFixed(0)}` },
    { label: "P&L", value: `${(agent.net_pnl as number) >= 0 ? '+' : ''}$${((agent.net_pnl as number) / 1e18).toFixed(0)}` },
    { label: "RAIDS", value: `${agent.raid_wins}W/${agent.raid_losses}L` },
  ];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", backgroundColor: bg, fontFamily: "Silkscreen", border: `6px solid ${border}`, position: "relative", overflow: "hidden" }}>
        {/* Building */}
        <div style={{ position: "absolute", left: 80, top: GROUND_Y - buildingH, width: 260, height: buildingH, backgroundColor: cardBg, borderTop: `6px solid ${strategyColor}`, borderLeft: `3px solid ${strategyColor}50`, borderRight: `3px solid ${strategyColor}50`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 16, gap: WGAP }}>
          {renderWindows(buildingH, strategyColor)}
        </div>

        {/* Right column */}
        <div style={{ position: "absolute", left: 420, top: 36, width: 720, display: "flex", flexDirection: "column" }}>
          {/* Name + strategy badge */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", fontSize: 44, color: cream, textTransform: "uppercase" }}>
              {(agent.name as string) ?? `Agent #${agent.agent_id}`}
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ display: "flex", fontSize: 18, color: strategyColor, border: `3px solid ${strategyColor}`, padding: "4px 14px", textTransform: "uppercase" }}>
                {STRATEGY_LABELS[strategyType]} AGENT
              </div>
              <div style={{ display: "flex", fontSize: 18, color: accent, border: `3px solid ${accent}`, padding: "4px 14px", textTransform: "uppercase" }}>
                LEVEL {level}
              </div>
              <div style={{ display: "flex", fontSize: 18, color: tier.color, border: `3px solid ${tier.color}`, padding: "4px 14px", textTransform: "uppercase" }}>
                {TIER_LABELS[tier.name]}
              </div>
            </div>
          </div>

          {/* Stats 2x2 */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 30 }}>
            {stats.map(stat => (
              <div key={stat.label} style={{ width: 310, display: "flex", flexDirection: "column", backgroundColor: cardBg, border: `3px solid ${border}`, padding: "12px 20px" }}>
                <div style={{ display: "flex", fontSize: 16, color: muted, textTransform: "uppercase" }}>{stat.label}</div>
                <div style={{ display: "flex", fontSize: 40, color: accent, marginTop: 2 }}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Reputation + district */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20 }}>
            <div style={{ display: "flex", fontSize: 14, color: muted, textTransform: "uppercase" }}>
              REP: {agent.reputation_score as number}
            </div>
            <div style={{ display: "flex", fontSize: 14, color: muted, textTransform: "uppercase" }}>
              DISTRICT: {agent.district as string}
            </div>
          </div>
        </div>

        {/* Ground */}
        <div style={{ position: "absolute", left: 0, top: GROUND_Y, width: 1200, height: 4, backgroundColor: accent, display: "flex" }} />
        <div style={{ position: "absolute", left: 0, top: GROUND_Y + 4, width: 1200, height: 90, backgroundColor: "#141418", display: "flex" }} />

        {/* Branding */}
        <div style={{ position: "absolute", bottom: 14, left: 0, width: 1200, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 40px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, textTransform: "uppercase" }}>
            <span style={{ fontSize: 24, color: cream }}>SPRAWL</span>
            <span style={{ fontSize: 24, color: accent }}>PROTOCOL</span>
          </div>
          <div style={{ display: "flex", fontSize: 16, color: muted, textTransform: "uppercase" }}>
            sprawlprotocol.xyz/agent/{agent.agent_id}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200, height: 675,
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
      fonts: [{ name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const }],
    }
  );
}

// Stories format (1080x1920) — IG/TikTok
function renderStories(
  agent: Record<string, unknown>,
  tier: { name: string; color: string },
  fontData: Buffer
) {
  const level = agent.xp_level as number;
  const sprawlEarned = agent.sprawl_lifetime_earned as number;
  const strategyType = agent.strategy_type as number;
  const strategyColor = STRATEGY_COLORS[strategyType] ?? accent;
  const taunt = getTaunt(level, sprawlEarned);

  const buildingH = Math.round(Math.min(750, Math.max(500, 500 + (level / 25) * 250)));
  const BWIDTH = 320;
  const GROUND_Y = 1320;

  const stats = [
    { label: "$SPRAWL", value: sprawlEarned.toLocaleString() },
    { label: "VOLUME", value: `$${((agent.total_volume as number) / 1e18).toFixed(0)}` },
    { label: "RAIDS", value: `${agent.raid_wins}W` },
  ];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: bg, fontFamily: "Silkscreen", position: "relative", overflow: "hidden", alignItems: "center" }}>
        {/* Taunt */}
        <div style={{ position: "absolute", top: 150, width: 920, display: "flex", justifyContent: "center" }}>
          <div style={{ display: "flex", fontSize: 36, color: accent, textTransform: "uppercase", textAlign: "center", justifyContent: "center" }}>
            &ldquo;{taunt}&rdquo;
          </div>
        </div>

        {/* Agent info */}
        <div style={{ position: "absolute", top: 250, display: "flex", flexDirection: "column", alignItems: "center", width: 920 }}>
          <div style={{ display: "flex", fontSize: 42, color: cream, textTransform: "uppercase", marginTop: 16, textAlign: "center", justifyContent: "center" }}>
            {(agent.name as string) ?? `Agent #${agent.agent_id}`}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
            <div style={{ display: "flex", fontSize: 18, color: strategyColor, border: `3px solid ${strategyColor}`, padding: "5px 14px", textTransform: "uppercase" }}>
              {STRATEGY_LABELS[strategyType]}
            </div>
            <div style={{ display: "flex", fontSize: 18, color: accent, border: `3px solid ${accent}`, padding: "5px 14px", textTransform: "uppercase" }}>
              LEVEL {level}
            </div>
            <div style={{ display: "flex", fontSize: 18, color: tier.color, border: `3px solid ${tier.color}`, padding: "5px 14px", textTransform: "uppercase" }}>
              {TIER_LABELS[tier.name]}
            </div>
          </div>
        </div>

        {/* Building */}
        <div style={{ position: "absolute", left: (1080 - BWIDTH) / 2, top: GROUND_Y - buildingH, width: BWIDTH, height: buildingH, backgroundColor: cardBg, borderTop: `6px solid ${strategyColor}`, borderLeft: `3px solid ${strategyColor}50`, borderRight: `3px solid ${strategyColor}50`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 16, gap: WGAP }}>
          {renderWindows(buildingH, strategyColor)}
        </div>

        {/* Ground */}
        <div style={{ position: "absolute", left: 100, top: GROUND_Y, width: 880, height: 4, backgroundColor: accent, display: "flex" }} />

        {/* Stats */}
        <div style={{ position: "absolute", top: GROUND_Y + 36, left: 100, width: 880, display: "flex", justifyContent: "space-around" }}>
          {stats.map(stat => (
            <div key={stat.label} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ display: "flex", fontSize: 50, color: accent }}>{stat.value}</div>
              <div style={{ display: "flex", fontSize: 16, color: muted, textTransform: "uppercase", marginTop: 4 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ position: "absolute", top: GROUND_Y + 220, display: "flex", flexDirection: "column", alignItems: "center", width: 1080, gap: 14 }}>
          <div style={{ display: "flex", fontSize: 26, color: bg, backgroundColor: accent, padding: "14px 44px", textTransform: "uppercase" }}>
            Can you beat this? → sprawlprotocol.xyz
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, textTransform: "uppercase" }}>
            <span style={{ fontSize: 20, color: cream }}>SPRAWL</span>
            <span style={{ fontSize: 20, color: accent }}>PROTOCOL</span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1080, height: 1920,
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
      fonts: [{ name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const }],
    }
  );
}
```

**Step 3: Add OG meta tags to agent page**

In the agent page (`frontend/src/app/agent/[agentId]/page.tsx`), add Open Graph and Twitter card meta tags pointing to the share card route:

```tsx
// In frontend/src/app/agent/[agentId]/page.tsx metadata export:
export async function generateMetadata({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return {
    openGraph: {
      title: `Agent #${agentId} — Sprawl Protocol`,
      images: [`/api/share-card/${agentId}?format=landscape`],
    },
    twitter: {
      card: 'summary_large_image',
      title: `Agent #${agentId} — Sprawl Protocol`,
      images: [`/api/share-card/${agentId}?format=landscape`],
    },
  };
}
```

**Step 4: Commit**

```bash
git add frontend/public/fonts/Silkscreen-Regular.ttf frontend/src/app/api/share-card/
git commit -m "feat: add share card generation with pixel building renderer (landscape + stories)"
```

---

### Task 8: Compare card generation

**Files:**
- Create: `frontend/src/app/api/compare-card/[agentA]/[agentB]/route.tsx`

**Step 1: Write the compare card route**

Adapted from `inspiration/git-city/src/app/api/compare-card/[userA]/[userB]/route.tsx`. Side-by-side buildings with stat comparison. Replaces GitHub metrics (commits, repos, stars, kudos) with agent metrics ($SPRAWL earned, volume, raids, reputation, P&L). Keeps trash talk system, VS badge, and winner highlighting.

```tsx
// frontend/src/app/api/compare-card/[agentA]/[agentB]/route.tsx
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type NextRequest } from "next/server";
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = "nodejs";

const STRATEGY_LABELS: Record<number, string> = { 0: 'PRESET', 1: 'RULES', 2: 'LLM' };
const STRATEGY_COLORS: Record<number, string> = { 0: '#00d4ff', 1: '#c8e64a', 2: '#aa66ff' };

// Trash talk by result (adapted from git-city)
const TRASH_TALK = {
  stomp: ["TOTAL DOMINATION", "NOT EVEN CLOSE", "ABSOLUTE DESTRUCTION"],
  win: ["BETTER LUCK NEXT CYCLE", "GET BACK TO TRAINING", "OUTPLAYED"],
  close: ["THAT WAS PERSONAL", "DOWN TO THE WIRE", "RAZOR THIN"],
  tie: ["PERFECTLY BALANCED", "REMATCH REQUIRED", "STALEMATE"],
};

function getTrashTalk(aWins: number, bWins: number): string {
  const diff = Math.abs(aWins - bWins);
  let pool: string[];
  if (aWins === bWins) pool = TRASH_TALK.tie;
  else if (diff >= 3) pool = TRASH_TALK.stomp;
  else if (diff === 2) pool = TRASH_TALK.win;
  else pool = TRASH_TALK.close;
  return pool[(aWins + bWins) % pool.length];
}

const accent = "#c8e64a";
const bg = "#0d0d0f";
const cream = "#e8dcc8";
const border = "#2a2a30";
const cardBg = "#1c1c20";
const muted = "#8c8c9c";

const WSIZE = 20;
const WGAP = 8;
const WCOLS = 5;

function renderWindows(bHeight: number, color: string) {
  const rowH = WSIZE + WGAP;
  const usable = bHeight - 30;
  const nRows = Math.max(2, Math.floor(usable / rowH));
  const rows = [];
  for (let r = 0; r < nRows; r++) {
    const cells = [];
    for (let c = 0; c < WCOLS; c++) {
      const lit = (r * 5 + c * 3) % 7 > 1;
      cells.push(<div key={c} style={{ width: WSIZE, height: WSIZE, backgroundColor: lit ? color : `${color}18` }} />);
    }
    rows.push(<div key={r} style={{ display: "flex", gap: WGAP }}>{cells}</div>);
  }
  return rows;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentA: string; agentB: string }> }
) {
  const { agentA, agentB } = await params;
  const format = request.nextUrl.searchParams.get("format") ?? "landscape";

  const fontData = await readFile(join(process.cwd(), "public/fonts/Silkscreen-Regular.ttf"));
  const supabase = getSupabaseAdmin();

  const fields = "agent_id, name, strategy_type, xp_level, sprawl_lifetime_earned, total_volume, net_pnl, raid_wins, raid_losses, reputation_score";
  const [{ data: devA }, { data: devB }] = await Promise.all([
    supabase.from("agents").select(fields).eq("agent_id", parseInt(agentA, 10)).single(),
    supabase.from("agents").select(fields).eq("agent_id", parseInt(agentB, 10)).single(),
  ]);

  if (!devA || !devB) {
    return new ImageResponse(
      (<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: bg, fontFamily: "Silkscreen", color: cream, fontSize: 48, border: `6px solid ${border}` }}>Agent not found</div>),
      { width: 1200, height: 675, fonts: [{ name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const }] }
    );
  }

  // Compare stats
  const statDefs = [
    { label: "$SPRAWL", key: "sprawl_lifetime_earned" as const, invert: false },
    { label: "LEVEL", key: "xp_level" as const, invert: false },
    { label: "VOLUME", key: "total_volume" as const, invert: false },
    { label: "RAIDS", key: "raid_wins" as const, invert: false },
    { label: "REP", key: "reputation_score" as const, invert: false },
  ];

  let aWins = 0;
  let bWins = 0;
  const statRows = statDefs.map(s => {
    const a: number = (devA as Record<string, number>)[s.key] ?? 0;
    const b: number = (devB as Record<string, number>)[s.key] ?? 0;
    const aWin = a > b;
    const bWin = b > a;
    if (aWin) aWins++;
    if (bWin) bWins++;
    return { label: s.label, a, b, aWin, bWin };
  });

  const isTie = aWins === bWins;
  const winnerName = aWins > bWins ? (devA.name ?? `Agent #${devA.agent_id}`) : (devB.name ?? `Agent #${devB.agent_id}`);
  const summary = isTie
    ? `Tie ${aWins}-${bWins}`
    : `${winnerName} wins ${Math.max(aWins, bWins)}-${Math.min(aWins, bWins)}`;

  const aIsWinner = aWins > bWins;
  const bIsWinner = bWins > aWins;
  const aColor = aIsWinner || isTie ? (STRATEGY_COLORS[devA.strategy_type as number] ?? accent) : muted;
  const bColor = bIsWinner || isTie ? (STRATEGY_COLORS[devB.strategy_type as number] ?? accent) : muted;
  const trashTalk = getTrashTalk(aWins, bWins);

  if (format === "stories") {
    return renderStories(devA, devB, statRows, summary, trashTalk, aColor, bColor, aIsWinner, bIsWinner, isTie, fontData);
  }
  return renderLandscape(devA, devB, statRows, summary, trashTalk, aColor, bColor, aIsWinner, bIsWinner, isTie, fontData);
}

function renderLandscape(
  devA: Record<string, unknown>, devB: Record<string, unknown>,
  statRows: { label: string; a: number; b: number; aWin: boolean; bWin: boolean }[],
  summary: string, trashTalk: string,
  aColor: string, bColor: string,
  aIsWinner: boolean, bIsWinner: boolean, isTie: boolean,
  fontData: Buffer
) {
  const maxLevel = Math.max(devA.xp_level as number, devB.xp_level as number, 1);
  const MIN_H = 180; const MAX_H = 360;
  const heightA = Math.round(MIN_H + ((devA.xp_level as number) / maxLevel) * (MAX_H - MIN_H));
  const heightB = Math.round(MIN_H + ((devB.xp_level as number) / maxLevel) * (MAX_H - MIN_H));
  const GROUND_Y = 510;
  const BLDG_W = 180;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", backgroundColor: bg, fontFamily: "Silkscreen", border: `6px solid ${border}`, position: "relative", overflow: "hidden" }}>
        {/* Left: Agent A */}
        <div style={{ position: "absolute", left: 30, top: 28, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 22, color: cream, textTransform: "uppercase" }}>{((devA.name ?? `Agent #${devA.agent_id}`) as string).slice(0, 14)}</div>
            <div style={{ display: "flex", fontSize: 12, color: aColor, textTransform: "uppercase" }}>{STRATEGY_LABELS[devA.strategy_type as number]}</div>
          </div>
        </div>

        <div style={{ position: "absolute", left: 60, top: GROUND_Y - heightA, width: BLDG_W, height: heightA, backgroundColor: cardBg, borderTop: `6px solid ${aColor}`, borderLeft: `3px solid ${aIsWinner || isTie ? `${accent}50` : border}`, borderRight: `3px solid ${aIsWinner || isTie ? `${accent}50` : border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14, gap: WGAP }}>
          {renderWindows(heightA, aColor)}
        </div>

        {/* Right: Agent B */}
        <div style={{ position: "absolute", right: 30, top: 28, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontSize: 22, color: cream, textTransform: "uppercase" }}>{((devB.name ?? `Agent #${devB.agent_id}`) as string).slice(0, 14)}</div>
            <div style={{ display: "flex", fontSize: 12, color: bColor, textTransform: "uppercase" }}>{STRATEGY_LABELS[devB.strategy_type as number]}</div>
          </div>
        </div>

        <div style={{ position: "absolute", right: 60, top: GROUND_Y - heightB, width: BLDG_W, height: heightB, backgroundColor: cardBg, borderTop: `6px solid ${bColor}`, borderLeft: `3px solid ${bIsWinner || isTie ? `${accent}50` : border}`, borderRight: `3px solid ${bIsWinner || isTie ? `${accent}50` : border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14, gap: WGAP }}>
          {renderWindows(heightB, bColor)}
        </div>

        {/* Center: VS + Stats */}
        <div style={{ position: "absolute", left: 270, top: 0, width: 660, height: GROUND_Y, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 16, color: accent, textTransform: "uppercase", marginBottom: 16 }}>&ldquo;{trashTalk}&rdquo;</div>
          <div style={{ display: "flex", fontSize: 48, color: accent, border: `4px solid ${accent}`, padding: "2px 26px", marginBottom: 20 }}>VS</div>
          {statRows.map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", marginBottom: 6, width: 620 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", width: 220, fontSize: 32, color: s.aWin ? accent : muted, paddingRight: 12 }}>{s.a.toLocaleString()}</div>
              <div style={{ display: "flex", justifyContent: "center", width: 160, fontSize: 16, color: `${muted}aa` }}>{s.label}</div>
              <div style={{ display: "flex", width: 220, fontSize: 32, color: s.bWin ? accent : muted, paddingLeft: 12 }}>{s.b.toLocaleString()}</div>
            </div>
          ))}
        </div>

        {/* Ground + footer */}
        <div style={{ position: "absolute", left: 0, top: GROUND_Y, width: 1200, height: 4, backgroundColor: accent, display: "flex" }} />
        <div style={{ position: "absolute", left: 0, top: GROUND_Y + 4, width: 1200, height: 160, backgroundColor: "#141418", display: "flex" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, width: 1200, height: 90, display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 40, paddingRight: 40 }}>
          <div style={{ display: "flex", fontSize: 26, color: cream, textTransform: "uppercase" }}>{summary}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, textTransform: "uppercase" }}>
            <span style={{ fontSize: 26, color: cream }}>SPRAWL</span>
            <span style={{ fontSize: 26, color: accent }}>PROTOCOL</span>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 675, headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" }, fonts: [{ name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const }] }
  );
}

function renderStories(
  devA: Record<string, unknown>, devB: Record<string, unknown>,
  statRows: { label: string; a: number; b: number; aWin: boolean; bWin: boolean }[],
  summary: string, trashTalk: string,
  aColor: string, bColor: string,
  aIsWinner: boolean, bIsWinner: boolean, isTie: boolean,
  fontData: Buffer
) {
  const maxLevel = Math.max(devA.xp_level as number, devB.xp_level as number, 1);
  const MIN_H = 300; const MAX_H = 550;
  const heightA = Math.round(MIN_H + ((devA.xp_level as number) / maxLevel) * (MAX_H - MIN_H));
  const heightB = Math.round(MIN_H + ((devB.xp_level as number) / maxLevel) * (MAX_H - MIN_H));
  const GROUND_Y = 1050;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: bg, fontFamily: "Silkscreen", position: "relative", overflow: "hidden", alignItems: "center" }}>
        <div style={{ position: "absolute", top: 150, width: 920, display: "flex", justifyContent: "center" }}>
          <div style={{ display: "flex", fontSize: 34, color: accent, textTransform: "uppercase", textAlign: "center", justifyContent: "center" }}>&ldquo;{trashTalk}&rdquo;</div>
        </div>

        {/* Agents row */}
        <div style={{ position: "absolute", top: 230, width: 920, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 320 }}>
            <div style={{ display: "flex", fontSize: 22, color: cream, textTransform: "uppercase" }}>{((devA.name ?? `Agent #${devA.agent_id}`) as string).slice(0, 14)}</div>
            <div style={{ display: "flex", fontSize: 14, color: aColor, textTransform: "uppercase", marginTop: 4 }}>{STRATEGY_LABELS[devA.strategy_type as number]}</div>
          </div>
          <div style={{ display: "flex", fontSize: 44, color: accent, border: `3px solid ${accent}`, padding: "4px 22px" }}>VS</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 320 }}>
            <div style={{ display: "flex", fontSize: 22, color: cream, textTransform: "uppercase" }}>{((devB.name ?? `Agent #${devB.agent_id}`) as string).slice(0, 14)}</div>
            <div style={{ display: "flex", fontSize: 14, color: bColor, textTransform: "uppercase", marginTop: 4 }}>{STRATEGY_LABELS[devB.strategy_type as number]}</div>
          </div>
        </div>

        {/* Buildings */}
        <div style={{ position: "absolute", left: 140, top: GROUND_Y - heightA, width: 260, height: heightA, backgroundColor: cardBg, borderTop: `6px solid ${aColor}`, borderLeft: `3px solid ${aIsWinner || isTie ? `${accent}50` : border}`, borderRight: `3px solid ${aIsWinner || isTie ? `${accent}50` : border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14, gap: WGAP }}>
          {renderWindows(heightA, aColor)}
        </div>
        <div style={{ position: "absolute", left: 680, top: GROUND_Y - heightB, width: 260, height: heightB, backgroundColor: cardBg, borderTop: `6px solid ${bColor}`, borderLeft: `3px solid ${bIsWinner || isTie ? `${accent}50` : border}`, borderRight: `3px solid ${bIsWinner || isTie ? `${accent}50` : border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14, gap: WGAP }}>
          {renderWindows(heightB, bColor)}
        </div>

        <div style={{ position: "absolute", left: 80, top: GROUND_Y, width: 920, height: 4, backgroundColor: accent, display: "flex" }} />

        {/* Stats */}
        <div style={{ position: "absolute", top: GROUND_Y + 40, left: 0, width: 1080, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          {statRows.map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", width: 900 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", width: 320, fontSize: 34, color: s.aWin ? accent : muted, paddingRight: 16 }}>{s.a.toLocaleString()}</div>
              <div style={{ display: "flex", justifyContent: "center", width: 160, fontSize: 16, color: `${muted}aa` }}>{s.label}</div>
              <div style={{ display: "flex", width: 320, fontSize: 34, color: s.bWin ? accent : muted, paddingLeft: 16 }}>{s.b.toLocaleString()}</div>
            </div>
          ))}
        </div>

        <div style={{ position: "absolute", top: GROUND_Y + 310, width: 1080, display: "flex", justifyContent: "center", fontSize: 28, color: cream, textTransform: "uppercase" }}>{summary}</div>

        <div style={{ position: "absolute", top: GROUND_Y + 380, display: "flex", flexDirection: "column", alignItems: "center", width: 1080, gap: 14 }}>
          <div style={{ display: "flex", fontSize: 24, color: bg, backgroundColor: accent, padding: "12px 40px", textTransform: "uppercase" }}>Who wins? → sprawlprotocol.xyz</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, textTransform: "uppercase" }}>
            <span style={{ fontSize: 20, color: cream }}>SPRAWL</span>
            <span style={{ fontSize: 20, color: accent }}>PROTOCOL</span>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920, headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" }, fonts: [{ name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const }] }
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/app/api/compare-card/
git commit -m "feat: add compare card generation with side-by-side agent buildings + trash talk"
```

---

### Task 9: Supabase migration for price snapshots

**Files:**
- Create: `frontend/supabase/migrations/050_price_snapshots.sql`

**Step 1: Write the migration**

Create a `price_snapshots` table to store periodic $SPRAWL/sUSDC prices for the sparkline chart. The indexer or MarketMaker bot writes a snapshot after each swap cycle.

```sql
-- Price snapshots for sparkline chart
-- The MarketMaker bot inserts a row after each price sync cycle (~30s)
-- The /api/price-history route reads from this table as a fallback when
-- trade_history doesn't have enough SPRAWL swap data

CREATE TABLE price_snapshots (
    id SERIAL PRIMARY KEY,
    pool_id TEXT NOT NULL,              -- e.g., 'SPRAWL_sUSDC'
    price NUMERIC(20, 8) NOT NULL,      -- price of token A in terms of token B
    reserve_a NUMERIC(30, 0),
    reserve_b NUMERIC(30, 0),
    source TEXT DEFAULT 'market_maker',  -- 'market_maker' | 'agent_trade' | 'manual'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_price_snapshots_pool_time ON price_snapshots(pool_id, created_at DESC);

-- RLS: public read, service-role write
ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON price_snapshots FOR SELECT USING (true);

-- Cleanup: auto-delete snapshots older than 7 days (cron or manual)
-- Run periodically: DELETE FROM price_snapshots WHERE created_at < NOW() - INTERVAL '7 days';
```

**Step 2: Update the price-history API route to also query price_snapshots**

In `frontend/src/app/api/price-history/route.ts`, add a fallback query to `price_snapshots` when `trade_history` has insufficient data:

```typescript
// Add after the trade_history query in /api/price-history/route.ts:
if (pricePoints.length < 10) {
  const { data: snapshots } = await supabase
    .from('price_snapshots')
    .select('created_at, price')
    .eq('pool_id', 'SPRAWL_sUSDC')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(200);

  if (snapshots) {
    for (const snap of snapshots) {
      pricePoints.push({ ts: snap.created_at, price: parseFloat(snap.price) });
    }
    // Sort by time after merging
    pricePoints.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  }
}
```

**Step 3: Commit**

```bash
git add frontend/supabase/migrations/050_price_snapshots.sql frontend/src/app/api/price-history/route.ts
git commit -m "feat: add price_snapshots table + fallback query for sparkline data"
```

---

### Task 10: Share button + compare button UI

**Files:**
- Create: `frontend/src/components/ShareButton.tsx`
- Create: `frontend/src/components/CompareButton.tsx`

**Step 1: Create the share button**

Renders on the agent detail page. Copies the share card URL to clipboard and opens a Twitter intent with the share card image.

```tsx
// frontend/src/components/ShareButton.tsx
'use client'

import { useState } from 'react';
import { PixelButton } from '@/components/ui/PixelButton';

interface ShareButtonProps {
  agentId: number;
  agentName: string;
}

export function ShareButton({ agentId, agentName }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}/agent/${agentId}`;
  const cardUrl = `${window.location.origin}/api/share-card/${agentId}?format=landscape`;
  const tweetText = encodeURIComponent(
    `Check out ${agentName}'s building in Sprawl Protocol! Can you beat this? #SprawlProtocol #MantleAIHackathon`
  );
  const twitterUrl = `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(shareUrl)}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex gap-2">
      <PixelButton size="sm" variant="primary" onClick={() => window.open(twitterUrl, '_blank')}>
        Share on X
      </PixelButton>
      <PixelButton size="sm" variant="ghost" onClick={handleCopy}>
        {copied ? 'Copied!' : 'Copy Link'}
      </PixelButton>
    </div>
  );
}
```

**Step 2: Create the compare button**

Allows selecting two agents and navigating to the compare card view.

```tsx
// frontend/src/components/CompareButton.tsx
'use client'

import { PixelButton } from '@/components/ui/PixelButton';

interface CompareButtonProps {
  agentId: number;
  targetAgentId?: number;
}

export function CompareButton({ agentId, targetAgentId }: CompareButtonProps) {
  const handleCompare = () => {
    if (targetAgentId) {
      window.open(`/api/compare-card/${agentId}/${targetAgentId}?format=landscape`, '_blank');
    }
  };

  return (
    <PixelButton
      size="sm"
      variant="secondary"
      onClick={handleCompare}
      disabled={!targetAgentId}
    >
      Compare
    </PixelButton>
  );
}
```

**Step 3: Commit**

```bash
git add frontend/src/components/ShareButton.tsx frontend/src/components/CompareButton.tsx
git commit -m "feat: add ShareButton + CompareButton for X/Twitter share card integration"
```

---

## Summary: What Phase 7 Delivers

After completing all 10 tasks:

- [x] Pixel UI component library (PixelButton, PixelCard, PixelDialog, StatBar) with Sprawl palette
- [x] CRT scanline overlay component for retro-futuristic aesthetic
- [x] Leaderboard API route with multi-criteria sorting, strategy filtering, pagination
- [x] Leaderboard page with real-time updates via Supabase Realtime
- [x] $SPRAWL/sUSDC price sparkline in the UI header (SVG, no chart library)
- [x] Watch mode page — full-screen cockpit layout with decision feed, city stats, top agents sidebar
- [x] Share card generation (landscape 1200x675 + stories 1080x1920) with pixel building renderer
- [x] Compare card generation with side-by-side buildings, stat comparison, trash talk
- [x] Price snapshots Supabase table for sparkline data persistence
- [x] Share + Compare buttons for X/Twitter virality (targets $17K community voting prize)

**Dependencies from earlier phases:**
- Phase 1: Contract ABIs, deployment addresses (`@/lib/config`, `@/constants/abis`)
- Phase 3: Supabase schema (`agents`, `trade_history`, `activity_feed` tables), `getSupabaseAdmin()`, `createBrowserSupabase()`
- Phase 4: `CityCanvas` component (watch mode renders a placeholder until Phase 4 is complete)
- Phase 5: Agent detail page (`/agent/[agentId]`) for share button integration

**Next phase:** Phase 8 (Polish + Submission) — demo mode, AA onboarding, video, X thread, DoraHacks submission.
