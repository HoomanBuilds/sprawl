# Phase 2: Agent Engine — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the full agent runtime: Supabase schema for agent state + memory, tick-loop engine, market context reader, memory system with 3-factor retrieval, policy + LLM strategy engines, guardrail layer, on-chain execution, market maker bot, daily P&L settlement, and all entry scripts.

**Architecture:** Custom TypeScript runtime borrowing patterns from ai-town (tick loop), generative_agents (memory stream + 3-factor retrieval), Voyager (skill library), clan-world (settle latch), Signatory (DeepSeek + ethers v5 execution), byreal (dry-run guardrails), and eth-open-agents (LLM fallbacks).

**Tech Stack:** TypeScript, ethers v5, Supabase (Postgres + pgvector + Realtime + RLS), DeepSeek v4, CoinGecko API, node-cron

**Design doc reference:** `docs/plans/2026-05-30-sprawl-protocol-implementation-plan.md` — Sections 2.1 through 2.4 (lines 568-1111).

**Prerequisites:** Phase 1 complete — all contracts deployed to Mantle Sepolia, `frontend/` initialized with Next.js, `frontend/src/lib/` directories created, `frontend/src/lib/ethers-provider.ts` + `frontend/src/lib/config.ts` + `frontend/src/types/agent.ts` exist.

---

### Task 1: Supabase migration — agents table + all supporting tables

<!--
  Migration numbering scheme (to avoid collisions across phases):
    Phase 2 (Agent Engine):  001–010
    Phase 3 (Frontend):      020–029
    Phase 5 (Spawn/Wallet):  030–039
    Phase 6 (Social):        040–049
    Phase 7 (Raids/Events):  050–059
-->

**Files:**
- Create: `frontend/supabase/migrations/001_agents.sql`
- Create: `frontend/supabase/migrations/002_trade_history.sql`
- Create: `frontend/supabase/migrations/003_agent_memories.sql`
- Create: `frontend/supabase/migrations/004_agent_memory_embeddings.sql`
- Create: `frontend/supabase/migrations/005_agent_skills.sql`
- Create: `frontend/supabase/migrations/006_agent_wallets.sql`
- Create: `frontend/supabase/migrations/007_activity_feed.sql`
- Create: `frontend/supabase/migrations/008_rls_policies.sql`
- Create: `frontend/src/lib/supabase.ts`

**Step 1: Create the agents table migration**

Reference: Design doc Section 3.2 (line 1155) for the full agents schema. Adapted from `inspiration/git-city/supabase/migrations/` — renaming `developers` to `agents`.

```sql
-- frontend/supabase/migrations/001_agents.sql
CREATE TABLE agents (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER UNIQUE NOT NULL,
    wallet_address TEXT NOT NULL,
    owner_address TEXT NOT NULL,
    name TEXT,
    persona TEXT,
    strategy_type SMALLINT DEFAULT 0,
    policy_config JSONB DEFAULT '{}',

    sprawl_balance BIGINT DEFAULT 0,
    sprawl_lifetime_earned BIGINT DEFAULT 0,
    sprawl_lifetime_spent BIGINT DEFAULT 0,
    last_portfolio_value BIGINT DEFAULT 0,
    last_settlement_date DATE,

    total_volume BIGINT DEFAULT 0,
    strategy_count INTEGER DEFAULT 1,
    recent_actions INTEGER DEFAULT 0,
    reputation_score INTEGER DEFAULT 0,

    xp_total INTEGER DEFAULT 0,
    xp_level INTEGER DEFAULT 1,
    xp_daily INTEGER DEFAULT 0,
    xp_daily_date DATE,
    raid_xp INTEGER DEFAULT 0,
    raid_wins INTEGER DEFAULT 0,
    raid_losses INTEGER DEFAULT 0,
    app_streak INTEGER DEFAULT 0,
    weekly_volume BIGINT DEFAULT 0,
    weekly_start_date DATE DEFAULT CURRENT_DATE,
    profit_streak INTEGER DEFAULT 0,
    reputation_given INTEGER DEFAULT 0,
    poignancy_accumulator INTEGER DEFAULT 0,

    district TEXT DEFAULT 'general',
    net_pnl BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_action_at TIMESTAMPTZ
);

CREATE INDEX idx_agents_owner ON agents(owner_address);
CREATE INDEX idx_agents_wallet ON agents(wallet_address);
CREATE INDEX idx_agents_district ON agents(district);
```

**Step 2: Create trade_history migration**

Reference: Design doc Section 2.2 (line 672).

```sql
-- frontend/supabase/migrations/002_trade_history.sql
CREATE TABLE trade_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER REFERENCES agents(agent_id),
    action TEXT NOT NULL,
    token_in TEXT,
    token_out TEXT,
    amount_in BIGINT,
    amount_out BIGINT,
    price_at_trade NUMERIC,
    pnl_realized NUMERIC DEFAULT 0,
    tx_hash TEXT NOT NULL,
    rationale TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trade_history_agent ON trade_history(agent_id, created_at DESC);
CREATE INDEX idx_trade_history_action ON trade_history(action);
```

**Step 3: Create agent_memories migration**

Reference: Design doc Section 2.2 (line 689). Memory stream schema from `inspiration/generative_agents/reverie/backend_server/persona/memory_structures/associative_memory.py`.

```sql
-- frontend/supabase/migrations/003_agent_memories.sql
CREATE TABLE agent_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER REFERENCES agents(agent_id),
    type TEXT NOT NULL,
    depth INTEGER DEFAULT 0,
    description TEXT NOT NULL,
    subject TEXT,
    predicate TEXT,
    object TEXT,
    poignancy INTEGER DEFAULT 5,
    keywords TEXT[],
    evidence UUID[],
    embedding_id UUID,
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_memories_agent ON agent_memories(agent_id, created_at DESC);
CREATE INDEX idx_memories_type ON agent_memories(agent_id, type);
CREATE INDEX idx_memories_keywords ON agent_memories USING GIN(keywords);
```

**Step 4: Create agent_memory_embeddings migration (pgvector)**

Reference: Design doc Section 2.2 (line 712). Vector search pattern from `inspiration/ai-town/convex/agent/memory.ts`.

```sql
-- frontend/supabase/migrations/004_agent_memory_embeddings.sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE agent_memory_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER,
    embedding_key TEXT NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_embeddings_agent ON agent_memory_embeddings(agent_id);
CREATE INDEX idx_embeddings_vector ON agent_memory_embeddings
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

**Step 5: Create agent_skills migration**

Reference: Design doc Section 2.2 (line 722). Skill library from `inspiration/Voyager/voyager/agents/skill.py` lines 61-127.

```sql
-- frontend/supabase/migrations/005_agent_skills.sql
CREATE TABLE agent_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER REFERENCES agents(agent_id),
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    embedding_id UUID,
    success_rate NUMERIC DEFAULT 0,
    avg_pnl NUMERIC DEFAULT 0,
    times_used INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agent_id, name)
);

CREATE INDEX idx_skills_agent ON agent_skills(agent_id);
```

**Step 6: Create agent_wallets migration**

```sql
-- frontend/supabase/migrations/006_agent_wallets.sql
-- CANONICAL schema (matches Phase 5 — AES-256-GCM with separate iv/auth_tag columns)
CREATE TABLE agent_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER UNIQUE REFERENCES agents(agent_id),
    encrypted_private_key TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    wallet_address TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wallets_address ON agent_wallets(wallet_address);
```

**Step 7: Create activity_feed migration**

Reference: `inspiration/git-city/src/app/api/feed/route.ts`.

```sql
-- frontend/supabase/migrations/007_activity_feed.sql
-- CANONICAL schema (matches master doc Appendix M, Phase 3, Phase 6)
CREATE TABLE activity_feed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    actor_id INTEGER,
    target_id INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feed_created ON activity_feed(created_at DESC);
CREATE INDEX idx_feed_actor ON activity_feed(actor_id, created_at DESC);
CREATE INDEX idx_feed_type ON activity_feed(event_type);
```

**Step 8: Create RLS policies**

```sql
-- frontend/supabase/migrations/008_rls_policies.sql
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;

-- Public read for agents (city is viewable by all)
CREATE POLICY "agents_public_read" ON agents FOR SELECT USING (true);
-- Only owner can update their agent
CREATE POLICY "agents_owner_update" ON agents FOR UPDATE
    USING (owner_address = current_setting('request.jwt.claims', true)::jsonb->>'wallet_address');

-- Public read for trade history
CREATE POLICY "trades_public_read" ON trade_history FOR SELECT USING (true);
-- Engine inserts trades (service role)
CREATE POLICY "trades_service_insert" ON trade_history FOR INSERT
    WITH CHECK (current_setting('role') = 'service_role');

-- Memories are private to agent owner
CREATE POLICY "memories_owner_read" ON agent_memories FOR SELECT
    USING (agent_id IN (SELECT agent_id FROM agents WHERE owner_address = current_setting('request.jwt.claims', true)::jsonb->>'wallet_address'));
CREATE POLICY "memories_service_insert" ON agent_memories FOR INSERT
    WITH CHECK (current_setting('role') = 'service_role');

-- Embeddings are service-only
CREATE POLICY "embeddings_service_all" ON agent_memory_embeddings FOR ALL
    USING (current_setting('role') = 'service_role');

-- Skills are public read (viewable in building inspector)
CREATE POLICY "skills_public_read" ON agent_skills FOR SELECT USING (true);
CREATE POLICY "skills_service_insert" ON agent_skills FOR INSERT
    WITH CHECK (current_setting('role') = 'service_role');

-- Wallets are strictly service-only
CREATE POLICY "wallets_service_all" ON agent_wallets FOR ALL
    USING (current_setting('role') = 'service_role');

-- Activity feed is public
CREATE POLICY "feed_public_read" ON activity_feed FOR SELECT USING (true);
CREATE POLICY "feed_service_insert" ON activity_feed FOR INSERT
    WITH CHECK (current_setting('role') = 'service_role');
```

**Step 9: Create Supabase client**

```typescript
// frontend/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Function exports for Phases 4-7 which import as getSupabaseAdmin()/getSupabaseBrowser()
export function getSupabaseAdmin() { return supabaseAdmin; }
export function getSupabaseBrowser() { return supabase; }
```

**Step 10: Install Supabase deps**

```bash
cd frontend && npm install @supabase/supabase-js
```

**Step 11: Run migrations**

```bash
npx supabase db push
```
Expected: All 8 migrations applied (009 added in Task 4), tables created, RLS policies active.

**Step 12: Commit**

```bash
git add frontend/supabase/migrations/ frontend/src/lib/supabase.ts
git commit -m "feat: add Supabase migrations for agents, memories, trades, skills, wallets, feed + RLS"
```

---

### Task 2: Agent types + market context types

**Files:**
- Modify: `frontend/src/types/agent.ts` (add missing types)
- Create: `frontend/src/types/market.ts`
- Create: `frontend/src/types/memory.ts`
- Create: `frontend/src/types/engine.ts`

**Step 1: Add strategy engine types**

Reference: Design doc Section 2.3 (line 993).

```typescript
// frontend/src/types/engine.ts
export interface AgentDecision {
    action: 'swap' | 'provideLiquidity' | 'removeLiquidity' | 'harvest' | 'hold' | 'raid';
    protocol: string;
    params: Record<string, any>;
    rationale: string;
}

export interface StrategyEngine {
    decide(ctx: AgentContext): Promise<AgentDecision>;
}

export interface AgentContext {
    iss: {
        name: string;
        persona: string;
        strategy_type: 0 | 1 | 2;
        goal: string;
        constraints: string;
    };
    portfolio: {
        holdings: Record<string, number>;
        totalValueUSD: number;
        unrealizedPnl: number;
        sprawlEarned: number;
        sprawlBalance: number;
    };
    recentTrades: Array<{
        action: string;
        pair: string;
        amount: number;
        pnl: number;
        rationale: string;
        time: string;
    }>;
    market: MarketSnapshot;
    memories: string[];
    skills: Array<{ name: string; description: string; successRate: number }>;
    policyRules: import('./agent').PolicyRule[];
}

export interface GuardrailConfig {
    maxPositionPct: number;
    maxSlippageBps: number;
    maxTxPerHour: number;
    allowedProtocols: string[];
    dryRun: boolean;
}

export interface ExecutionResult {
    txHash: string;
    success: boolean;
    amountIn: string;
    amountOut: string;
    realizedPnl: number;
    error?: string;
}
```

**Step 2: Add market context types**

```typescript
// frontend/src/types/market.ts
export interface PoolState {
    poolId: string;
    name: string;
    tokenA: string;
    tokenB: string;
    reserveA: string;
    reserveB: string;
    price: number;
    priceChange1h: number;
    priceChange24h: number;
    volume24h: number;
    tvl: number;
    apr: number;
}

export interface MarketSnapshot {
    prices: Record<string, number>;
    pools: PoolState[];
    timestamp: number;
}

export interface CoinGeckoPrice {
    usd: number;
    usd_24h_change: number;
}
```

**Step 3: Add memory types**

Reference: Design doc Section 2.1 (line 596). Memory node from `inspiration/generative_agents/reverie/backend_server/persona/memory_structures/associative_memory.py`.

```typescript
// frontend/src/types/memory.ts
export interface MemoryNode {
    id: string;
    agent_id: number;
    type: 'event' | 'thought' | 'trade' | 'reflection';
    depth: number;
    description: string;
    subject?: string;
    predicate?: string;
    object?: string;
    poignancy: number;
    keywords: string[];
    evidence: string[];
    embedding_id?: string;
    last_accessed_at: string;
    created_at: string;
    expires_at?: string;
}

export interface MemoryRetrievalOptions {
    topK: number;
    overfetch: number;
    recencyWeight: number;
    relevanceWeight: number;
    importanceWeight: number;
}

export interface SkillRecord {
    id: string;
    agent_id: number;
    name: string;
    code: string;
    description: string;
    embedding_id?: string;
    success_rate: number;
    avg_pnl: number;
    times_used: number;
    version: number;
}
```

**Step 4: Commit**

```bash
git add frontend/src/types/engine.ts frontend/src/types/market.ts frontend/src/types/memory.ts
git commit -m "feat: add TypeScript types for engine, market, and memory systems"
```

---

### Task 3: Market context reader

**Files:**
- Create: `frontend/src/lib/engine/market-reader.ts`

**Step 1: Write the market context reader**

This reads SprawlDEX prices, pool states, and agent portfolio from chain. Uses ethers v5 with `StaticJsonRpcProvider` + `skipFetchSetup: true`.

Reference: `inspiration/signatory/frontend/src/lib/ethers-provider.ts` for provider pattern. `inspiration/signatory/frontend/src/lib/goat.ts` for token balance reading.

```typescript
// frontend/src/lib/engine/market-reader.ts
import { ethers } from 'ethers';
import { getMantleSepoliaProvider } from '../ethers-provider';
import { CONTRACTS } from '../config';
import { SprawlDEXABI } from '@/constants/abis';
import { SprawlTokenABI } from '@/constants/abis';
import type { MarketSnapshot, PoolState } from '@/types/market';

const TOKEN_SYMBOLS = ['sETH', 'sBTC', 'sUSDC', 'sPOL', 'sSOL', 'SPRAWL'] as const;

const TOKEN_DECIMALS: Record<string, number> = {
    sETH: 18, sBTC: 18, sUSDC: 18, sPOL: 18, sSOL: 18, SPRAWL: 18,
};

const POOL_PAIRS: Array<[string, string]> = [
    ['sETH', 'sUSDC'],
    ['sBTC', 'sUSDC'],
    ['sPOL', 'sUSDC'],
    ['sSOL', 'sUSDC'],
    ['SPRAWL', 'sUSDC'],
];

let lastSnapshot: MarketSnapshot | null = null;
let lastSnapshotTime = 0;
const CACHE_TTL_MS = 10_000;

export async function readMarketContext(): Promise<MarketSnapshot> {
    if (lastSnapshot && Date.now() - lastSnapshotTime < CACHE_TTL_MS) {
        return lastSnapshot;
    }

    const provider = getMantleSepoliaProvider();
    const dex = new ethers.Contract(CONTRACTS.SprawlDEX, SprawlDEXABI.abi, provider);

    const prices: Record<string, number> = { sUSDC: 1 };
    const pools: PoolState[] = [];

    for (const [tokenA, tokenB] of POOL_PAIRS) {
        const addressA = CONTRACTS[tokenA as keyof typeof CONTRACTS];
        const addressB = CONTRACTS[tokenB as keyof typeof CONTRACTS];

        const poolId = await dex.getPoolId(addressA, addressB);
        const poolInfo = await dex.getPoolInfo(poolId);

        const reserveA = ethers.utils.formatEther(poolInfo.reserveA);
        const reserveB = ethers.utils.formatEther(poolInfo.reserveB);

        const priceRaw = await dex.getPrice(addressA, addressB);
        const price = parseFloat(ethers.utils.formatEther(priceRaw));

        prices[tokenA] = price;

        const prevPool = lastSnapshot?.pools.find(p => p.name === `${tokenA}/${tokenB}`);
        const priceChange1h = prevPool ? (price - prevPool.price) / prevPool.price : 0;

        pools.push({
            poolId,
            name: `${tokenA}/${tokenB}`,
            tokenA,
            tokenB,
            reserveA,
            reserveB,
            price,
            priceChange1h,
            priceChange24h: 0,
            volume24h: 0,
            tvl: parseFloat(reserveB) * 2,
            apr: 0,
        });
    }

    const snapshot: MarketSnapshot = {
        prices,
        pools,
        timestamp: Date.now(),
    };

    lastSnapshot = snapshot;
    lastSnapshotTime = Date.now();
    return snapshot;
}

export async function readPortfolio(walletAddress: string): Promise<Record<string, number>> {
    const provider = getMantleSepoliaProvider();
    const holdings: Record<string, number> = {};

    for (const symbol of TOKEN_SYMBOLS) {
        const tokenAddress = CONTRACTS[symbol as keyof typeof CONTRACTS];
        const token = new ethers.Contract(tokenAddress, SprawlTokenABI.abi, provider);
        const balance = await token.balanceOf(walletAddress);
        holdings[symbol] = parseFloat(ethers.utils.formatEther(balance));
    }

    return holdings;
}

export function calculatePortfolioValue(
    holdings: Record<string, number>,
    prices: Record<string, number>
): number {
    let total = 0;
    for (const [token, amount] of Object.entries(holdings)) {
        const price = prices[token] ?? 0;
        total += amount * price;
    }
    return total;
}

export function getLargestHolding(
    holdings: Record<string, number>,
    prices: Record<string, number>
): { token: string; pct: number } {
    const totalValue = calculatePortfolioValue(holdings, prices);
    if (totalValue === 0) return { token: 'none', pct: 0 };

    let maxToken = '';
    let maxValue = 0;
    for (const [token, amount] of Object.entries(holdings)) {
        const value = amount * (prices[token] ?? 0);
        if (value > maxValue) {
            maxValue = value;
            maxToken = token;
        }
    }

    return { token: maxToken, pct: Math.round((maxValue / totalValue) * 100) };
}
```

**Step 2: Run type check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: No errors.

**Step 3: Commit**

```bash
git add frontend/src/lib/engine/market-reader.ts
git commit -m "feat: add market context reader for SprawlDEX prices and agent portfolios"
```

---

### Task 4: Memory system — add, retrieve, reflect

**Files:**
- Create: `frontend/src/lib/memory/memory-stream.ts`
- Create: `frontend/src/lib/memory/retrieval.ts`
- Create: `frontend/src/lib/memory/reflection.ts`
- Create: `frontend/src/lib/memory/embeddings.ts`

**Step 1: Write the embedding helper**

Reference: Vector search pattern from `inspiration/ai-town/convex/agent/memory.ts`. Uses DeepSeek embeddings endpoint (same model family as chat).

```typescript
// frontend/src/lib/memory/embeddings.ts
import { supabaseAdmin } from '../supabase';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-ada-002';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function getEmbedding(text: string): Promise<number[]> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: text,
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Embedding API error: ${res.status} - ${err}`);
    }

    const data = await res.json();
    return data.data[0].embedding;
}

export async function storeEmbedding(
    agentId: number,
    text: string,
    embedding: number[]
): Promise<string> {
    const { data, error } = await supabaseAdmin
        .from('agent_memory_embeddings')
        .insert({
            agent_id: agentId,
            embedding_key: text,
            embedding: JSON.stringify(embedding),
        })
        .select('id')
        .single();

    if (error) throw new Error(`Failed to store embedding: ${error.message}`);
    return data.id;
}

export async function searchSimilarEmbeddings(
    agentId: number,
    queryEmbedding: number[],
    limit: number
): Promise<Array<{ id: string; embedding_key: string; similarity: number }>> {
    const { data, error } = await supabaseAdmin.rpc('match_embeddings', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_agent_id: agentId,
        match_count: limit,
    });

    if (error) throw new Error(`Embedding search failed: ${error.message}`);
    return data ?? [];
}
```

**Step 2: Write the memory stream (add memories)**

Reference: `inspiration/generative_agents/reverie/backend_server/persona/memory_structures/associative_memory.py` for the ConceptNode structure. Design doc Section 2.2 (line 765).

```typescript
// frontend/src/lib/memory/memory-stream.ts
import { supabaseAdmin } from '../supabase';
import { getEmbedding, storeEmbedding } from './embeddings';
import type { MemoryNode } from '@/types/memory';

interface AddMemoryParams {
    type: MemoryNode['type'];
    description: string;
    poignancy: number;
    keywords: string[];
    subject?: string;
    predicate?: string;
    object?: string;
    evidence?: string[];
    depth?: number;
}

export async function addMemory(
    agentId: number,
    params: AddMemoryParams
): Promise<MemoryNode> {
    const embedding = await getEmbedding(params.description);
    const embeddingId = await storeEmbedding(agentId, params.description, embedding);

    const { data, error } = await supabaseAdmin
        .from('agent_memories')
        .insert({
            agent_id: agentId,
            type: params.type,
            depth: params.depth ?? (params.type === 'reflection' ? 1 : 0),
            description: params.description,
            subject: params.subject,
            predicate: params.predicate,
            object: params.object,
            poignancy: Math.min(10, Math.max(1, params.poignancy)),
            keywords: params.keywords,
            evidence: params.evidence ?? [],
            embedding_id: embeddingId,
        })
        .select()
        .single();

    if (error) throw new Error(`Failed to add memory: ${error.message}`);
    return data as MemoryNode;
}

export async function getRecentMemories(
    agentId: number,
    limit: number = 50
): Promise<MemoryNode[]> {
    const { data, error } = await supabaseAdmin
        .from('agent_memories')
        .select('*')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) throw new Error(`Failed to fetch memories: ${error.message}`);
    return (data ?? []) as MemoryNode[];
}

export async function touchMemory(memoryId: string): Promise<void> {
    await supabaseAdmin
        .from('agent_memories')
        .update({ last_accessed_at: new Date().toISOString() })
        .eq('id', memoryId);
}
```

**Step 3: Write 3-factor retrieval scoring**

Reference: `inspiration/generative_agents/reverie/backend_server/persona/cognitive_modules/retrieve.py` lines 199-271. The exact weights `gw = [0.5, 3, 2]` from line 244.

```typescript
// frontend/src/lib/memory/retrieval.ts
import { supabaseAdmin } from '../supabase';
import { getEmbedding, searchSimilarEmbeddings } from './embeddings';
import { getRecentMemories, touchMemory } from './memory-stream';
import type { MemoryNode, MemoryRetrievalOptions } from '@/types/memory';

const DEFAULT_OPTIONS: MemoryRetrievalOptions = {
    topK: 5,
    overfetch: 50,
    recencyWeight: 0.5,
    relevanceWeight: 3,
    importanceWeight: 2,
};

function cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function normalizeScores(scores: Map<string, number>): Map<string, number> {
    const values = Array.from(scores.values());
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    const normalized = new Map<string, number>();
    for (const [key, val] of scores) {
        normalized.set(key, range === 0 ? 0.5 : (val - min) / range);
    }
    return normalized;
}

function extractRecencyScores(nodes: MemoryNode[], decayFactor: number = 0.995): Map<string, number> {
    const now = Date.now();
    const scores = new Map<string, number>();
    for (const node of nodes) {
        const hoursSince = (now - new Date(node.last_accessed_at).getTime()) / 3_600_000;
        scores.set(node.id, Math.pow(decayFactor, hoursSince));
    }
    return scores;
}

function extractImportanceScores(nodes: MemoryNode[]): Map<string, number> {
    const scores = new Map<string, number>();
    for (const node of nodes) {
        scores.set(node.id, node.poignancy / 10);
    }
    return scores;
}

async function extractRelevanceScores(
    nodes: MemoryNode[],
    queryEmbedding: number[],
    agentId: number
): Promise<Map<string, number>> {
    const scores = new Map<string, number>();

    const embeddingIds = nodes
        .filter(n => n.embedding_id)
        .map(n => n.embedding_id!);

    if (embeddingIds.length === 0) {
        for (const node of nodes) scores.set(node.id, 0);
        return scores;
    }

    const { data: embeddings } = await supabaseAdmin
        .from('agent_memory_embeddings')
        .select('id, embedding')
        .in('id', embeddingIds);

    const embeddingMap = new Map<string, number[]>();
    for (const emb of embeddings ?? []) {
        const parsed = typeof emb.embedding === 'string'
            ? JSON.parse(emb.embedding)
            : emb.embedding;
        embeddingMap.set(emb.id, parsed);
    }

    for (const node of nodes) {
        if (node.embedding_id && embeddingMap.has(node.embedding_id)) {
            scores.set(node.id, cosineSimilarity(queryEmbedding, embeddingMap.get(node.embedding_id)!));
        } else {
            scores.set(node.id, 0);
        }
    }

    return scores;
}

export async function retrieveMemories(
    agentId: number,
    queryText: string,
    options?: Partial<MemoryRetrievalOptions>
): Promise<MemoryNode[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const nodes = await getRecentMemories(agentId, opts.overfetch);
    if (nodes.length === 0) return [];

    const queryEmbedding = await getEmbedding(queryText);

    const recencyRaw = extractRecencyScores(nodes);
    const importanceRaw = extractImportanceScores(nodes);
    const relevanceRaw = await extractRelevanceScores(nodes, queryEmbedding, agentId);

    const recency = normalizeScores(recencyRaw);
    const importance = normalizeScores(importanceRaw);
    const relevance = normalizeScores(relevanceRaw);

    const masterScores = new Map<string, number>();
    for (const node of nodes) {
        const score =
            (recency.get(node.id) ?? 0) * opts.recencyWeight +
            (relevance.get(node.id) ?? 0) * opts.relevanceWeight +
            (importance.get(node.id) ?? 0) * opts.importanceWeight;
        masterScores.set(node.id, score);
    }

    const sorted = nodes.sort((a, b) =>
        (masterScores.get(b.id) ?? 0) - (masterScores.get(a.id) ?? 0)
    );

    const topK = sorted.slice(0, opts.topK);

    for (const node of topK) {
        await touchMemory(node.id);
    }

    return topK;
}
```

**Step 4: Write reflection module**

Reference: `inspiration/generative_agents/reverie/backend_server/persona/cognitive_modules/reflect.py` lines 21-55. Focal point generation + insight synthesis. Reflection trigger at cumulative poignancy >= 150.

```typescript
// frontend/src/lib/memory/reflection.ts
import { supabaseAdmin } from '../supabase';
import { addMemory, getRecentMemories } from './memory-stream';
import { retrieveMemories } from './retrieval';
import type { AgentRecord } from '@/types/agent';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const POIGNANCY_THRESHOLD = 150;

async function generateFocalPoints(recentDescriptions: string[]): Promise<string[]> {
    const statements = recentDescriptions.slice(0, 20).join('\n');

    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            temperature: 0.7,
            messages: [
                {
                    role: 'system',
                    content: 'You are a DeFi trading agent reflecting on recent experiences. Given the statements below, identify 3 high-level questions or topics worth reflecting on. Return ONLY a JSON array of 3 strings.',
                },
                {
                    role: 'user',
                    content: `Recent experiences:\n${statements}\n\nWhat 3 high-level insights or questions arise from these?`,
                },
            ],
        }),
    });

    if (!res.ok) {
        return ['What patterns have I seen in my recent trades?',
                'What market conditions have been most favorable?',
                'What mistakes should I avoid repeating?'];
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '';

    try {
        return JSON.parse(content);
    } catch {
        return content.split('\n').filter((s: string) => s.trim()).slice(0, 3);
    }
}

async function generateInsight(
    focalPoint: string,
    evidenceDescriptions: string[]
): Promise<{ insight: string; poignancy: number }> {
    const statements = evidenceDescriptions
        .map((d, i) => `${i + 1}. ${d}`)
        .join('\n');

    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            temperature: 0.5,
            messages: [
                {
                    role: 'system',
                    content: 'You are a DeFi trading agent synthesizing insights from your experiences. Given evidence statements and a focal question, produce ONE concise insight (1-2 sentences). Also rate its importance 1-10. Return JSON: {"insight": "...", "poignancy": N}',
                },
                {
                    role: 'user',
                    content: `Focal question: ${focalPoint}\n\nEvidence:\n${statements}`,
                },
            ],
        }),
    });

    if (!res.ok) {
        return { insight: `Reflection on: ${focalPoint}`, poignancy: 5 };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '';

    try {
        return JSON.parse(content);
    } catch {
        return { insight: content.slice(0, 200), poignancy: 5 };
    }
}

export async function shouldReflect(agent: AgentRecord): boolean {
    return agent.poignancy_accumulator >= POIGNANCY_THRESHOLD;
}

export async function reflect(agent: AgentRecord): Promise<void> {
    const recentMemories = await getRecentMemories(agent.agent_id, 30);
    if (recentMemories.length < 5) return;

    const descriptions = recentMemories.map(m => m.description);
    const focalPoints = await generateFocalPoints(descriptions);

    for (const focalPoint of focalPoints) {
        const retrieved = await retrieveMemories(agent.agent_id, focalPoint, {
            topK: 10,
            overfetch: 30,
        });

        if (retrieved.length < 3) continue;

        const { insight, poignancy } = await generateInsight(
            focalPoint,
            retrieved.map(m => m.description)
        );

        await addMemory(agent.agent_id, {
            type: 'reflection',
            description: insight,
            poignancy,
            keywords: ['reflection', ...focalPoint.split(' ').slice(0, 3)],
            evidence: retrieved.map(m => m.id),
            depth: 1,
        });
    }

    await supabaseAdmin
        .from('agents')
        .update({ poignancy_accumulator: 0 })
        .eq('agent_id', agent.agent_id);
}
```

**Step 5: Create Supabase RPC for vector search**

Add a migration for the match_embeddings function:

```sql
-- Add to frontend/supabase/migrations/004_agent_memory_embeddings.sql (append)
-- Or create a new migration: frontend/supabase/migrations/009_match_embeddings_rpc.sql

CREATE OR REPLACE FUNCTION match_embeddings(
    query_embedding vector(1536),
    match_agent_id INTEGER,
    match_count INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    embedding_key TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ame.id,
        ame.embedding_key,
        1 - (ame.embedding <=> query_embedding) AS similarity
    FROM agent_memory_embeddings ame
    WHERE ame.agent_id = match_agent_id
    ORDER BY ame.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
```

Create this as a separate migration file: `frontend/supabase/migrations/009_match_embeddings_rpc.sql`

**Step 6: Commit**

```bash
git add frontend/src/lib/memory/ frontend/supabase/migrations/009_match_embeddings_rpc.sql
git commit -m "feat: add memory system — stream, 3-factor retrieval scoring, reflection engine"
```

---

### Task 5: Policy strategy engine

**Files:**
- Create: `frontend/src/lib/engine/policy-strategy.ts`

**Step 1: Write the policy strategy engine**

Reference: Design doc Section 2.3 (line 1009). Evaluates user-configured if/then rules against the current market context.

```typescript
// frontend/src/lib/engine/policy-strategy.ts
import type { StrategyEngine, AgentContext, AgentDecision } from '@/types/engine';
import type { AgentPolicy, PolicyRule } from '@/types/agent';

type ConditionContext = {
    'pool.apr': number;
    'pool.price': number;
    'pool.priceChange1h': number;
    'pool.priceChange24h': number;
    'pool.volume24h': number;
    'portfolio.totalValueUSD': number;
    'portfolio.unrealizedPnl': number;
    'portfolio.pnlPct': number;
    'holding.pct': number;
    'price.sETH': number;
    'price.sBTC': number;
    'price.sPOL': number;
    'price.sSOL': number;
    'price.SPRAWL': number;
    [key: string]: number | string;
};

function buildConditionContext(ctx: AgentContext): ConditionContext {
    const bestPool = ctx.market.pools.reduce((best, p) =>
        p.apr > (best?.apr ?? 0) ? p : best, ctx.market.pools[0]);

    const totalValue = ctx.portfolio.totalValueUSD;
    const pnlPct = totalValue > 0
        ? (ctx.portfolio.unrealizedPnl / totalValue) * 100
        : 0;

    return {
        'pool.apr': bestPool?.apr ?? 0,
        'pool.price': bestPool?.price ?? 0,
        'pool.priceChange1h': bestPool?.priceChange1h ?? 0,
        'pool.priceChange24h': bestPool?.priceChange24h ?? 0,
        'pool.volume24h': bestPool?.volume24h ?? 0,
        'portfolio.totalValueUSD': totalValue,
        'portfolio.unrealizedPnl': ctx.portfolio.unrealizedPnl,
        'portfolio.pnlPct': pnlPct,
        'holding.pct': 0,
        'price.sETH': ctx.market.prices.sETH ?? 0,
        'price.sBTC': ctx.market.prices.sBTC ?? 0,
        'price.sPOL': ctx.market.prices.sPOL ?? 0,
        'price.sSOL': ctx.market.prices.sSOL ?? 0,
        'price.SPRAWL': ctx.market.prices.SPRAWL ?? 0,
    };
}

function evaluateCondition(
    condition: PolicyRule['condition'],
    context: ConditionContext
): boolean {
    const fieldValue = context[condition.field];
    if (fieldValue === undefined) return false;

    const target = typeof condition.value === 'string'
        ? parseFloat(condition.value)
        : condition.value;

    const actual = typeof fieldValue === 'string'
        ? parseFloat(fieldValue)
        : fieldValue;

    switch (condition.operator) {
        case '>': return actual > target;
        case '<': return actual < target;
        case '==': return actual === target;
        case '!=': return actual !== target;
        default: return false;
    }
}

export class PolicyStrategy implements StrategyEngine {
    constructor(private policy: AgentPolicy) {}

    async decide(ctx: AgentContext): Promise<AgentDecision> {
        const conditionCtx = buildConditionContext(ctx);

        for (const rule of this.policy.rules) {
            if (evaluateCondition(rule.condition, conditionCtx)) {
                return {
                    action: rule.action as AgentDecision['action'],
                    protocol: rule.protocol,
                    params: { ...rule.params },
                    rationale: `Rule triggered: ${rule.name}`,
                };
            }
        }

        return {
            action: 'hold',
            protocol: '',
            params: {},
            rationale: 'No policy rule triggered',
        };
    }
}
```

**Step 2: Commit**

```bash
git add frontend/src/lib/engine/policy-strategy.ts
git commit -m "feat: add policy strategy engine — evaluates if/then rules against market context"
```

---

### Task 6: LLM strategy engine (DeepSeek v4 integration)

**Files:**
- Create: `frontend/src/lib/engine/llm-strategy.ts`
- Create: `frontend/src/lib/engine/context-composer.ts`
- Create: `frontend/src/lib/engine/tool-schemas.ts`

**Step 1: Write DeFi tool schemas for DeepSeek function calling**

Reference: `inspiration/signatory/frontend/src/lib/openai.ts` lines 110-143 for tool schema conversion. `inspiration/signatory/frontend/src/lib/openai.ts` lines 178-278 for DeepSeek streaming with tool calls.

```typescript
// frontend/src/lib/engine/tool-schemas.ts
export const DEFI_TOOL_SCHEMAS = [
    {
        type: 'function' as const,
        function: {
            name: 'swap',
            description: 'Swap one token for another on SprawlDEX. Use this when you want to buy or sell a token.',
            parameters: {
                type: 'object',
                properties: {
                    tokenIn: {
                        type: 'string',
                        description: 'Token to sell (sETH, sBTC, sUSDC, sPOL, sSOL, SPRAWL)',
                    },
                    tokenOut: {
                        type: 'string',
                        description: 'Token to buy (sETH, sBTC, sUSDC, sPOL, sSOL, SPRAWL)',
                    },
                    amountIn: {
                        type: 'string',
                        description: 'Amount of tokenIn to sell (in human-readable units, e.g. "0.5" for 0.5 sETH)',
                    },
                    maxSlippageBps: {
                        type: 'number',
                        description: 'Maximum slippage in basis points (e.g., 100 = 1%)',
                    },
                },
                required: ['tokenIn', 'tokenOut', 'amountIn'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'provideLiquidity',
            description: 'Add liquidity to a SprawlDEX pool to earn trading fees.',
            parameters: {
                type: 'object',
                properties: {
                    tokenA: { type: 'string', description: 'First token of the pair' },
                    tokenB: { type: 'string', description: 'Second token of the pair' },
                    amountA: { type: 'string', description: 'Amount of tokenA to provide' },
                    amountB: { type: 'string', description: 'Amount of tokenB to provide' },
                },
                required: ['tokenA', 'tokenB', 'amountA', 'amountB'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'removeLiquidity',
            description: 'Remove liquidity from a SprawlDEX pool.',
            parameters: {
                type: 'object',
                properties: {
                    tokenA: { type: 'string', description: 'First token of the pair' },
                    tokenB: { type: 'string', description: 'Second token of the pair' },
                    shares: { type: 'string', description: 'Number of LP shares to remove' },
                },
                required: ['tokenA', 'tokenB', 'shares'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'hold',
            description: 'Do nothing this tick. Use when market conditions are unclear or no good opportunities exist.',
            parameters: {
                type: 'object',
                properties: {
                    reason: { type: 'string', description: 'Brief reason for holding' },
                },
                required: ['reason'],
            },
        },
    },
];
```

**Step 2: Write the context composer**

Reference: Design doc Section 2.2 (lines 822-878) for the full context structure. ISS prompt header from `inspiration/generative_agents/reverie/backend_server/persona/memory_structures/scratch.py` lines 382-414.

```typescript
// frontend/src/lib/engine/context-composer.ts
import type { AgentContext } from '@/types/engine';

function formatUSD(n: number): string {
    return n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;
}

function formatPortfolio(holdings: Record<string, number>, prices: Record<string, number>): string {
    return Object.entries(holdings)
        .filter(([_, amount]) => amount > 0.001)
        .map(([token, amount]) => {
            const value = amount * (prices[token] ?? 0);
            return `  ${token}: ${amount.toFixed(4)} ($${value.toFixed(2)})`;
        })
        .join('\n');
}

export function buildSystemPrompt(ctx: AgentContext): string {
    return `You are ${ctx.iss.name}, a DeFi trading agent on SprawlDEX.
Persona: ${ctx.iss.persona}
Goal: ${ctx.iss.goal}
Constraints: ${ctx.iss.constraints}

You make trading decisions based on market data, your portfolio, memories, and learned skills.
ALWAYS use one of the provided tools to take action. If uncertain, use the "hold" tool.
Be concise in your rationale — 1-2 sentences max.`;
}

export function buildUserPrompt(ctx: AgentContext): string {
    const tradeHistory = ctx.recentTrades.length > 0
        ? ctx.recentTrades.map((t, i) =>
            `  ${i + 1}. ${t.time}: ${t.action} ${t.pair}, amount: ${t.amount}, P&L: ${formatUSD(t.pnl)} — "${t.rationale}"`
          ).join('\n')
        : '  No recent trades.';

    const memoriesStr = ctx.memories.length > 0
        ? ctx.memories.map((m, i) => `  - ${m}`).join('\n')
        : '  No relevant memories yet.';

    const skillsStr = ctx.skills.length > 0
        ? ctx.skills.map(s =>
            `  - ${s.name} (${(s.successRate * 100).toFixed(0)}% success): ${s.description}`
          ).join('\n')
        : '  No learned skills yet.';

    const poolsStr = ctx.market.pools
        .map(p =>
            `  ${p.name}: $${p.price.toFixed(2)} (${(p.priceChange1h * 100).toFixed(1)}% 1h) | Vol: $${p.volume24h.toFixed(0)} | TVL: $${p.tvl.toFixed(0)}`
        )
        .join('\n');

    return `PORTFOLIO:
${formatPortfolio(ctx.portfolio.holdings, ctx.market.prices)}
  Total: $${ctx.portfolio.totalValueUSD.toFixed(2)} | Unrealized P&L: ${formatUSD(ctx.portfolio.unrealizedPnl)} today
  $SPRAWL earned lifetime: ${ctx.portfolio.sprawlEarned}

RECENT TRADES:
${tradeHistory}

RELEVANT MEMORIES:
${memoriesStr}

LEARNED SKILLS:
${skillsStr}

MARKET:
${poolsStr}

Available actions: swap, provideLiquidity, removeLiquidity, hold
What is your next move?`;
}
```

**Step 3: Write the LLM strategy engine**

Reference: `inspiration/signatory/frontend/src/lib/openai.ts` lines 178-278 for the DeepSeek raw fetch + tool call accumulation pattern.

```typescript
// frontend/src/lib/engine/llm-strategy.ts
import type { StrategyEngine, AgentContext, AgentDecision } from '@/types/engine';
import { buildSystemPrompt, buildUserPrompt } from './context-composer';
import { DEFI_TOOL_SCHEMAS } from './tool-schemas';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_TIMEOUT_MS = 30_000;

export class LLMStrategy implements StrategyEngine {
    async decide(ctx: AgentContext): Promise<AgentDecision> {
        const systemPrompt = buildSystemPrompt(ctx);
        const userPrompt = buildUserPrompt(ctx);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);

        try {
            const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    temperature: 0.3,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    tools: DEFI_TOOL_SCHEMAS,
                    tool_choice: 'auto',
                }),
                signal: controller.signal,
            });

            if (!res.ok) {
                const err = await res.text();
                console.error(`[LLMStrategy] DeepSeek API error: ${res.status} - ${err}`);
                return fallbackDecision('DeepSeek API error');
            }

            const data = await res.json();
            const choice = data.choices?.[0];

            if (!choice) {
                return fallbackDecision('No choice returned');
            }

            if (choice.message?.tool_calls?.length > 0) {
                return parseToolCall(choice.message.tool_calls[0]);
            }

            if (choice.message?.content) {
                return parseTextResponse(choice.message.content);
            }

            return fallbackDecision('Empty response');
        } catch (err: any) {
            if (err.name === 'AbortError') {
                console.error('[LLMStrategy] DeepSeek request timed out');
                return fallbackDecision('Request timed out');
            }
            console.error(`[LLMStrategy] Error: ${err.message}`);
            return fallbackDecision(err.message);
        } finally {
            clearTimeout(timeout);
        }
    }
}

function parseToolCall(toolCall: any): AgentDecision {
    const name = toolCall.function?.name;
    let args: Record<string, any> = {};

    try {
        args = JSON.parse(toolCall.function?.arguments ?? '{}');
    } catch {
        args = {};
    }

    const validActions = ['swap', 'provideLiquidity', 'removeLiquidity', 'hold'];
    const action = validActions.includes(name) ? name : 'hold';

    return {
        action: action as AgentDecision['action'],
        protocol: 'SprawlDEX',
        params: args,
        rationale: args.reason ?? `LLM chose ${action}`,
    };
}

function parseTextResponse(content: string): AgentDecision {
    return {
        action: 'hold',
        protocol: '',
        params: {},
        rationale: content.slice(0, 200),
    };
}

function fallbackDecision(reason: string): AgentDecision {
    return {
        action: 'hold',
        protocol: '',
        params: {},
        rationale: `Fallback: ${reason}`,
    };
}
```

**Step 4: Commit**

```bash
git add frontend/src/lib/engine/llm-strategy.ts frontend/src/lib/engine/context-composer.ts frontend/src/lib/engine/tool-schemas.ts
git commit -m "feat: add LLM strategy engine with DeepSeek v4 tool calling + context composer"
```

---

### Task 7: Canned fallbacks for when DeepSeek is down

**Files:**
- Create: `frontend/src/lib/engine/canned-strategy.ts`

**Step 1: Write canned fallback strategies**

Reference: `inspiration/eth-open-agents/packages/pet-runtime/src/brain.ts` lines 106-150 — the fallback pattern where Sonnet cap triggers Haiku fallback. Same idea: when DeepSeek is unavailable, use simple heuristic-based decisions.

```typescript
// frontend/src/lib/engine/canned-strategy.ts
import type { StrategyEngine, AgentContext, AgentDecision } from '@/types/engine';

const CANNED_STRATEGIES: Record<string, (ctx: AgentContext) => AgentDecision> = {
    'momentum': (ctx) => {
        const ethPool = ctx.market.pools.find(p => p.tokenA === 'sETH');
        if (ethPool && ethPool.priceChange1h > 0.02) {
            const usdcBalance = ctx.portfolio.holdings.sUSDC ?? 0;
            if (usdcBalance > 100) {
                const amount = Math.min(usdcBalance * 0.2, 500);
                return {
                    action: 'swap',
                    protocol: 'SprawlDEX',
                    params: { tokenIn: 'sUSDC', tokenOut: 'sETH', amountIn: amount.toFixed(2), maxSlippageBps: 100 },
                    rationale: `Canned momentum: sETH up ${(ethPool.priceChange1h * 100).toFixed(1)}%, buying dip`,
                };
            }
        }
        return { action: 'hold', protocol: '', params: {}, rationale: 'Canned momentum: no signal' };
    },

    'mean_reversion': (ctx) => {
        for (const pool of ctx.market.pools) {
            if (pool.priceChange1h < -0.05) {
                const usdcBalance = ctx.portfolio.holdings.sUSDC ?? 0;
                if (usdcBalance > 100) {
                    const amount = Math.min(usdcBalance * 0.15, 300);
                    return {
                        action: 'swap',
                        protocol: 'SprawlDEX',
                        params: { tokenIn: 'sUSDC', tokenOut: pool.tokenA, amountIn: amount.toFixed(2), maxSlippageBps: 150 },
                        rationale: `Canned reversion: ${pool.tokenA} down ${(pool.priceChange1h * 100).toFixed(1)}%, buying`,
                    };
                }
            }
        }
        return { action: 'hold', protocol: '', params: {}, rationale: 'Canned reversion: no dip found' };
    },

    'conservative': (ctx) => {
        const bestPool = ctx.market.pools.reduce((best, p) =>
            p.apr > (best?.apr ?? 0) ? p : best, ctx.market.pools[0]);

        if (bestPool && bestPool.apr > 10) {
            const usdcBalance = ctx.portfolio.holdings.sUSDC ?? 0;
            const tokenBalance = ctx.portfolio.holdings[bestPool.tokenA] ?? 0;
            if (usdcBalance > 200 && tokenBalance > 0) {
                return {
                    action: 'provideLiquidity',
                    protocol: 'SprawlDEX',
                    params: {
                        tokenA: bestPool.tokenA,
                        tokenB: bestPool.tokenB,
                        amountA: (tokenBalance * 0.1).toFixed(4),
                        amountB: (usdcBalance * 0.1).toFixed(2),
                    },
                    rationale: `Canned conservative: ${bestPool.name} APR ${bestPool.apr.toFixed(1)}%`,
                };
            }
        }
        return { action: 'hold', protocol: '', params: {}, rationale: 'Canned conservative: no good pool' };
    },

    'balanced': (ctx) => {
        const totalValue = ctx.portfolio.totalValueUSD;
        const usdcPct = ((ctx.portfolio.holdings.sUSDC ?? 0) / totalValue) * 100;

        if (usdcPct > 60) {
            const bestMover = ctx.market.pools
                .filter(p => p.priceChange1h > 0)
                .sort((a, b) => b.priceChange1h - a.priceChange1h)[0];

            if (bestMover) {
                const amount = Math.min((ctx.portfolio.holdings.sUSDC ?? 0) * 0.1, 200);
                return {
                    action: 'swap',
                    protocol: 'SprawlDEX',
                    params: { tokenIn: 'sUSDC', tokenOut: bestMover.tokenA, amountIn: amount.toFixed(2), maxSlippageBps: 100 },
                    rationale: `Canned balanced: rebalancing, too much USDC (${usdcPct.toFixed(0)}%)`,
                };
            }
        }
        return { action: 'hold', protocol: '', params: {}, rationale: 'Canned balanced: portfolio balanced' };
    },

    'degen': (ctx) => {
        const bestMover = ctx.market.pools
            .sort((a, b) => Math.abs(b.priceChange1h) - Math.abs(a.priceChange1h))[0];

        if (bestMover && Math.abs(bestMover.priceChange1h) > 0.01) {
            const usdcBalance = ctx.portfolio.holdings.sUSDC ?? 0;
            if (usdcBalance > 50) {
                const amount = Math.min(usdcBalance * 0.3, 1000);
                return {
                    action: 'swap',
                    protocol: 'SprawlDEX',
                    params: { tokenIn: 'sUSDC', tokenOut: bestMover.tokenA, amountIn: amount.toFixed(2), maxSlippageBps: 200 },
                    rationale: `Canned degen: ${bestMover.tokenA} moving ${(bestMover.priceChange1h * 100).toFixed(1)}%, aping in`,
                };
            }
        }
        return { action: 'hold', protocol: '', params: {}, rationale: 'Canned degen: nothing moving' };
    },
};

export class CannedStrategy implements StrategyEngine {
    constructor(private strategyName: string) {}

    async decide(ctx: AgentContext): Promise<AgentDecision> {
        const fn = CANNED_STRATEGIES[this.strategyName] ?? CANNED_STRATEGIES['balanced'];
        return fn(ctx);
    }
}

export function getCannedStrategyNames(): string[] {
    return Object.keys(CANNED_STRATEGIES);
}
```

**Step 2: Commit**

```bash
git add frontend/src/lib/engine/canned-strategy.ts
git commit -m "feat: add canned fallback strategies for when DeepSeek is unavailable"
```

---

### Task 8: Guardrail layer

**Files:**
- Create: `frontend/src/lib/engine/guardrails.ts`

**Step 1: Write the guardrail layer**

Reference: `inspiration/byreal-agent-skills/src/core/confirm.ts` for the dry-run/confirm pattern with 3-mode execution gating. Design doc Section 2.3 (line 1050).

```typescript
// frontend/src/lib/engine/guardrails.ts
import type { AgentDecision, GuardrailConfig, ExecutionResult } from '@/types/engine';
import type { AgentRecord } from '@/types/agent';
import type { MarketSnapshot } from '@/types/market';
import { supabaseAdmin } from '../supabase';

const DEFAULT_CONFIG: GuardrailConfig = {
    maxPositionPct: 30,
    maxSlippageBps: 200,
    maxTxPerHour: 10,
    allowedProtocols: ['SprawlDEX'],
    dryRun: false,
};

interface TxRateTracker {
    counts: Map<number, { count: number; windowStart: number }>;
}

const rateTracker: TxRateTracker = { counts: new Map() };

function checkRateLimit(agentId: number, maxPerHour: number): boolean {
    const now = Date.now();
    const entry = rateTracker.counts.get(agentId);

    if (!entry || now - entry.windowStart > 3_600_000) {
        rateTracker.counts.set(agentId, { count: 1, windowStart: now });
        return true;
    }

    if (entry.count >= maxPerHour) return false;
    entry.count++;
    return true;
}

function calculateMinOutput(
    amountIn: number,
    price: number,
    maxSlippageBps: number
): string {
    const expectedOut = amountIn * price;
    const minOut = expectedOut * (1 - maxSlippageBps / 10_000);
    return minOut.toFixed(6);
}

export class GuardrailLayer {
    private config: GuardrailConfig;

    constructor(config?: Partial<GuardrailConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    async validate(
        decision: AgentDecision,
        agent: AgentRecord,
        market: MarketSnapshot
    ): Promise<{ valid: boolean; reason?: string; amended?: AgentDecision }> {
        if (decision.action === 'hold') {
            return { valid: true };
        }

        if (!this.config.allowedProtocols.includes(decision.protocol)) {
            return {
                valid: false,
                reason: `Protocol ${decision.protocol} not in allowlist: [${this.config.allowedProtocols.join(', ')}]`,
            };
        }

        if (!checkRateLimit(agent.agent_id, this.config.maxTxPerHour)) {
            return {
                valid: false,
                reason: `Rate limit exceeded: ${this.config.maxTxPerHour} tx/hour`,
            };
        }

        if (decision.action === 'swap' && decision.params.amountIn) {
            const amountIn = parseFloat(decision.params.amountIn);
            const tokenIn = decision.params.tokenIn;
            const portfolioValue = agent.last_portfolio_value / 1e18;
            const tokenPrice = market.prices[tokenIn] ?? 0;
            const positionValue = amountIn * tokenPrice;
            const positionPct = portfolioValue > 0
                ? (positionValue / portfolioValue) * 100
                : 100;

            if (positionPct > this.config.maxPositionPct) {
                return {
                    valid: false,
                    reason: `Position ${positionPct.toFixed(1)}% exceeds max ${this.config.maxPositionPct}%`,
                };
            }

            const tokenOut = decision.params.tokenOut;
            const outPrice = market.prices[tokenOut] ?? 0;
            const inPrice = market.prices[tokenIn] ?? 0;
            if (inPrice > 0 && outPrice > 0) {
                const slippageBps = decision.params.maxSlippageBps ?? this.config.maxSlippageBps;
                const effectiveSlippage = Math.min(slippageBps, this.config.maxSlippageBps);

                const amended = { ...decision };
                amended.params = { ...amended.params };
                amended.params.amountOutMin = calculateMinOutput(
                    amountIn,
                    inPrice / outPrice,
                    effectiveSlippage
                );
                amended.params.maxSlippageBps = effectiveSlippage;

                return { valid: true, amended };
            }
        }

        return { valid: true };
    }

    isDryRun(): boolean {
        return this.config.dryRun;
    }

    async logDryRun(decision: AgentDecision, agent: AgentRecord): Promise<void> {
        console.log(`[DRY RUN] Agent ${agent.agent_id}: ${decision.action} ${JSON.stringify(decision.params)} — ${decision.rationale}`);

        await supabaseAdmin.from('activity_feed').insert({
            event_type: 'dry_run',
            actor_id: agent.agent_id,
            metadata: { action: decision.action, params: decision.params, rationale: decision.rationale },
        });
    }
}
```

**Step 2: Commit**

```bash
git add frontend/src/lib/engine/guardrails.ts
git commit -m "feat: add guardrail layer — dry-run, position caps, slippage limits, rate limits"
```

---

### Task 9: On-chain execution

**Files:**
- Create: `frontend/src/lib/execution/executor.ts`
- Create: `frontend/src/lib/execution/wallet-manager.ts`

**Step 1: Write the wallet manager**

```typescript
// frontend/src/lib/execution/wallet-manager.ts
// NOTE: Master doc specifies thirdweb Engine for wallet creation, but we use
// ethers.Wallet.createRandom() directly for hackathon simplicity. Thirdweb gas
// sponsorship is handled at the spawn route level (Phase 5), not here.
import { ethers } from 'ethers';
import { getMantleSepoliaProvider } from '../ethers-provider';
import { supabaseAdmin } from '../supabase';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY ?? 'sprawl-dev-key-change-in-prod-32b';

// AES-256-GCM encryption (canonical — matches Phase 5 schema)
function encrypt(text: string): { encrypted: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const key = crypto.scrypSync(ENCRYPTION_KEY, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return { encrypted, iv: iv.toString('hex'), authTag };
}

function decrypt(encrypted: string, ivHex: string, authTagHex: string): string {
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scrypSync(ENCRYPTION_KEY, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

export async function createAgentWallet(agentId: number): Promise<{ address: string; wallet: ethers.Wallet }> {
    const wallet = ethers.Wallet.createRandom();
    const provider = getMantleSepoliaProvider();
    const connectedWallet = wallet.connect(provider);

    const { encrypted, iv, authTag } = encrypt(wallet.privateKey);
    await supabaseAdmin.from('agent_wallets').insert({
        agent_id: agentId,
        encrypted_private_key: encrypted,
        iv,
        auth_tag: authTag,
        wallet_address: wallet.address,
    });

    return { address: wallet.address, wallet: connectedWallet };
}

export async function getAgentWallet(agentId: number): Promise<ethers.Wallet> {
    const { data, error } = await supabaseAdmin
        .from('agent_wallets')
        .select('encrypted_private_key, iv, auth_tag')
        .eq('agent_id', agentId)
        .single();

    if (error || !data) throw new Error(`No wallet found for agent ${agentId}`);

    const privateKey = decrypt(data.encrypted_private_key, data.iv, data.auth_tag);
    const provider = getMantleSepoliaProvider();
    return new ethers.Wallet(privateKey, provider);
}
```

**Step 2: Write the on-chain executor**

Reference: `inspiration/signatory/frontend/src/lib/agent-actions.ts` for the swap execution pattern (ethers v5 server-side). `inspiration/signatory/frontend/src/lib/goat.ts` for the `exactInputSingle` swap pattern. Design doc Section 2.4 (line 1078).

```typescript
// frontend/src/lib/execution/executor.ts
import { ethers } from 'ethers';
import { CONTRACTS } from '../config';
import { SprawlDEXABI, CityStateABI, SprawlTokenABI } from '@/constants/abis';
import { withTxLock } from './tx-lock';
import { getAgentWallet } from './wallet-manager';
import { supabaseAdmin } from '../supabase';
import type { AgentDecision, ExecutionResult } from '@/types/engine';
import type { AgentRecord } from '@/types/agent';

export async function executeDecision(
    agent: AgentRecord,
    decision: AgentDecision,
    market: import('@/types/market').MarketSnapshot
): Promise<ExecutionResult> {
    switch (decision.action) {
        case 'swap':
            return executeSwap(agent, decision, market);
        case 'provideLiquidity':
            return executeAddLiquidity(agent, decision);
        case 'removeLiquidity':
            return executeRemoveLiquidity(agent, decision);
        case 'hold':
            return { txHash: '', success: true, amountIn: '0', amountOut: '0', realizedPnl: 0 };
        default:
            return { txHash: '', success: false, amountIn: '0', amountOut: '0', realizedPnl: 0, error: `Unknown action: ${decision.action}` };
    }
}

async function executeSwap(
    agent: AgentRecord,
    decision: AgentDecision,
    market: import('@/types/market').MarketSnapshot
): Promise<ExecutionResult> {
    return withTxLock(async () => {
        const wallet = await getAgentWallet(agent.agent_id);
        const dex = new ethers.Contract(CONTRACTS.SprawlDEX, SprawlDEXABI.abi, wallet);

        const tokenInAddress = CONTRACTS[decision.params.tokenIn as keyof typeof CONTRACTS];
        const tokenOutAddress = CONTRACTS[decision.params.tokenOut as keyof typeof CONTRACTS];

        if (!tokenInAddress || !tokenOutAddress) {
            return { txHash: '', success: false, amountIn: '0', amountOut: '0', realizedPnl: 0, error: 'Invalid token' };
        }

        const amountIn = ethers.utils.parseEther(decision.params.amountIn);
        const amountOutMin = decision.params.amountOutMin
            ? ethers.utils.parseEther(decision.params.amountOutMin)
            : ethers.BigNumber.from(0);

        const token = new ethers.Contract(tokenInAddress, SprawlTokenABI.abi, wallet);
        const allowance = await token.allowance(wallet.address, CONTRACTS.SprawlDEX);
        if (allowance.lt(amountIn)) {
            const approveTx = await token.approve(CONTRACTS.SprawlDEX, ethers.constants.MaxUint256);
            await approveTx.wait();
        }

        const tx = await dex.swap(tokenInAddress, tokenOutAddress, amountIn, amountOutMin);
        const receipt = await tx.wait();

        const swapEvent = receipt.events?.find((e: any) => e.event === 'Swap');
        const amountOut = swapEvent?.args?.amountOut ?? ethers.BigNumber.from(0);

        const inPrice = market.prices[decision.params.tokenIn] ?? 0;
        const outPrice = market.prices[decision.params.tokenOut] ?? 0;
        const inValue = parseFloat(ethers.utils.formatEther(amountIn)) * inPrice;
        const outValue = parseFloat(ethers.utils.formatEther(amountOut)) * outPrice;
        const realizedPnl = outValue - inValue;

        await recordOnChain(wallet, agent.agent_id, decision);

        await supabaseAdmin.from('activity_feed').insert({
            event_type: 'swap',
            actor_id: agent.agent_id,
            metadata: {
                tokenIn: decision.params.tokenIn,
                tokenOut: decision.params.tokenOut,
                amountIn: ethers.utils.formatEther(amountIn),
                amountOut: ethers.utils.formatEther(amountOut),
                pnl: realizedPnl,
                rationale: decision.rationale,
                tx_hash: receipt.transactionHash,
            },
        });

        return {
            txHash: receipt.transactionHash,
            success: true,
            amountIn: ethers.utils.formatEther(amountIn),
            amountOut: ethers.utils.formatEther(amountOut),
            realizedPnl,
        };
    });
}

async function executeAddLiquidity(
    agent: AgentRecord,
    decision: AgentDecision
): Promise<ExecutionResult> {
    return withTxLock(async () => {
        const wallet = await getAgentWallet(agent.agent_id);
        const dex = new ethers.Contract(CONTRACTS.SprawlDEX, SprawlDEXABI.abi, wallet);

        const tokenAAddress = CONTRACTS[decision.params.tokenA as keyof typeof CONTRACTS];
        const tokenBAddress = CONTRACTS[decision.params.tokenB as keyof typeof CONTRACTS];
        const amountA = ethers.utils.parseEther(decision.params.amountA);
        const amountB = ethers.utils.parseEther(decision.params.amountB);

        for (const [addr, amt] of [[tokenAAddress, amountA], [tokenBAddress, amountB]] as const) {
            const token = new ethers.Contract(addr, SprawlTokenABI.abi, wallet);
            const allowance = await token.allowance(wallet.address, CONTRACTS.SprawlDEX);
            if (allowance.lt(amt)) {
                const approveTx = await token.approve(CONTRACTS.SprawlDEX, ethers.constants.MaxUint256);
                await approveTx.wait();
            }
        }

        const tx = await dex.addLiquidity(tokenAAddress, tokenBAddress, amountA, amountB);
        const receipt = await tx.wait();

        await recordOnChain(wallet, agent.agent_id, decision);

        return {
            txHash: receipt.transactionHash,
            success: true,
            amountIn: ethers.utils.formatEther(amountA),
            amountOut: ethers.utils.formatEther(amountB),
            realizedPnl: 0,
        };
    });
}

async function executeRemoveLiquidity(
    agent: AgentRecord,
    decision: AgentDecision
): Promise<ExecutionResult> {
    return withTxLock(async () => {
        const wallet = await getAgentWallet(agent.agent_id);
        const dex = new ethers.Contract(CONTRACTS.SprawlDEX, SprawlDEXABI.abi, wallet);

        const tokenAAddress = CONTRACTS[decision.params.tokenA as keyof typeof CONTRACTS];
        const tokenBAddress = CONTRACTS[decision.params.tokenB as keyof typeof CONTRACTS];
        const shares = ethers.utils.parseEther(decision.params.shares);

        const tx = await dex.removeLiquidity(tokenAAddress, tokenBAddress, shares);
        const receipt = await tx.wait();

        await recordOnChain(wallet, agent.agent_id, decision);

        return {
            txHash: receipt.transactionHash,
            success: true,
            amountIn: ethers.utils.formatEther(shares),
            amountOut: '0',
            realizedPnl: 0,
        };
    });
}

async function recordOnChain(
    wallet: ethers.Wallet,
    agentId: number,
    decision: AgentDecision
): Promise<void> {
    try {
        const cityState = new ethers.Contract(CONTRACTS.CityState, CityStateABI.abi, wallet);
        const encodedParams = ethers.utils.defaultAbiCoder.encode(
            ['string'],
            [JSON.stringify(decision.params)]
        );
        await cityState.recordDecision(
            agentId,
            decision.action,
            decision.protocol,
            encodedParams
        );
    } catch (err: any) {
        console.error(`[Executor] Failed to record decision on-chain: ${err.message}`);
    }
}
```

**Step 3: Commit**

```bash
git add frontend/src/lib/execution/executor.ts frontend/src/lib/execution/wallet-manager.ts
git commit -m "feat: add on-chain executor — swap, LP, CityState recording with tx-lock"
```

---

### Task 10: Agent tick loop engine

**Files:**
- Create: `frontend/src/lib/engine/tick-loop.ts`
- Create: `frontend/src/lib/engine/agent-tick.ts`

**Step 1: Write the per-agent tick function**

Reference: Design doc Section 2.2 (lines 744-931) for the full perceive-memorize-reflect-retrieve-decide-execute-record-learn flow. `inspiration/ai-town/convex/engine/abstractGame.ts` lines 22-75 for the runStep inner loop pattern. `inspiration/generative_agents/reverie/backend_server/persona/persona.py` line 185 for the `move()` cognitive loop.

```typescript
// frontend/src/lib/engine/agent-tick.ts
import { supabaseAdmin } from '../supabase';
import { readPortfolio, calculatePortfolioValue, getLargestHolding } from './market-reader';
import { addMemory } from '../memory/memory-stream';
import { retrieveMemories } from '../memory/retrieval';
import { shouldReflect, reflect } from '../memory/reflection';
import { PolicyStrategy } from './policy-strategy';
import { LLMStrategy } from './llm-strategy';
import { CannedStrategy } from './canned-strategy';
import { GuardrailLayer } from './guardrails';
import { executeDecision } from '../execution/executor';
import { skillManager } from '../skills/skill-manager';
import type { AgentRecord } from '@/types/agent';
import type { MarketSnapshot } from '@/types/market';
import type { AgentContext, StrategyEngine, AgentDecision } from '@/types/engine';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

function formatUSD(n: number): string {
    return n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;
}

function selectStrategy(agent: AgentRecord): StrategyEngine {
    switch (agent.strategy_type) {
        case 0: {
            const presetName = agent.policy_config?.presetName ?? 'balanced';
            return new CannedStrategy(presetName);
        }
        case 1:
            return new PolicyStrategy(agent.policy_config as any);
        case 2: {
            if (!DEEPSEEK_API_KEY) {
                console.warn(`[AgentTick] No DeepSeek key, falling back to canned for agent ${agent.agent_id}`);
                return new CannedStrategy('balanced');
            }
            return new LLMStrategy();
        }
        default:
            return new CannedStrategy('balanced');
    }
}

export async function agentTick(agent: AgentRecord, market: MarketSnapshot): Promise<void> {
    const startTime = Date.now();

    // ── STEP 1: PERCEIVE ──────────────────────────────────
    const portfolio = await readPortfolio(agent.wallet_address);
    const portfolioValueUSD = calculatePortfolioValue(portfolio, market.prices);
    const lastValue = agent.last_portfolio_value / 1e18;
    const unrealizedPnl = portfolioValueUSD - lastValue;

    const { data: recentTrades } = await supabaseAdmin
        .from('trade_history')
        .select('*')
        .eq('agent_id', agent.agent_id)
        .order('created_at', { ascending: false })
        .limit(10);

    // ── STEP 2: MEMORIZE ──────────────────────────────────
    let newPoignancy = 0;

    if (lastValue > 0 && Math.abs(unrealizedPnl / lastValue) > 0.02) {
        const largestHolding = getLargestHolding(portfolio, market.prices);
        const mem = await addMemory(agent.agent_id, {
            type: 'event',
            description: `Portfolio is ${unrealizedPnl > 0 ? 'up' : 'down'} ${formatUSD(unrealizedPnl)} (${(unrealizedPnl / lastValue * 100).toFixed(1)}%) since last settlement. Current value: $${portfolioValueUSD.toFixed(2)}. Largest position: ${largestHolding.token} (${largestHolding.pct}%)`,
            poignancy: Math.min(10, Math.ceil(Math.abs(unrealizedPnl) / 100)),
            keywords: ['portfolio', 'pnl', unrealizedPnl > 0 ? 'profit' : 'loss'],
        });
        newPoignancy += mem.poignancy;
    }

    for (const pool of market.pools) {
        if (Math.abs(pool.priceChange1h) > 0.05) {
            const mem = await addMemory(agent.agent_id, {
                type: 'event',
                description: `${pool.name} price moved ${(pool.priceChange1h * 100).toFixed(1)}% in the last hour. Current price: $${pool.price.toFixed(2)}`,
                poignancy: Math.min(8, Math.ceil(Math.abs(pool.priceChange1h) * 40)),
                keywords: ['market', pool.tokenA, pool.tokenB, pool.priceChange1h > 0 ? 'pump' : 'dump'],
            });
            newPoignancy += mem.poignancy;
        }
    }

    // ── STEP 3: REFLECT ───────────────────────────────────
    const updatedAgent = { ...agent, poignancy_accumulator: agent.poignancy_accumulator + newPoignancy };

    if (await shouldReflect(updatedAgent)) {
        await reflect(updatedAgent);
    } else {
        await supabaseAdmin
            .from('agents')
            .update({ poignancy_accumulator: updatedAgent.poignancy_accumulator })
            .eq('agent_id', agent.agent_id);
    }

    // ── STEP 4: RETRIEVE MEMORIES ─────────────────────────
    const queryText = `Current market: ${Object.entries(market.prices).map(([t, p]) => `${t}=$${p.toFixed(2)}`).join(', ')}. My portfolio: $${portfolioValueUSD.toFixed(2)}. Unrealized P&L: ${formatUSD(unrealizedPnl)}.`;

    const relevantMemories = await retrieveMemories(agent.agent_id, queryText, {
        topK: 5, overfetch: 50,
    });

    // ── STEP 5: RETRIEVE SKILLS ───────────────────────────
    const relevantSkills = await skillManager.retrieveSkills(agent.agent_id, queryText, 3);

    // ── STEP 6: COMPOSE CONTEXT ───────────────────────────
    const ctx: AgentContext = {
        iss: {
            name: agent.name ?? `Agent-${agent.agent_id}`,
            persona: agent.persona ?? 'A balanced DeFi trading agent',
            strategy_type: agent.strategy_type as 0 | 1 | 2,
            goal: 'Maximize $SPRAWL earnings through profitable DeFi trading on SprawlDEX',
            constraints: `Max position: ${agent.policy_config?.maxPositionSize ?? 30}% of portfolio. Max slippage: ${agent.policy_config?.maxSlippageBps ?? 200}bps.`,
        },
        portfolio: {
            holdings: portfolio,
            totalValueUSD: portfolioValueUSD,
            unrealizedPnl,
            sprawlEarned: agent.sprawl_lifetime_earned,
            sprawlBalance: portfolio.SPRAWL ?? 0,
        },
        recentTrades: (recentTrades ?? []).map(t => ({
            action: t.action,
            pair: `${t.token_in}/${t.token_out}`,
            amount: t.amount_in,
            pnl: t.pnl_realized,
            rationale: t.rationale ?? '',
            time: t.created_at,
        })),
        market: {
            prices: market.prices,
            pools: market.pools,
        },
        memories: relevantMemories.map(m => m.description),
        skills: relevantSkills.map(s => ({
            name: s.name,
            description: s.description,
            successRate: s.success_rate,
        })),
        policyRules: agent.policy_config?.rules ?? [],
    };

    // ── STEP 7: DECIDE ────────────────────────────────────
    const strategy = selectStrategy(agent);
    const decision = await strategy.decide(ctx);

    // ── STEP 8: GUARDRAILS ────────────────────────────────
    const guardrails = new GuardrailLayer({
        maxPositionPct: agent.policy_config?.maxPositionSize ?? 30,
        maxSlippageBps: agent.policy_config?.maxSlippageBps ?? 200,
        maxTxPerHour: 10,
        allowedProtocols: agent.policy_config?.allowedProtocols ?? ['SprawlDEX'],
        dryRun: false,
    });

    const validation = await guardrails.validate(decision, agent, market);

    if (!validation.valid) {
        console.log(`[AgentTick] Agent ${agent.agent_id} decision blocked: ${validation.reason}`);
        await addMemory(agent.agent_id, {
            type: 'event',
            description: `Attempted ${decision.action} but blocked by guardrails: ${validation.reason}`,
            poignancy: 3,
            keywords: ['guardrail', 'blocked', decision.action],
        });
        return;
    }

    const finalDecision = validation.amended ?? decision;

    if (finalDecision.action === 'hold') {
        console.log(`[AgentTick] Agent ${agent.agent_id} holding: ${finalDecision.rationale}`);
        return;
    }

    // ── STEP 9: EXECUTE ───────────────────────────────────
    const result = await executeDecision(agent, finalDecision, market);

    if (!result.success) {
        console.error(`[AgentTick] Agent ${agent.agent_id} execution failed: ${result.error}`);
        return;
    }

    // ── STEP 10: RECORD ───────────────────────────────────
    await supabaseAdmin.from('trade_history').insert({
        agent_id: agent.agent_id,
        action: finalDecision.action,
        token_in: finalDecision.params.tokenIn ?? finalDecision.params.tokenA,
        token_out: finalDecision.params.tokenOut ?? finalDecision.params.tokenB,
        amount_in: parseFloat(result.amountIn) * 1e18,
        amount_out: parseFloat(result.amountOut) * 1e18,
        price_at_trade: market.prices[finalDecision.params.tokenIn ?? ''] ?? 0,
        pnl_realized: result.realizedPnl,
        tx_hash: result.txHash,
        rationale: finalDecision.rationale,
    });

    await addMemory(agent.agent_id, {
        type: 'trade',
        description: `Executed ${finalDecision.action}: ${finalDecision.params.tokenIn ?? finalDecision.params.tokenA} -> ${finalDecision.params.tokenOut ?? finalDecision.params.tokenB}, amount: ${result.amountIn}, received: ${result.amountOut}, P&L: ${formatUSD(result.realizedPnl)}. Rationale: ${finalDecision.rationale}`,
        poignancy: Math.min(9, 3 + Math.ceil(Math.abs(result.realizedPnl) / 50)),
        keywords: ['trade', finalDecision.action, finalDecision.params.tokenIn, finalDecision.params.tokenOut, result.realizedPnl > 0 ? 'profit' : 'loss'].filter(Boolean) as string[],
    });

    await supabaseAdmin
        .from('agents')
        .update({
            last_action_at: new Date().toISOString(),
            recent_actions: agent.recent_actions + 1,
        })
        .eq('agent_id', agent.agent_id);

    // ── STEP 11: LEARN (Voyager critic pattern) ───────────
    if (result.realizedPnl > 0 && agent.strategy_type === 2) {
        await skillManager.maybeLearnSkill(agent.agent_id, finalDecision, result);
    }

    console.log(`[AgentTick] Agent ${agent.agent_id} completed in ${Date.now() - startTime}ms: ${finalDecision.action} (${formatUSD(result.realizedPnl)})`);
}
```

**Step 2: Write the tick loop**

Reference: `inspiration/ai-town/convex/aiTown/main.ts` lines 89-116 for the outer step loop with `while (now < deadline)`. `inspiration/clan-world/packages/runner/src/tickLoop.ts` lines 73-80 for the `while (!signal.aborted)` pattern with `pollChainTick` and `settleLatch`.

```typescript
// frontend/src/lib/engine/tick-loop.ts
// Uses the clan-world SettleLatch pattern: the next tick cannot start until the
// current tick has fully settled (all agents processed). This prevents overlap
// when a tick takes longer than the interval.
import { supabaseAdmin } from '../supabase';
import { readMarketContext } from './market-reader';
import { agentTick } from './agent-tick';
import type { AgentRecord } from '@/types/agent';

const TICK_INTERVAL_MS = 60_000;
const MAX_AGENTS_PER_TICK = 50;

// SettleLatch — resolves when the current tick is fully processed.
// Prevents the next tick from firing until all agents in the current tick finish.
function createSettleLatch() {
    let resolve: () => void;
    const promise = new Promise<void>((r) => { resolve = r; });
    return { promise, settle: () => resolve() };
}

interface TickLoopConfig {
    signal: AbortSignal;
    tickIntervalMs?: number;
    maxAgentsPerTick?: number;
}

export async function tickLoop(config: TickLoopConfig): Promise<void> {
    const interval = config.tickIntervalMs ?? TICK_INTERVAL_MS;
    const maxAgents = config.maxAgentsPerTick ?? MAX_AGENTS_PER_TICK;

    console.log(`[TickLoop] Starting tick loop (interval: ${interval}ms, max agents: ${maxAgents})`);

    let tickNumber = 0;

    while (!config.signal.aborted) {
        tickNumber++;
        const tickStart = Date.now();
        const latch = createSettleLatch();

        try {
            const market = await readMarketContext();

            const { data: agents, error } = await supabaseAdmin
                .from('agents')
                .select('*')
                .order('last_action_at', { ascending: true, nullsFirst: true })
                .limit(maxAgents);

            if (error) {
                console.error(`[TickLoop] Failed to load agents: ${error.message}`);
                latch.settle();
                await sleep(interval, config.signal);
                continue;
            }

            if (!agents || agents.length === 0) {
                console.log(`[TickLoop] No agents to process (tick #${tickNumber})`);
                latch.settle();
                await sleep(interval, config.signal);
                continue;
            }

            console.log(`[TickLoop] Tick #${tickNumber}: processing ${agents.length} agents`);

            const results = await Promise.allSettled(
                (agents as AgentRecord[]).map(agent =>
                    agentTick(agent, market).catch(err => {
                        console.error(`[TickLoop] Agent ${agent.agent_id} failed: ${err.message}`);
                    })
                )
            );

            const succeeded = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            const elapsed = Date.now() - tickStart;

            console.log(`[TickLoop] Tick #${tickNumber} complete: ${succeeded} ok, ${failed} failed, ${elapsed}ms`);
        } catch (err: any) {
            console.error(`[TickLoop] Tick #${tickNumber} error: ${err.message}`);
        } finally {
            // Always settle the latch so we never deadlock
            latch.settle();
        }

        // Wait for latch to confirm all processing is done before scheduling next tick
        await latch.promise;

        const elapsed = Date.now() - tickStart;
        const sleepTime = Math.max(0, interval - elapsed);
        await sleep(sleepTime, config.signal);
    }

    console.log('[TickLoop] Shut down');
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        if (signal.aborted) { resolve(); return; }
        const timer = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve();
        }, { once: true });
    });
}
```

**Step 3: Commit**

```bash
git add frontend/src/lib/engine/tick-loop.ts frontend/src/lib/engine/agent-tick.ts
git commit -m "feat: add agent tick loop engine — perceive, memorize, reflect, decide, execute"
```

---

### Task 11: Skill manager (Voyager pattern)

**Files:**
- Create: `frontend/src/lib/skills/skill-manager.ts`

**Step 1: Write the skill manager**

Reference: `inspiration/Voyager/voyager/agents/skill.py` lines 61-127 for `add_new_skill`, `retrieve_skills` with vector DB. `inspiration/Voyager/voyager/agents/critic.py` for the critic evaluation before persisting.

```typescript
// frontend/src/lib/skills/skill-manager.ts
import { supabaseAdmin } from '../supabase';
import { getEmbedding, storeEmbedding, searchSimilarEmbeddings } from '../memory/embeddings';
import type { SkillRecord } from '@/types/memory';
import type { AgentDecision, ExecutionResult } from '@/types/engine';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const MIN_PNL_FOR_SKILL = 10;

async function generateSkillDescription(decision: AgentDecision, result: ExecutionResult): Promise<string> {
    if (!DEEPSEEK_API_KEY) {
        return `${decision.action} strategy: ${decision.rationale}. P&L: $${result.realizedPnl.toFixed(2)}`;
    }

    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            temperature: 0.3,
            messages: [
                {
                    role: 'system',
                    content: 'You are a DeFi trading strategy documenter. Given a trade decision and its outcome, write a concise 1-2 sentence description of the strategy that can be reused. Focus on WHEN to use it and WHY it works.',
                },
                {
                    role: 'user',
                    content: `Action: ${decision.action}\nParams: ${JSON.stringify(decision.params)}\nRationale: ${decision.rationale}\nResult: amountIn=${result.amountIn}, amountOut=${result.amountOut}, P&L=$${result.realizedPnl.toFixed(2)}`,
                },
            ],
        }),
    });

    if (!res.ok) {
        return `${decision.action} strategy: ${decision.rationale}`;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? decision.rationale;
}

function generateSkillName(decision: AgentDecision): string {
    const action = decision.action;
    const token = decision.params.tokenIn ?? decision.params.tokenA ?? 'unknown';
    const timestamp = Date.now().toString(36);
    return `${action}_${token.toLowerCase()}_${timestamp}`;
}

class SkillManager {
    async maybeLearnSkill(
        agentId: number,
        decision: AgentDecision,
        result: ExecutionResult
    ): Promise<void> {
        if (result.realizedPnl < MIN_PNL_FOR_SKILL) return;

        const description = await generateSkillDescription(decision, result);
        const skillName = generateSkillName(decision);

        const embedding = await getEmbedding(description);
        const embeddingId = await storeEmbedding(agentId, description, embedding);

        const { data: existing } = await supabaseAdmin
            .from('agent_skills')
            .select('id, times_used, avg_pnl, success_rate, version')
            .eq('agent_id', agentId)
            .eq('name', skillName)
            .single();

        if (existing) {
            const newTimesUsed = existing.times_used + 1;
            const newAvgPnl = (existing.avg_pnl * existing.times_used + result.realizedPnl) / newTimesUsed;
            const newSuccessRate = result.realizedPnl > 0
                ? (existing.success_rate * existing.times_used + 1) / newTimesUsed
                : (existing.success_rate * existing.times_used) / newTimesUsed;

            await supabaseAdmin
                .from('agent_skills')
                .update({
                    times_used: newTimesUsed,
                    avg_pnl: newAvgPnl,
                    success_rate: newSuccessRate,
                    version: existing.version + 1,
                    embedding_id: embeddingId,
                })
                .eq('id', existing.id);
        } else {
            await supabaseAdmin.from('agent_skills').insert({
                agent_id: agentId,
                name: skillName,
                code: JSON.stringify(decision.params),
                description,
                embedding_id: embeddingId,
                success_rate: 1,
                avg_pnl: result.realizedPnl,
                times_used: 1,
            });
        }

        console.log(`[SkillManager] Agent ${agentId} learned skill: ${skillName}`);
    }

    async retrieveSkills(
        agentId: number,
        queryText: string,
        topK: number = 3
    ): Promise<SkillRecord[]> {
        const { data: skills } = await supabaseAdmin
            .from('agent_skills')
            .select('*')
            .eq('agent_id', agentId);

        if (!skills || skills.length === 0) return [];

        const embeddingIds = skills
            .filter(s => s.embedding_id)
            .map(s => s.embedding_id);

        if (embeddingIds.length === 0) {
            return (skills as SkillRecord[]).slice(0, topK);
        }

        try {
            const queryEmbedding = await getEmbedding(queryText);
            const similar = await searchSimilarEmbeddings(agentId, queryEmbedding, topK * 2);

            const similarIds = new Set(similar.map(s => s.id));
            const ranked = skills
                .filter(s => s.embedding_id && similarIds.has(s.embedding_id))
                .sort((a, b) => (b.success_rate * b.avg_pnl) - (a.success_rate * a.avg_pnl));

            return (ranked.slice(0, topK)) as SkillRecord[];
        } catch {
            return (skills as SkillRecord[])
                .sort((a, b) => b.success_rate - a.success_rate)
                .slice(0, topK);
        }
    }
}

export const skillManager = new SkillManager();
```

**Step 2: Commit**

```bash
git add frontend/src/lib/skills/skill-manager.ts
git commit -m "feat: add Voyager-pattern skill manager — learn from profitable trades, vector retrieval"
```

---

### Task 12: Market maker bot (CoinGecko price feed)

**Files:**
- Create: `frontend/src/lib/market-maker/price-feed.ts`
- Create: `frontend/src/lib/market-maker/arb-bot.ts`

**Step 1: Write the CoinGecko price feed**

```typescript
// frontend/src/lib/market-maker/price-feed.ts
import type { CoinGeckoPrice } from '@/types/market';

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const COINGECKO_IDS: Record<string, string> = {
    sETH: 'ethereum',
    sBTC: 'bitcoin',
    sPOL: 'matic-network',
    sSOL: 'solana',
};

let priceCache: Record<string, CoinGeckoPrice> = {};
let lastFetch = 0;
const CACHE_TTL_MS = 30_000;

export async function fetchRealPrices(): Promise<Record<string, CoinGeckoPrice>> {
    const now = Date.now();
    if (now - lastFetch < CACHE_TTL_MS && Object.keys(priceCache).length > 0) {
        return priceCache;
    }

    const ids = Object.values(COINGECKO_IDS).join(',');

    try {
        const res = await fetch(
            `${COINGECKO_API}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
            {
                headers: {
                    'Accept': 'application/json',
                    ...(process.env.COINGECKO_API_KEY
                        ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY }
                        : {}),
                },
            }
        );

        if (!res.ok) {
            console.error(`[PriceFeed] CoinGecko error: ${res.status}`);
            return priceCache;
        }

        const data = await res.json();
        const prices: Record<string, CoinGeckoPrice> = {};

        for (const [symbol, geckoId] of Object.entries(COINGECKO_IDS)) {
            const entry = data[geckoId];
            if (entry) {
                prices[symbol] = {
                    usd: entry.usd,
                    usd_24h_change: entry.usd_24h_change ?? 0,
                };
            }
        }

        prices.SPRAWL = { usd: 1.0, usd_24h_change: 0 };
        prices.sUSDC = { usd: 1.0, usd_24h_change: 0 };

        priceCache = prices;
        lastFetch = now;
        return prices;
    } catch (err: any) {
        console.error(`[PriceFeed] Fetch failed: ${err.message}`);
        return priceCache;
    }
}
```

**Step 2: Write the arb bot**

This reads CoinGecko real prices, compares them with SprawlDEX on-chain prices, and executes arb trades when spreads exceed a threshold — keeping SprawlDEX prices aligned with real markets.

```typescript
// frontend/src/lib/market-maker/arb-bot.ts
import { ethers } from 'ethers';
import { getMantleSepoliaProvider, getDeployerWallet } from '../ethers-provider';
import { CONTRACTS } from '../config';
import { SprawlDEXABI, SprawlTokenABI } from '@/constants/abis';
import { fetchRealPrices } from './price-feed';
import { withTxLock } from '../execution/tx-lock';

const ARB_THRESHOLD_PCT = 2.0;
const TRADE_SIZE_USDC = 500;
const MAX_SLIPPAGE_BPS = 200;

const TOKEN_ADDRESSES: Record<string, string> = {
    sETH: CONTRACTS.sETH,
    sBTC: CONTRACTS.sBTC,
    sPOL: CONTRACTS.sPOL,
    sSOL: CONTRACTS.sSOL,
    SPRAWL: CONTRACTS.SPRAWL,
};

interface ArbOpportunity {
    token: string;
    dexPrice: number;
    realPrice: number;
    spreadPct: number;
    direction: 'buy' | 'sell';
}

async function findArbOpportunities(): Promise<ArbOpportunity[]> {
    const provider = getMantleSepoliaProvider();
    const dex = new ethers.Contract(CONTRACTS.SprawlDEX, SprawlDEXABI.abi, provider);
    const realPrices = await fetchRealPrices();

    const opportunities: ArbOpportunity[] = [];

    for (const [symbol, address] of Object.entries(TOKEN_ADDRESSES)) {
        if (symbol === 'SPRAWL') continue;

        const realPrice = realPrices[symbol]?.usd;
        if (!realPrice) continue;

        try {
            const priceRaw = await dex.getPrice(address, CONTRACTS.sUSDC);
            const dexPrice = parseFloat(ethers.utils.formatEther(priceRaw));

            const spreadPct = ((dexPrice - realPrice) / realPrice) * 100;

            if (Math.abs(spreadPct) > ARB_THRESHOLD_PCT) {
                opportunities.push({
                    token: symbol,
                    dexPrice,
                    realPrice,
                    spreadPct,
                    direction: spreadPct > 0 ? 'sell' : 'buy',
                });
            }
        } catch (err: any) {
            console.error(`[ArbBot] Failed to get DEX price for ${symbol}: ${err.message}`);
        }
    }

    return opportunities.sort((a, b) => Math.abs(b.spreadPct) - Math.abs(a.spreadPct));
}

async function executeArb(opp: ArbOpportunity): Promise<string | null> {
    return withTxLock(async () => {
        const wallet = getDeployerWallet();
        const dex = new ethers.Contract(CONTRACTS.SprawlDEX, SprawlDEXABI.abi, wallet);

        const tokenAddress = TOKEN_ADDRESSES[opp.token];
        const usdcAddress = CONTRACTS.sUSDC;

        if (opp.direction === 'buy') {
            const amountIn = ethers.utils.parseEther(TRADE_SIZE_USDC.toString());
            const expectedOut = TRADE_SIZE_USDC / opp.dexPrice;
            const minOut = ethers.utils.parseEther(
                (expectedOut * (1 - MAX_SLIPPAGE_BPS / 10000)).toFixed(18)
            );

            const usdcToken = new ethers.Contract(usdcAddress, SprawlTokenABI.abi, wallet);
            const allowance = await usdcToken.allowance(wallet.address, CONTRACTS.SprawlDEX);
            if (allowance.lt(amountIn)) {
                const tx = await usdcToken.approve(CONTRACTS.SprawlDEX, ethers.constants.MaxUint256);
                await tx.wait();
            }

            const tx = await dex.swap(usdcAddress, tokenAddress, amountIn, minOut);
            const receipt = await tx.wait();
            return receipt.transactionHash;
        } else {
            const amountToken = TRADE_SIZE_USDC / opp.dexPrice;
            const amountIn = ethers.utils.parseEther(amountToken.toFixed(18));
            const expectedOut = amountToken * opp.dexPrice;
            const minOut = ethers.utils.parseEther(
                (expectedOut * (1 - MAX_SLIPPAGE_BPS / 10000)).toFixed(18)
            );

            const token = new ethers.Contract(tokenAddress, SprawlTokenABI.abi, wallet);
            const allowance = await token.allowance(wallet.address, CONTRACTS.SprawlDEX);
            if (allowance.lt(amountIn)) {
                const tx = await token.approve(CONTRACTS.SprawlDEX, ethers.constants.MaxUint256);
                await tx.wait();
            }

            const tx = await dex.swap(tokenAddress, usdcAddress, amountIn, minOut);
            const receipt = await tx.wait();
            return receipt.transactionHash;
        }
    });
}

export async function runArbCycle(): Promise<void> {
    const opportunities = await findArbOpportunities();

    if (opportunities.length === 0) {
        return;
    }

    console.log(`[ArbBot] Found ${opportunities.length} arb opportunities`);

    for (const opp of opportunities.slice(0, 3)) {
        console.log(`[ArbBot] ${opp.direction} ${opp.token}: DEX=$${opp.dexPrice.toFixed(2)}, Real=$${opp.realPrice.toFixed(2)}, Spread=${opp.spreadPct.toFixed(2)}%`);

        try {
            const txHash = await executeArb(opp);
            if (txHash) {
                console.log(`[ArbBot] Arb executed: ${txHash}`);
            }
        } catch (err: any) {
            console.error(`[ArbBot] Arb failed for ${opp.token}: ${err.message}`);
        }
    }
}

export async function marketMakerLoop(signal: AbortSignal): Promise<void> {
    const INTERVAL_MS = 30_000;
    console.log('[ArbBot] Starting market maker loop (30s interval)');

    while (!signal.aborted) {
        try {
            await runArbCycle();
        } catch (err: any) {
            console.error(`[ArbBot] Cycle error: ${err.message}`);
        }

        await new Promise<void>((resolve) => {
            if (signal.aborted) { resolve(); return; }
            const timer = setTimeout(resolve, INTERVAL_MS);
            signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
        });
    }

    console.log('[ArbBot] Market maker stopped');
}
```

**Step 3: Commit**

```bash
git add frontend/src/lib/market-maker/price-feed.ts frontend/src/lib/market-maker/arb-bot.ts
git commit -m "feat: add market maker bot — CoinGecko price feed + SprawlDEX arb execution"
```

---

### Task 13: Daily P&L settlement (midnight UTC cron)

**Files:**
- Create: `frontend/src/lib/engine/settlement.ts`

**Step 1: Write the daily P&L settlement**

At midnight UTC, calculate each agent's portfolio change since last settlement. Profitable agents receive $SPRAWL minting. This is the core economy loop.

```typescript
// frontend/src/lib/engine/settlement.ts
import { ethers } from 'ethers';
import { supabaseAdmin } from '../supabase';
import { readPortfolio, calculatePortfolioValue, readMarketContext } from './market-reader';
import { getDeployerWallet } from '../ethers-provider';
import { CONTRACTS } from '../config';
import { CityStateABI, SprawlTokenABI } from '@/constants/abis';
import { addMemory } from '../memory/memory-stream';
import type { AgentRecord } from '@/types/agent';

const SPRAWL_PER_DOLLAR_PROFIT = 10;
const MIN_PROFIT_FOR_REWARD = 5;
const MAX_DAILY_SPRAWL = 500;

export async function runDailySettlement(): Promise<void> {
    console.log('[Settlement] Starting daily P&L settlement');
    const market = await readMarketContext();

    const { data: agents, error } = await supabaseAdmin
        .from('agents')
        .select('*');

    if (error || !agents) {
        console.error(`[Settlement] Failed to load agents: ${error?.message}`);
        return;
    }

    const deployerWallet = getDeployerWallet();
    const cityState = new ethers.Contract(CONTRACTS.CityState, CityStateABI.abi, deployerWallet);

    let totalSettled = 0;
    let totalSprawlMinted = 0;

    for (const agent of agents as AgentRecord[]) {
        try {
            const portfolio = await readPortfolio(agent.wallet_address);
            const currentValue = calculatePortfolioValue(portfolio, market.prices);
            const lastValue = agent.last_portfolio_value / 1e18;
            const dailyPnl = currentValue - lastValue;

            let sprawlReward = 0;
            if (dailyPnl > MIN_PROFIT_FOR_REWARD) {
                sprawlReward = Math.min(
                    Math.floor(dailyPnl * SPRAWL_PER_DOLLAR_PROFIT),
                    MAX_DAILY_SPRAWL
                );

                const sprawlToken = new ethers.Contract(CONTRACTS.SPRAWL, SprawlTokenABI.abi, deployerWallet);
                try {
                    const tx = await sprawlToken.mint(
                        agent.wallet_address,
                        ethers.utils.parseEther(sprawlReward.toString())
                    );
                    await tx.wait();
                    totalSprawlMinted += sprawlReward;
                } catch (err: any) {
                    console.error(`[Settlement] Failed to mint SPRAWL for agent ${agent.agent_id}: ${err.message}`);
                    sprawlReward = 0;
                }
            }

            const profitStreak = dailyPnl > 0
                ? agent.profit_streak + 1
                : 0;

            await supabaseAdmin
                .from('agents')
                .update({
                    last_portfolio_value: Math.floor(currentValue * 1e18),
                    last_settlement_date: new Date().toISOString().split('T')[0],
                    net_pnl: Math.floor((agent.net_pnl / 1e18 + dailyPnl) * 1e18),
                    sprawl_balance: agent.sprawl_balance + sprawlReward * 1e18,
                    sprawl_lifetime_earned: agent.sprawl_lifetime_earned + sprawlReward * 1e18,
                    profit_streak: profitStreak,
                    xp_daily: 0,
                    xp_daily_date: new Date().toISOString().split('T')[0],
                    recent_actions: 0,
                })
                .eq('agent_id', agent.agent_id);

            try {
                const pnlDeltaWei = ethers.utils.parseEther(dailyPnl.toFixed(18));
                const totalVolumeWei = ethers.BigNumber.from(agent.total_volume.toString());
                await cityState.updateAgent(agent.agent_id, pnlDeltaWei, totalVolumeWei);
            } catch (err: any) {
                console.error(`[Settlement] CityState update failed for agent ${agent.agent_id}: ${err.message}`);
            }

            await addMemory(agent.agent_id, {
                type: 'event',
                description: `Daily settlement: P&L ${dailyPnl >= 0 ? '+' : ''}$${dailyPnl.toFixed(2)}. ${sprawlReward > 0 ? `Earned ${sprawlReward} $SPRAWL.` : 'No $SPRAWL reward.'} Portfolio: $${currentValue.toFixed(2)}. ${profitStreak > 1 ? `Profit streak: ${profitStreak} days.` : ''}`,
                poignancy: Math.min(9, 4 + Math.ceil(Math.abs(dailyPnl) / 200)),
                keywords: ['settlement', 'daily', dailyPnl > 0 ? 'profit' : 'loss', 'sprawl'],
            });

            await supabaseAdmin.from('activity_feed').insert({
                event_type: 'settlement',
                actor_id: agent.agent_id,
                metadata: {
                    pnl: dailyPnl,
                    sprawlReward,
                    portfolioValue: currentValue,
                    profitStreak,
                },
            });

            totalSettled++;
        } catch (err: any) {
            console.error(`[Settlement] Failed to settle agent ${agent.agent_id}: ${err.message}`);
        }
    }

    console.log(`[Settlement] Complete: ${totalSettled} agents settled, ${totalSprawlMinted} $SPRAWL minted`);
}
```

**Step 2: Commit**

```bash
git add frontend/src/lib/engine/settlement.ts
git commit -m "feat: add daily P&L settlement — midnight UTC cron, SPRAWL minting for profitable agents"
```

---

### Task 14: Indexer — chain event listener

**Files:**
- Create: `frontend/src/lib/indexer/event-indexer.ts`

**Step 1: Write the chain event indexer**

Reference: Design doc Section 3.1 (line 1117) for the event listener pattern. Uses `ethers.Contract.on()` for real-time event listening.

```typescript
// frontend/src/lib/indexer/event-indexer.ts
import { ethers } from 'ethers';
import { getMantleSepoliaProvider } from '../ethers-provider';
import { CONTRACTS } from '../config';
import { CityStateABI, SprawlDEXABI } from '@/constants/abis';
import { supabaseAdmin } from '../supabase';
import { bigintSafe } from '../utils/bigint-safe';

export async function startIndexer(signal: AbortSignal): Promise<void> {
    const provider = getMantleSepoliaProvider();
    const cityState = new ethers.Contract(CONTRACTS.CityState, CityStateABI.abi, provider);
    const dex = new ethers.Contract(CONTRACTS.SprawlDEX, SprawlDEXABI.abi, provider);

    console.log('[Indexer] Starting chain event indexer');

    cityState.on('AgentSpawned', async (agentId: ethers.BigNumber, wallet: string, strategyType: number) => {
        console.log(`[Indexer] AgentSpawned: ${agentId.toNumber()} (${wallet})`);
        try {
            const { error } = await supabaseAdmin.from('agents').upsert({
                agent_id: agentId.toNumber(),
                wallet_address: wallet,
                owner_address: wallet,
                strategy_type: strategyType,
                total_volume: 0,
                net_pnl: 0,
                xp_level: 1,
                xp_total: 0,
            }, { onConflict: 'agent_id' });

            if (error) console.error(`[Indexer] Failed to upsert agent: ${error.message}`);

            await supabaseAdmin.from('activity_feed').insert({
                event_type: 'spawn',
                actor_id: agentId.toNumber(),
                metadata: { wallet, strategyType },
            });
        } catch (err: any) {
            console.error(`[Indexer] AgentSpawned handler error: ${err.message}`);
        }
    });

    cityState.on('AgentOutcome', async (agentId: ethers.BigNumber, pnlDelta: ethers.BigNumber, newVolume: ethers.BigNumber, newLevel: ethers.BigNumber) => {
        console.log(`[Indexer] AgentOutcome: ${agentId.toNumber()} volume=${newVolume.toString()} level=${newLevel.toNumber()}`);
        try {
            await supabaseAdmin
                .from('agents')
                .update({
                    total_volume: newVolume.toString(),
                    xp_level: newLevel.toNumber(),
                })
                .eq('agent_id', agentId.toNumber());
        } catch (err: any) {
            console.error(`[Indexer] AgentOutcome handler error: ${err.message}`);
        }
    });

    cityState.on('BuildingGrew', async (agentId: ethers.BigNumber, newLevel: ethers.BigNumber) => {
        console.log(`[Indexer] BuildingGrew: Agent ${agentId.toNumber()} → level ${newLevel.toNumber()}`);
        await supabaseAdmin.from('activity_feed').insert({
            event_type: 'level_up',
            actor_id: agentId.toNumber(),
            metadata: { level: newLevel.toNumber() },
        });
    });

    dex.on('Swap', async (trader: string, tokenIn: string, tokenOut: string, amountIn: ethers.BigNumber, amountOut: ethers.BigNumber, priceAfter: ethers.BigNumber, fee: ethers.BigNumber) => {
        console.log(`[Indexer] Swap: ${trader} ${ethers.utils.formatEther(amountIn)} → ${ethers.utils.formatEther(amountOut)}`);
    });

    signal.addEventListener('abort', () => {
        console.log('[Indexer] Shutting down');
        cityState.removeAllListeners();
        dex.removeAllListeners();
    }, { once: true });

    console.log('[Indexer] Listening for CityState + SprawlDEX events');

    await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => resolve(), { once: true });
    });
}
```

**Step 2: Commit**

```bash
git add frontend/src/lib/indexer/event-indexer.ts
git commit -m "feat: add chain event indexer — listens to CityState + SprawlDEX events, writes to Supabase"
```

---

### Task 15: Entry scripts

**Files:**
- Create: `frontend/scripts/run-engine.ts`
- Create: `frontend/scripts/run-indexer.ts`
- Create: `frontend/scripts/run-market-maker.ts`
- Create: `frontend/scripts/run-all.ts`
- Modify: `frontend/package.json` (add script entries)

**Step 1: Write run-engine.ts**

```typescript
// frontend/scripts/run-engine.ts
import { tickLoop } from '../src/lib/engine/tick-loop';
import { runDailySettlement } from '../src/lib/engine/settlement';
import * as cron from 'node-cron';

const ac = new AbortController();

process.on('SIGINT', () => { ac.abort(); });
process.on('SIGTERM', () => { ac.abort(); });

cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Running daily settlement');
    try {
        await runDailySettlement();
    } catch (err: any) {
        console.error(`[Cron] Settlement failed: ${err.message}`);
    }
}, { timezone: 'UTC' });

console.log('[Engine] Daily settlement cron scheduled (midnight UTC)');

tickLoop({ signal: ac.signal }).then(() => {
    console.log('[Engine] Tick loop exited');
    process.exit(0);
});
```

**Step 2: Write run-indexer.ts**

```typescript
// frontend/scripts/run-indexer.ts
import { startIndexer } from '../src/lib/indexer/event-indexer';

const ac = new AbortController();

process.on('SIGINT', () => { ac.abort(); });
process.on('SIGTERM', () => { ac.abort(); });

startIndexer(ac.signal).then(() => {
    console.log('[Indexer] Exited');
    process.exit(0);
});
```

**Step 3: Write run-market-maker.ts**

```typescript
// frontend/scripts/run-market-maker.ts
import { marketMakerLoop } from '../src/lib/market-maker/arb-bot';

const ac = new AbortController();

process.on('SIGINT', () => { ac.abort(); });
process.on('SIGTERM', () => { ac.abort(); });

marketMakerLoop(ac.signal).then(() => {
    console.log('[MarketMaker] Exited');
    process.exit(0);
});
```

**Step 4: Write run-all.ts**

```typescript
// frontend/scripts/run-all.ts
import { tickLoop } from '../src/lib/engine/tick-loop';
import { runDailySettlement } from '../src/lib/engine/settlement';
import { startIndexer } from '../src/lib/indexer/event-indexer';
import { marketMakerLoop } from '../src/lib/market-maker/arb-bot';
import * as cron from 'node-cron';

const ac = new AbortController();

process.on('SIGINT', () => {
    console.log('\n[RunAll] Shutting down...');
    ac.abort();
});
process.on('SIGTERM', () => {
    console.log('\n[RunAll] SIGTERM received, shutting down...');
    ac.abort();
});

async function main() {
    console.log('[RunAll] Starting all services');

    cron.schedule('0 0 * * *', async () => {
        console.log('[Cron] Running daily settlement');
        try {
            await runDailySettlement();
        } catch (err: any) {
            console.error(`[Cron] Settlement failed: ${err.message}`);
        }
    }, { timezone: 'UTC' });

    const processes = [
        tickLoop({ signal: ac.signal }).then(() => console.log('[RunAll] Engine stopped')),
        startIndexer(ac.signal).then(() => console.log('[RunAll] Indexer stopped')),
        marketMakerLoop(ac.signal).then(() => console.log('[RunAll] MarketMaker stopped')),
    ];

    console.log('[RunAll] All services running. Press Ctrl+C to stop.');

    await Promise.allSettled(processes);
    console.log('[RunAll] All services stopped');
    process.exit(0);
}

main().catch((err) => {
    console.error(`[RunAll] Fatal: ${err.message}`);
    process.exit(1);
});
```

**Step 5: Install runtime deps**

```bash
cd frontend && npm install node-cron ethers@^5 dotenv
npm install --save-dev @types/node-cron tsx
```

**Step 6: Add scripts to package.json**

Add these to the `scripts` section of `frontend/package.json`:

```json
{
    "engine": "tsx scripts/run-engine.ts",
    "indexer": "tsx scripts/run-indexer.ts",
    "market-maker": "tsx scripts/run-market-maker.ts",
    "run-all": "tsx scripts/run-all.ts"
}
```

**Step 7: Update frontend/.env.example**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
BACKEND_PRIVATE_KEY=
DEEPSEEK_API_KEY=
OPENAI_API_KEY=
COINGECKO_API_KEY=
WALLET_ENCRYPTION_KEY=
```

**Step 8: Run all services locally**

```bash
cd frontend && npm run run-all
```
Expected output:
```
[RunAll] Starting all services
[Engine] Daily settlement cron scheduled (midnight UTC)
[TickLoop] Starting tick loop (interval: 60000ms, max agents: 50)
[Indexer] Starting chain event indexer
[Indexer] Listening for CityState + SprawlDEX events
[ArbBot] Starting market maker loop (30s interval)
[RunAll] All services running. Press Ctrl+C to stop.
[TickLoop] No agents to process (tick #1)
```

**Step 9: Commit**

```bash
git add frontend/scripts/ frontend/package.json frontend/.env.example
git commit -m "feat: add run-engine, run-indexer, run-market-maker, run-all entry scripts"
```

---

## Summary: What Phase 2 Delivers

After completing all 15 tasks:

- [x] Supabase migrations (agents, trade_history, agent_memories, agent_memory_embeddings, agent_skills, agent_wallets, activity_feed + RLS policies + pgvector match RPC)
- [x] Full TypeScript type system (engine, market, memory types)
- [x] Market context reader (SprawlDEX prices, pool states, agent portfolio from chain)
- [x] Memory system (add/retrieve/reflect with 3-factor scoring: `0.5*recency + 3*relevance + 2*importance`)
- [x] Policy strategy engine (evaluates user-configured if/then rules)
- [x] LLM strategy engine (DeepSeek v4 with tool calling for swap/LP/hold)
- [x] Canned fallback strategies (momentum, mean_reversion, conservative, balanced, degen)
- [x] Guardrail layer (position caps, slippage limits, rate limits, protocol allowlist)
- [x] On-chain execution (swap, addLiquidity, removeLiquidity on SprawlDEX, record to CityState)
- [x] Agent tick loop engine (60s interval, processes all agents per tick)
- [x] Voyager-pattern skill manager (learn from profitable trades, vector retrieval)
- [x] Market maker bot (CoinGecko price feed every 30s, arb trades when spread > 2%)
- [x] Daily P&L settlement (midnight UTC cron, $SPRAWL minting for profitable agents)
- [x] Chain event indexer (CityState + SprawlDEX events to Supabase)
- [x] Entry scripts: `run-engine.ts`, `run-indexer.ts`, `run-market-maker.ts`, `run-all.ts`

**Key inspiration file references:**
- `inspiration/ai-town/convex/engine/abstractGame.ts` — tick loop runStep pattern
- `inspiration/ai-town/convex/aiTown/main.ts` — outer step loop with deadline
- `inspiration/clan-world/packages/runner/src/tickLoop.ts` — settle latch + abort signal
- `inspiration/generative_agents/reverie/backend_server/persona/cognitive_modules/retrieve.py` — 3-factor scoring (gw=[0.5,3,2])
- `inspiration/generative_agents/reverie/backend_server/persona/cognitive_modules/reflect.py` — focal points + insight generation
- `inspiration/Voyager/voyager/agents/skill.py` — skill library add/retrieve with vector DB
- `inspiration/signatory/frontend/src/lib/openai.ts` — DeepSeek API with tool calling
- `inspiration/signatory/frontend/src/lib/ethers-provider.ts` — StaticJsonRpcProvider + skipFetchSetup
- `inspiration/signatory/frontend/src/lib/agent-actions.ts` — swap execution with ethers v5
- `inspiration/signatory/frontend/src/lib/goat.ts` — token balance reading pattern
- `inspiration/byreal-agent-skills/src/core/confirm.ts` — dry-run/confirm execution gating
- `inspiration/eth-open-agents/packages/pet-runtime/src/brain.ts` — LLM fallback pattern (Sonnet cap -> Haiku)

**Next phase:** Phase 3 (Indexer + Data Layer) — deeper event processing, Supabase Realtime subscriptions, XP/achievement system.
