# Phase 3: Indexer + Data Layer -- Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Node.js event indexer that listens to CityState, SprawlDEX, and RaidContract events on Mantle Sepolia, persists them to Supabase with block cursor recovery, writes the activity feed, and broadcasts real-time updates to the frontend via Supabase Realtime channels.

**Architecture:** Standalone Node.js long-running process (`frontend/scripts/run-indexer.ts`). Uses ethers v5 for chain event listening. Writes to Supabase via the admin (service role) client. Simultaneously broadcasts to a Realtime channel for instant frontend updates (PetSupervisor pattern from `inspiration/eth-open-agents/apps/hub/src/PetSupervisor.ts`).

**Tech Stack:** ethers v5, @supabase/supabase-js, tsx (for running TypeScript directly), dotenv

**Design doc reference:** `docs/plans/2026-05-30-sprawl-protocol-implementation-plan.md` -- Section 3 (Indexer + Data Layer), Appendix I (Indexer Specifics), Appendix M (Activity Feed Schema), Appendix B.6 (agent_wallets), B.7 (RLS Policies), B.8 (Missing agents columns).

**Dependencies:** Phase 1 must be complete -- contracts deployed to Mantle Sepolia, `contracts/deployments.json` exists, ABIs available in `frontend/src/constants/abi/`.

---

### Task 1: Supabase migration -- indexer_state table

**Files:**
- Create: `frontend/supabase/migrations/023_indexer_state.sql`

**Step 1: Write the migration**

```sql
-- ============================================================
-- 023: Indexer State
-- Block cursor persistence for the Mantle event indexer.
-- Allows resuming from the last processed block on restart.
-- ============================================================

CREATE TABLE IF NOT EXISTS indexer_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_name TEXT UNIQUE NOT NULL,     -- 'CityState', 'SprawlDEX', 'RaidContract'
    contract_address TEXT NOT NULL,
    last_block_number BIGINT NOT NULL DEFAULT 0,
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_indexer_state_contract ON indexer_state(contract_name);

-- RLS: no browser access, only service role
ALTER TABLE indexer_state ENABLE ROW LEVEL SECURITY;
-- No policies = zero browser access. Only service role key can read/write.
```

**Step 2: Run migration**

```bash
cd frontend && npx supabase db push
```

**Step 3: Commit**

```bash
git add frontend/supabase/migrations/023_indexer_state.sql
git commit -m "feat: add indexer_state table for block cursor persistence"
```

---

### Task 2: ~~Supabase migration -- activity_feed table~~ REMOVED

> **REMOVED:** Phase 2 owns the `activity_feed` table (migration `006_activity_feed.sql`). Phase 3 does NOT create this table. The FeedWriter (Task 8) simply INSERTs into the table Phase 2 created, using the canonical schema: `event_type, actor_id, target_id, metadata`.

---

### Task 3: Supabase migration -- raids + raid_tags tables

**Files:**
- Create: `frontend/supabase/migrations/025_raids.sql`

**Step 1: Write the migration**

Reference: `inspiration/git-city/supabase/migrations/015_raid_system.sql`, adapted for Sprawl (developers -> agents, building_id -> agent_id)

```sql
-- ============================================================
-- 025: Raid System
-- Adapted from git-city migration 015.
-- Renames developers -> agents, building_id -> agent_id.
-- ============================================================

-- 1. raids table
CREATE TABLE IF NOT EXISTS raids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attacker_id INTEGER NOT NULL REFERENCES agents(agent_id),
    defender_id INTEGER NOT NULL REFERENCES agents(agent_id),
    attack_score INTEGER NOT NULL,
    defense_score INTEGER NOT NULL,
    success BOOLEAN NOT NULL,
    attack_breakdown JSONB NOT NULL DEFAULT '{}',
    defense_breakdown JSONB NOT NULL DEFAULT '{}',
    spoils_xp INTEGER NOT NULL DEFAULT 0,
    tx_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT raids_no_self CHECK (attacker_id != defender_id)
);

CREATE INDEX IF NOT EXISTS idx_raids_attacker ON raids(attacker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_raids_defender ON raids(defender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_raids_pair_week ON raids(attacker_id, defender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_raids_success_created ON raids(success, created_at DESC) WHERE success = true;

ALTER TABLE raids ENABLE ROW LEVEL SECURITY;
CREATE POLICY "raids_public_read" ON raids FOR SELECT USING (true);

-- 2. raid_tags table (graffiti on raided buildings, 3-day expiry)
CREATE TABLE IF NOT EXISTS raid_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raid_id UUID NOT NULL REFERENCES raids(id) ON DELETE CASCADE,
    agent_id INTEGER NOT NULL REFERENCES agents(agent_id),      -- the building that got tagged
    attacker_id INTEGER NOT NULL REFERENCES agents(agent_id),
    attacker_name TEXT NOT NULL,
    tag_style TEXT NOT NULL DEFAULT 'default',
    active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only 1 active tag per building
CREATE UNIQUE INDEX IF NOT EXISTS idx_raid_tags_agent_active
    ON raid_tags(agent_id)
    WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_raid_tags_expires ON raid_tags(expires_at);

ALTER TABLE raid_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "raid_tags_public_read" ON raid_tags FOR SELECT USING (true);
```

**Step 2: Run migration**

```bash
cd frontend && npx supabase db push
```

**Step 3: Commit**

```bash
git add frontend/supabase/migrations/025_raids.sql
git commit -m "feat: add raids + raid_tags tables adapted from git-city"
```

---

### Task 4: ~~Supabase migration -- XP leveling system~~ REMOVED

> **REMOVED:** Phase 6 owns the XP/leveling system (migration `003_xp_leveling.sql` in Phase 6). Phase 3 does NOT create the `xp_log` table or the `grant_xp` RPC. Phase 3's indexer calls `supabase.rpc('grant_xp', ...)` which is created by Phase 6.
>
> **Dependency:** Phase 6 migrations must run before Phase 3's indexer can grant XP. If Phase 6 is not yet deployed, the indexer's `grant_xp` RPC calls will fail gracefully with a logged warning (see Task 12 raid handler).

---

### Task 5: Supabase migration -- missing agents columns + RLS policies

**Files:**
- Create: `frontend/supabase/migrations/027_agents_additions.sql`

**Step 1: Write the migration**

Reference: Design doc Appendix B.8 (missing agents columns) + B.7 (RLS policies) + B.6 (agent_wallets)

```sql
-- ============================================================
-- 027: Missing Agents Columns + RLS + agent_wallets
-- Adds columns referenced throughout the plan but missing from
-- the original agents schema. Sets up RLS for all indexer tables.
-- ============================================================

-- B.8: Missing columns on agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS weekly_volume BIGINT DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS weekly_start_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS profit_streak INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS reputation_given INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS poignancy_accumulator INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_settlement_date DATE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS net_pnl BIGINT DEFAULT 0;

-- B.6: agent_wallets (encrypted private keys, server-only access)
CREATE TABLE IF NOT EXISTS agent_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER UNIQUE REFERENCES agents(agent_id),
    encrypted_private_key TEXT NOT NULL,    -- AES-256-GCM encrypted with BACKEND_ENCRYPTION_KEY
    iv TEXT NOT NULL,                       -- initialization vector for decryption
    wallet_address TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: NEVER readable from the browser. Only accessed via getSupabaseAdmin()
ALTER TABLE agent_wallets ENABLE ROW LEVEL SECURITY;
-- No policies = no browser access. Only service role key can read.

-- B.7: RLS policies for core tables
-- agents: public read (leaderboard), write only via service role
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read" ON agents;
CREATE POLICY "Public read" ON agents FOR SELECT USING (true);

-- trade_history: public read (transparency), write only via service role
ALTER TABLE trade_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read" ON trade_history;
CREATE POLICY "Public read" ON trade_history FOR SELECT USING (true);

-- Leaderboard index on sprawl_lifetime_earned (primary height driver)
CREATE INDEX IF NOT EXISTS idx_agents_sprawl_earned ON agents(sprawl_lifetime_earned DESC);
CREATE INDEX IF NOT EXISTS idx_agents_total_volume ON agents(total_volume DESC);
```

**Step 2: Run migration**

```bash
cd frontend && npx supabase db push
```

**Step 3: Commit**

```bash
git add frontend/supabase/migrations/027_agents_additions.sql
git commit -m "feat: add missing agents columns, agent_wallets table, and RLS policies"
```

---

### Task 6: Indexer types and constants

**Files:**
- Create: `frontend/src/lib/indexer/types.ts`
- Create: `frontend/src/lib/indexer/constants.ts`

**Step 1: Create indexer types**

```typescript
// frontend/src/lib/indexer/types.ts

export interface IndexerState {
    contract_name: string;
    contract_address: string;
    last_block_number: number;
}

export interface FeedEvent {
    event_type: 'trade' | 'raid_win' | 'raid_loss' | 'achievement' | 'spawn' | 'level_up' | 'billboard';
    actor_id: number;
    target_id?: number;
    metadata: Record<string, unknown>;
}

export interface SwapEventArgs {
    trader: string;       // indexed
    tokenIn: string;      // NOT indexed -- decoded from event data, not log topics
    tokenOut: string;     // NOT indexed -- decoded from event data, not log topics
    amountIn: bigint;
    amountOut: bigint;
    priceAfter: bigint;
    fee: bigint;
}

export interface AgentSpawnedArgs {
    agentId: bigint;
    wallet: string;
    strategyType: number;
}

export interface AgentOutcomeArgs {
    agentId: bigint;
    pnlDelta: bigint;
    newVolume: bigint;
    newLevel: bigint;
}

export interface RaidResultArgs {
    attackerId: bigint;
    defenderId: bigint;
    attackerWon: boolean;
    spoilsXp: bigint;
}

export interface BuildingGrewArgs {
    agentId: bigint;
    newLevel: bigint;
}
```

**Step 2: Create indexer constants**

```typescript
// frontend/src/lib/indexer/constants.ts

export const CHUNK_SIZE = 1000;

export const REALTIME_CHANNEL = 'city-feed';

export const XP_RAID_WIN_ATTACKER = 50;
export const XP_RAID_LOSS_DEFENDER = 30;
export const RAID_TAG_DURATION_DAYS = 3;

export const TOKEN_SYMBOLS: Record<string, string> = {};
// Populated at startup from deployments.json: address -> symbol mapping
```

**Step 3: Commit**

```bash
git add frontend/src/lib/indexer/types.ts frontend/src/lib/indexer/constants.ts
git commit -m "feat: add indexer types and constants"
```

---

### Task 7: Block cursor persistence module

**Files:**
- Create: `frontend/src/lib/indexer/block-cursor.ts`

**Step 1: Write block cursor persistence**

Reference: Design doc Appendix I -- `indexer_state` with `{ contract, last_block_number }`

```typescript
// frontend/src/lib/indexer/block-cursor.ts
import { SupabaseClient } from '@supabase/supabase-js';

export class BlockCursor {
    private supabase: SupabaseClient;
    private contractName: string;
    private contractAddress: string;
    private lastBlock: number;

    constructor(supabase: SupabaseClient, contractName: string, contractAddress: string) {
        this.supabase = supabase;
        this.contractName = contractName;
        this.contractAddress = contractAddress;
        this.lastBlock = 0;
    }

    async load(): Promise<number> {
        const { data, error } = await this.supabase
            .from('indexer_state')
            .select('last_block_number')
            .eq('contract_name', this.contractName)
            .single();

        if (error || !data) {
            // First run: insert initial row
            await this.supabase.from('indexer_state').upsert({
                contract_name: this.contractName,
                contract_address: this.contractAddress,
                last_block_number: 0,
            }, { onConflict: 'contract_name' });
            this.lastBlock = 0;
            return 0;
        }

        this.lastBlock = data.last_block_number;
        return this.lastBlock;
    }

    async save(blockNumber: number): Promise<void> {
        if (blockNumber <= this.lastBlock) return;
        this.lastBlock = blockNumber;

        await this.supabase
            .from('indexer_state')
            .update({
                last_block_number: blockNumber,
                last_updated_at: new Date().toISOString(),
            })
            .eq('contract_name', this.contractName);
    }

    getLastBlock(): number {
        return this.lastBlock;
    }
}
```

**Step 2: Commit**

```bash
git add frontend/src/lib/indexer/block-cursor.ts
git commit -m "feat: add block cursor persistence for indexer resume-from-last-block"
```

---

### Task 8: Activity feed writer + Realtime broadcast

**Files:**
- Create: `frontend/src/lib/indexer/feed-writer.ts`

**Step 1: Write the feed writer with simultaneous DB write + Realtime broadcast**

Reference: `inspiration/eth-open-agents/apps/hub/src/PetSupervisor.ts:74-106` -- write to DB AND emit via channel simultaneously.

```typescript
// frontend/src/lib/indexer/feed-writer.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { FeedEvent } from './types';
import { REALTIME_CHANNEL } from './constants';

export class FeedWriter {
    private supabase: SupabaseClient;
    private channel: ReturnType<SupabaseClient['channel']>;

    constructor(supabase: SupabaseClient) {
        this.supabase = supabase;
        this.channel = supabase.channel(REALTIME_CHANNEL);
        this.channel.subscribe((status) => {
            console.log(`[FeedWriter] Realtime channel ${REALTIME_CHANNEL}: ${status}`);
        });
    }

    // Inserts into the activity_feed table owned by Phase 2 (migration 006).
    // Uses Phase 2's canonical schema: event_type, actor_id, target_id, metadata.
    async write(event: FeedEvent): Promise<void> {
        const row = {
            event_type: event.event_type,
            actor_id: event.actor_id,
            target_id: event.target_id ?? null,
            metadata: event.metadata,
        };

        // Simultaneous: DB write + Realtime broadcast (PetSupervisor pattern)
        const [dbResult] = await Promise.all([
            this.supabase.from('activity_feed').insert(row),
            this.channel.send({
                type: 'broadcast',
                event: 'activity',
                payload: {
                    ...row,
                    created_at: new Date().toISOString(),
                },
            }),
        ]);

        if (dbResult.error) {
            console.error('[FeedWriter] DB insert failed:', dbResult.error.message);
        }
    }

    async writeSpawn(agentId: number, wallet: string, strategyType: number): Promise<void> {
        await this.write({
            event_type: 'spawn',
            actor_id: agentId,
            metadata: {
                wallet,
                strategy_type: strategyType,
                message: `Agent #${agentId} spawned in the city`,
            },
        });
    }

    async writeTrade(
        agentId: number,
        tokenIn: string,
        tokenOut: string,
        amountIn: string,
        amountOut: string,
        txHash: string,
    ): Promise<void> {
        await this.write({
            event_type: 'trade',
            actor_id: agentId,
            metadata: {
                token_in: tokenIn,
                token_out: tokenOut,
                amount_in: amountIn,
                amount_out: amountOut,
                tx_hash: txHash,
                message: `Agent #${agentId} swapped ${amountIn} ${tokenIn} for ${amountOut} ${tokenOut}`,
            },
        });
    }

    async writeRaid(
        attackerId: number,
        defenderId: number,
        attackerWon: boolean,
        xp: number,
    ): Promise<void> {
        await this.write({
            event_type: attackerWon ? 'raid_win' : 'raid_loss',
            actor_id: attackerId,
            target_id: defenderId,
            metadata: {
                attacker_won: attackerWon,
                xp_reward: xp,
                message: attackerWon
                    ? `Agent #${attackerId} raided Agent #${defenderId} and won ${xp} XP`
                    : `Agent #${attackerId} raided Agent #${defenderId} but lost`,
            },
        });
    }

    async writeLevelUp(agentId: number, newLevel: number): Promise<void> {
        await this.write({
            event_type: 'level_up',
            actor_id: agentId,
            metadata: {
                new_level: newLevel,
                message: `Agent #${agentId} reached level ${newLevel}`,
            },
        });
    }

    async writeAchievement(agentId: number, achievementId: string, name: string): Promise<void> {
        await this.write({
            event_type: 'achievement',
            actor_id: agentId,
            metadata: {
                achievement_id: achievementId,
                achievement_name: name,
                message: `Agent #${agentId} unlocked "${name}"`,
            },
        });
    }

    destroy(): void {
        this.supabase.removeChannel(this.channel);
    }
}
```

**Step 2: Commit**

```bash
git add frontend/src/lib/indexer/feed-writer.ts
git commit -m "feat: add FeedWriter with simultaneous Supabase insert + Realtime broadcast"
```

---

### Task 9: Token address resolver

**Files:**
- Create: `frontend/src/lib/indexer/token-resolver.ts`

**Step 1: Write the token resolver**

Maps deployed contract addresses to human-readable symbols (sETH, sBTC, etc.) so event handlers can log friendly names.

```typescript
// frontend/src/lib/indexer/token-resolver.ts
import deployments from '@/constants/deployments.json';

const ADDRESS_TO_SYMBOL: Record<string, string> = {};

export function initTokenResolver(): void {
    const tokenKeys = ['sETH', 'sBTC', 'sUSDC', 'sPOL', 'sSOL', 'SPRAWL'] as const;
    for (const key of tokenKeys) {
        const addr = (deployments as Record<string, string>)[key];
        if (addr) {
            ADDRESS_TO_SYMBOL[addr.toLowerCase()] = key;
        }
    }
    console.log(`[TokenResolver] Mapped ${Object.keys(ADDRESS_TO_SYMBOL).length} token addresses`);
}

export function addressToSymbol(address: string): string {
    return ADDRESS_TO_SYMBOL[address.toLowerCase()] ?? address.slice(0, 10);
}

export function symbolToAddress(symbol: string): string | undefined {
    return (deployments as Record<string, string>)[symbol];
}
```

**Step 2: Commit**

```bash
git add frontend/src/lib/indexer/token-resolver.ts
git commit -m "feat: add token address resolver for indexer event logging"
```

---

### Task 10: Event handlers -- AgentSpawned, AgentOutcome, BuildingGrew

**Files:**
- Create: `frontend/src/lib/indexer/handlers/citystate.ts`

**Step 1: Write CityState event handlers**

Reference: Design doc Section 3.1 -- `cityState.on('AgentSpawned', ...)`, `cityState.on('AgentOutcome', ...)`

```typescript
// frontend/src/lib/indexer/handlers/citystate.ts
import { ethers } from 'ethers';
import { SupabaseClient } from '@supabase/supabase-js';
import { FeedWriter } from '../feed-writer';
import { AgentSpawnedArgs, AgentOutcomeArgs, BuildingGrewArgs } from '../types';

export function createCityStateHandlers(supabase: SupabaseClient, feedWriter: FeedWriter) {
    async function handleAgentSpawned(
        agentId: ethers.BigNumber,
        wallet: string,
        strategyType: number,
        event: ethers.Event,
    ): Promise<void> {
        const id = agentId.toNumber();
        console.log(`[CityState] AgentSpawned: agent_id=${id} wallet=${wallet} strategy=${strategyType}`);

        const { error } = await supabase.from('agents').upsert({
            agent_id: id,
            wallet_address: wallet,
            strategy_type: strategyType,
            total_volume: 0,
            net_pnl: 0,
            xp_level: 1,
            xp_total: 0,
            sprawl_balance: 0,
            sprawl_lifetime_earned: 0,
            sprawl_lifetime_spent: 0,
            last_portfolio_value: 0,
            strategy_count: 1,
            recent_actions: 0,
            reputation_score: 0,
            raid_wins: 0,
            raid_losses: 0,
            raid_xp: 0,
            app_streak: 0,
            district: 'general',
        }, { onConflict: 'agent_id' });

        if (error) {
            console.error(`[CityState] Failed to insert agent ${id}:`, error.message);
            return;
        }

        await feedWriter.writeSpawn(id, wallet, strategyType);
    }

    async function handleAgentOutcome(
        agentId: ethers.BigNumber,
        pnlDelta: ethers.BigNumber,
        newVolume: ethers.BigNumber,
        newLevel: ethers.BigNumber,
        event: ethers.Event,
    ): Promise<void> {
        const id = agentId.toNumber();
        const pnl = pnlDelta.toNumber();
        const volume = newVolume.toString();
        const level = newLevel.toNumber();

        console.log(`[CityState] AgentOutcome: agent_id=${id} pnl_delta=${pnl} volume=${volume} level=${level}`);

        // Fetch current agent to compute new net_pnl
        const { data: agent } = await supabase
            .from('agents')
            .select('net_pnl, xp_level')
            .eq('agent_id', id)
            .single();

        const currentPnl = agent?.net_pnl ?? 0;
        const previousLevel = agent?.xp_level ?? 1;

        const { error } = await supabase
            .from('agents')
            .update({
                total_volume: volume,
                net_pnl: currentPnl + pnl,
                last_action_at: new Date().toISOString(),
            })
            .eq('agent_id', id);

        if (error) {
            console.error(`[CityState] Failed to update agent ${id}:`, error.message);
        }
    }

    async function handleBuildingGrew(
        agentId: ethers.BigNumber,
        newLevel: ethers.BigNumber,
        event: ethers.Event,
    ): Promise<void> {
        const id = agentId.toNumber();
        const level = newLevel.toNumber();

        console.log(`[CityState] BuildingGrew: agent_id=${id} new_level=${level}`);

        await feedWriter.writeLevelUp(id, level);
    }

    return {
        handleAgentSpawned,
        handleAgentOutcome,
        handleBuildingGrew,
    };
}
```

**Step 2: Commit**

```bash
git add frontend/src/lib/indexer/handlers/citystate.ts
git commit -m "feat: add CityState event handlers -- AgentSpawned, AgentOutcome, BuildingGrew"
```

---

### Task 11: Event handlers -- SprawlDEX Swap

**Files:**
- Create: `frontend/src/lib/indexer/handlers/sprawldex.ts`

**Step 1: Write SprawlDEX event handlers**

Tracks every swap for volume, price history, and pool state. Writes to `trade_history`, updates `agents.total_volume`, and emits a feed event.

Reference: Design doc Section 3.1, SprawlDEX Swap event: `event Swap(address indexed trader, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 priceAfter, uint256 fee)`

> **Note:** `tokenIn` and `tokenOut` are NOT indexed in Phase 1's SprawlDEX.sol. Only `trader` is indexed. Do NOT use topic-based filtering for tokenIn/tokenOut. Instead, decode the full event data and filter in JS if needed.

```typescript
// frontend/src/lib/indexer/handlers/sprawldex.ts
import { ethers } from 'ethers';
import { SupabaseClient } from '@supabase/supabase-js';
import { FeedWriter } from '../feed-writer';
import { addressToSymbol } from '../token-resolver';

export function createSprawlDEXHandlers(supabase: SupabaseClient, feedWriter: FeedWriter) {
    // NOTE: Only `trader` is indexed in SprawlDEX.sol's Swap event.
    // tokenIn/tokenOut are non-indexed -- they come from decoded event data,
    // not from log topics. Do NOT use contract.filters.Swap(null, tokenIn, tokenOut).
    // To filter by token, decode all Swap events and filter in JS.
    async function handleSwap(
        trader: string,
        tokenIn: string,
        tokenOut: string,
        amountIn: ethers.BigNumber,
        amountOut: ethers.BigNumber,
        priceAfter: ethers.BigNumber,
        fee: ethers.BigNumber,
        event: ethers.Event,
    ): Promise<void> {
        const symbolIn = addressToSymbol(tokenIn);
        const symbolOut = addressToSymbol(tokenOut);
        const amtIn = ethers.utils.formatEther(amountIn);
        const amtOut = ethers.utils.formatEther(amountOut);
        const price = ethers.utils.formatEther(priceAfter);
        const txHash = event.transactionHash;

        console.log(`[SprawlDEX] Swap: ${trader} ${amtIn} ${symbolIn} -> ${amtOut} ${symbolOut} (price: ${price})`);

        // Look up agent by wallet address
        const { data: agent } = await supabase
            .from('agents')
            .select('agent_id, total_volume')
            .eq('wallet_address', trader.toLowerCase())
            .single();

        if (!agent) {
            // Not an agent trade (e.g., MarketMaker or manual) -- still log it but skip agent updates
            console.log(`[SprawlDEX] Swap from non-agent wallet ${trader}, skipping agent update`);
            return;
        }

        const agentId = agent.agent_id;

        // Insert trade_history row
        const { error: tradeError } = await supabase.from('trade_history').insert({
            agent_id: agentId,
            action: 'swap',
            token_in: symbolIn,
            token_out: symbolOut,
            amount_in: amountIn.toString(),
            amount_out: amountOut.toString(),
            price_at_trade: parseFloat(price),
            tx_hash: txHash,
        });

        if (tradeError) {
            console.error(`[SprawlDEX] Failed to insert trade for agent ${agentId}:`, tradeError.message);
        }

        // Update agent total_volume (add amountIn to running total)
        const currentVolume = BigInt(agent.total_volume || '0');
        const newVolume = currentVolume + amountIn.toBigInt();

        const { error: updateError } = await supabase
            .from('agents')
            .update({
                total_volume: newVolume.toString(),
                last_action_at: new Date().toISOString(),
                recent_actions: supabase.rpc ? undefined : undefined, // handled by a separate cron
            })
            .eq('agent_id', agentId);

        if (updateError) {
            console.error(`[SprawlDEX] Failed to update agent ${agentId} volume:`, updateError.message);
        }

        // Update weekly_volume
        await supabase.rpc('increment_weekly_volume', {
            p_agent_id: agentId,
            p_amount: amountIn.toString(),
        }).then(({ error }) => {
            // RPC may not exist yet, that's OK -- graceful fallback
            if (error) {
                console.warn(`[SprawlDEX] increment_weekly_volume RPC not available:`, error.message);
            }
        });

        // Write feed event
        await feedWriter.writeTrade(agentId, symbolIn, symbolOut, amtIn, amtOut, txHash);
    }

    async function handleLiquidityAdded(
        provider: string,
        poolId: string,
        amountA: ethers.BigNumber,
        amountB: ethers.BigNumber,
        shares: ethers.BigNumber,
        event: ethers.Event,
    ): Promise<void> {
        console.log(`[SprawlDEX] LiquidityAdded: provider=${provider} poolId=${poolId}`);

        const { data: agent } = await supabase
            .from('agents')
            .select('agent_id')
            .eq('wallet_address', provider.toLowerCase())
            .single();

        if (!agent) return;

        await supabase.from('trade_history').insert({
            agent_id: agent.agent_id,
            action: 'add_lp',
            amount_in: amountA.toString(),
            amount_out: amountB.toString(),
            tx_hash: event.transactionHash,
        });

        await feedWriter.write({
            event_type: 'trade',
            actor_id: agent.agent_id,
            metadata: {
                action: 'add_lp',
                pool_id: poolId,
                amount_a: amountA.toString(),
                amount_b: amountB.toString(),
                tx_hash: event.transactionHash,
                message: `Agent #${agent.agent_id} added liquidity`,
            },
        });
    }

    async function handleLiquidityRemoved(
        provider: string,
        poolId: string,
        amountA: ethers.BigNumber,
        amountB: ethers.BigNumber,
        shares: ethers.BigNumber,
        event: ethers.Event,
    ): Promise<void> {
        console.log(`[SprawlDEX] LiquidityRemoved: provider=${provider} poolId=${poolId}`);

        const { data: agent } = await supabase
            .from('agents')
            .select('agent_id')
            .eq('wallet_address', provider.toLowerCase())
            .single();

        if (!agent) return;

        await supabase.from('trade_history').insert({
            agent_id: agent.agent_id,
            action: 'remove_lp',
            amount_in: amountA.toString(),
            amount_out: amountB.toString(),
            tx_hash: event.transactionHash,
        });

        await feedWriter.write({
            event_type: 'trade',
            actor_id: agent.agent_id,
            metadata: {
                action: 'remove_lp',
                pool_id: poolId,
                tx_hash: event.transactionHash,
                message: `Agent #${agent.agent_id} removed liquidity`,
            },
        });
    }

    return {
        handleSwap,
        handleLiquidityAdded,
        handleLiquidityRemoved,
    };
}
```

**Step 2: Commit**

```bash
git add frontend/src/lib/indexer/handlers/sprawldex.ts
git commit -m "feat: add SprawlDEX event handlers -- Swap, LiquidityAdded, LiquidityRemoved"
```

---

### Task 12: Event handlers -- RaidResult

**Files:**
- Create: `frontend/src/lib/indexer/handlers/raid.ts`

**Step 1: Write RaidContract event handlers**

Inserts raids row, updates agent stats, grants XP via RPC, writes raid_tags, and emits feed events.

Reference: Design doc Section 3.1, git-city `015_raid_system.sql`. Note: `RaidResult` is emitted by `RaidContract` (Phase 1), not CityState. The indexer listens on the RaidContract address.

```typescript
// frontend/src/lib/indexer/handlers/raid.ts
import { ethers } from 'ethers';
import { SupabaseClient } from '@supabase/supabase-js';
import { FeedWriter } from '../feed-writer';
import { XP_RAID_WIN_ATTACKER, XP_RAID_LOSS_DEFENDER, RAID_TAG_DURATION_DAYS } from '../constants';

export function createRaidHandlers(supabase: SupabaseClient, feedWriter: FeedWriter) {
    async function handleRaidResult(
        attackerId: ethers.BigNumber,
        defenderId: ethers.BigNumber,
        attackerWon: boolean,
        spoilsXp: ethers.BigNumber,
        event: ethers.Event,
    ): Promise<void> {
        const attId = attackerId.toNumber();
        const defId = defenderId.toNumber();
        const xpReward = spoilsXp.toNumber();
        const txHash = event.transactionHash;

        console.log(`[Raid] RaidResult: attacker=${attId} defender=${defId} won=${attackerWon} xp=${xpReward}`);

        // Fetch both agents for score breakdown
        const { data: attacker } = await supabase
            .from('agents')
            .select('agent_id, name, total_volume, raid_wins, xp_level')
            .eq('agent_id', attId)
            .single();

        const { data: defender } = await supabase
            .from('agents')
            .select('agent_id, name, total_volume, raid_wins, xp_level')
            .eq('agent_id', defId)
            .single();

        // Compute score breakdown for transparency
        const attackScore = attacker
            ? (BigInt(attacker.total_volume || 0) * 3n + BigInt(attacker.raid_wins || 0) * 50n + BigInt(attacker.xp_level || 1) * 10n)
            : 0n;
        const defenseScore = defender
            ? (BigInt(defender.total_volume || 0) * 3n + BigInt(defender.raid_wins || 0) * 30n + BigInt(defender.xp_level || 1) * 10n)
            : 0n;

        // Insert raids row
        const { data: raid, error: raidError } = await supabase.from('raids').insert({
            attacker_id: attId,
            defender_id: defId,
            attack_score: Number(attackScore),
            defense_score: Number(defenseScore),
            success: attackerWon,
            attack_breakdown: {
                total_volume: attacker?.total_volume ?? 0,
                raid_wins: attacker?.raid_wins ?? 0,
                level: attacker?.xp_level ?? 1,
            },
            defense_breakdown: {
                total_volume: defender?.total_volume ?? 0,
                raid_wins: defender?.raid_wins ?? 0,
                level: defender?.xp_level ?? 1,
            },
            spoils_xp: xpReward,
            tx_hash: txHash,
        }).select('id').single();

        if (raidError) {
            console.error(`[Raid] Failed to insert raid:`, raidError.message);
            return;
        }

        // Update attacker stats
        if (attackerWon) {
            await supabase
                .from('agents')
                .update({ raid_wins: (attacker?.raid_wins ?? 0) + 1 })
                .eq('agent_id', attId);
        }

        // Update defender stats
        await supabase
            .from('agents')
            .update({ raid_losses: ((defender as any)?.raid_losses ?? 0) + 1 })
            .eq('agent_id', defId);

        // Grant XP via RPC created by Phase 6 (migration 003_xp_leveling.sql).
        // If Phase 6 is not yet deployed, these calls fail gracefully with a warning.
        if (attackerWon) {
            const attackerXpResult = await supabase.rpc('grant_xp', {
                p_agent_id: attId,
                p_source: 'raid_win',
                p_amount: XP_RAID_WIN_ATTACKER,
            });
            if (attackerXpResult.error) {
                console.warn(`[Raid] grant_xp not available for attacker ${attId} (Phase 6 dependency):`, attackerXpResult.error.message);
            }

            // Update raid_xp on attacker
            await supabase
                .from('agents')
                .update({ raid_xp: (attacker?.raid_xp ?? 0) + XP_RAID_WIN_ATTACKER })
                .eq('agent_id', attId);
        }

        // Defender always gets consolation XP
        const defenderXpResult = await supabase.rpc('grant_xp', {
            p_agent_id: defId,
            p_source: 'raid_loss',
            p_amount: XP_RAID_LOSS_DEFENDER,
        });
        if (defenderXpResult.error) {
            console.warn(`[Raid] grant_xp not available for defender ${defId} (Phase 6 dependency):`, defenderXpResult.error.message);
        }

        // Insert raid tag on loser's building (3-day expiry)
        if (attackerWon && raid?.id) {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + RAID_TAG_DURATION_DAYS);

            // Deactivate any existing active tag on the defender
            await supabase
                .from('raid_tags')
                .update({ active: false })
                .eq('agent_id', defId)
                .eq('active', true);

            await supabase.from('raid_tags').insert({
                raid_id: raid.id,
                agent_id: defId,
                attacker_id: attId,
                attacker_name: attacker?.name ?? `Agent #${attId}`,
                tag_style: 'default',
                active: true,
                expires_at: expiresAt.toISOString(),
            });
        }

        // Write feed events
        await feedWriter.writeRaid(attId, defId, attackerWon, xpReward);
    }

    return {
        handleRaidResult,
    };
}
```

**Step 2: Commit**

```bash
git add frontend/src/lib/indexer/handlers/raid.ts
git commit -m "feat: add RaidResult handler -- raids insert, XP grant, raid tags, feed events"
```

---

### Task 13: Catch-up logic -- queryFilter in chunks

**Files:**
- Create: `frontend/src/lib/indexer/catch-up.ts`

**Step 1: Write catch-up module**

Reference: Design doc Appendix I -- "fetches events from `last_block_number` to `latest` using `contract.queryFilter(event, fromBlock, toBlock)` in 1000-block chunks before switching to live `contract.on()` listener"

```typescript
// frontend/src/lib/indexer/catch-up.ts
import { ethers } from 'ethers';
import { BlockCursor } from './block-cursor';
import { CHUNK_SIZE } from './constants';

export interface CatchUpOptions {
    contract: ethers.Contract;
    cursor: BlockCursor;
    provider: ethers.providers.Provider;
    eventHandlers: Record<string, (...args: any[]) => Promise<void>>;
    contractName: string;
}

export async function catchUpFromLastBlock(options: CatchUpOptions): Promise<void> {
    const { contract, cursor, provider, eventHandlers, contractName } = options;

    const lastBlock = cursor.getLastBlock();
    const latestBlock = await provider.getBlockNumber();

    if (lastBlock >= latestBlock) {
        console.log(`[CatchUp] ${contractName}: already at block ${latestBlock}, no catch-up needed`);
        return;
    }

    const fromBlock = lastBlock + 1;
    const totalBlocks = latestBlock - fromBlock + 1;
    const totalChunks = Math.ceil(totalBlocks / CHUNK_SIZE);

    console.log(`[CatchUp] ${contractName}: catching up from block ${fromBlock} to ${latestBlock} (${totalBlocks} blocks, ${totalChunks} chunks)`);

    for (let chunkStart = fromBlock; chunkStart <= latestBlock; chunkStart += CHUNK_SIZE) {
        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE - 1, latestBlock);
        const chunkIndex = Math.floor((chunkStart - fromBlock) / CHUNK_SIZE) + 1;

        console.log(`[CatchUp] ${contractName}: chunk ${chunkIndex}/${totalChunks} (blocks ${chunkStart}-${chunkEnd})`);

        // Query all events for this contract in the chunk
        for (const [eventName, handler] of Object.entries(eventHandlers)) {
            try {
                const filter = contract.filters[eventName]();
                const events = await contract.queryFilter(filter, chunkStart, chunkEnd);

                for (const event of events) {
                    try {
                        const args = event.args ? [...event.args, event] : [event];
                        await handler(...args);
                    } catch (err) {
                        console.error(`[CatchUp] ${contractName}.${eventName} handler error at block ${event.blockNumber}:`, err);
                    }
                }

                if (events.length > 0) {
                    console.log(`[CatchUp] ${contractName}.${eventName}: processed ${events.length} events in chunk`);
                }
            } catch (err) {
                console.error(`[CatchUp] ${contractName}.${eventName} queryFilter error:`, err);
                // Continue to next event type -- don't fail the whole chunk
            }
        }

        // Persist cursor after each chunk
        await cursor.save(chunkEnd);
    }

    console.log(`[CatchUp] ${contractName}: catch-up complete at block ${latestBlock}`);
}
```

**Step 2: Commit**

```bash
git add frontend/src/lib/indexer/catch-up.ts
git commit -m "feat: add catch-up logic -- queryFilter in 1000-block chunks with cursor persistence"
```

---

### Task 14: Main indexer entry script

**Files:**
- Create: `frontend/scripts/run-indexer.ts`

**Step 1: Write the indexer entry script**

This is the standalone Node.js process that ties everything together: loads cursors, catches up, then switches to live `.on()` listeners.

Reference: Design doc Section 3.1 + 3.3 (Data Flow) + Appendix I

```typescript
// frontend/scripts/run-indexer.ts
import 'dotenv/config';
import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';
import { BlockCursor } from '../src/lib/indexer/block-cursor';
import { FeedWriter } from '../src/lib/indexer/feed-writer';
import { catchUpFromLastBlock } from '../src/lib/indexer/catch-up';
import { createCityStateHandlers } from '../src/lib/indexer/handlers/citystate';
import { createSprawlDEXHandlers } from '../src/lib/indexer/handlers/sprawldex';
import { createRaidHandlers } from '../src/lib/indexer/handlers/raid';
import { initTokenResolver } from '../src/lib/indexer/token-resolver';
import deployments from '../src/constants/deployments.json';

// ABI imports -- only the events we need
import CityStateABI from '../src/constants/abi/CityState.json';
import SprawlDEXABI from '../src/constants/abi/SprawlDEX.json';
import RaidContractABI from '../src/constants/abi/RaidContract.json';

// ── Config ────────────────────────────────────────────────────

const MANTLE_SEPOLIA_RPC = process.env.MANTLE_SEPOLIA_RPC_URL || 'https://rpc.sepolia.mantle.xyz';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('[Indexer] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

// ── Initialize ────────────────────────────────────────────────

const provider = new ethers.providers.StaticJsonRpcProvider(
    { url: MANTLE_SEPOLIA_RPC, skipFetchSetup: true },
    { chainId: 5003, name: 'mantle-sepolia' },
);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const feedWriter = new FeedWriter(supabase);

// Initialize token address -> symbol mapping
initTokenResolver();

// Contract instances (read-only, no signer needed for event listening)
const cityState = new ethers.Contract(
    deployments.CityState,
    CityStateABI.abi ?? CityStateABI,
    provider,
);

const sprawlDEX = new ethers.Contract(
    deployments.SprawlDEX,
    SprawlDEXABI.abi ?? SprawlDEXABI,
    provider,
);

// RaidContract: RaidResult event is emitted by RaidContract, NOT CityState.
const raidContract = new ethers.Contract(
    deployments.RaidContract,
    RaidContractABI.abi ?? RaidContractABI,
    provider,
);

// ── Block Cursors ─────────────────────────────────────────────

const cityStateCursor = new BlockCursor(supabase, 'CityState', deployments.CityState);
const dexCursor = new BlockCursor(supabase, 'SprawlDEX', deployments.SprawlDEX);
const raidCursor = new BlockCursor(supabase, 'RaidContract', deployments.RaidContract);

// ── Event Handlers ────────────────────────────────────────────

const cityStateHandlers = createCityStateHandlers(supabase, feedWriter);
const dexHandlers = createSprawlDEXHandlers(supabase, feedWriter);
const raidHandlers = createRaidHandlers(supabase, feedWriter);

// ── Main ──────────────────────────────────────────────────────

async function main() {
    console.log('[Indexer] Starting Sprawl Protocol indexer...');
    console.log(`[Indexer] RPC: ${MANTLE_SEPOLIA_RPC}`);
    console.log(`[Indexer] CityState: ${deployments.CityState}`);
    console.log(`[Indexer] SprawlDEX: ${deployments.SprawlDEX}`);
    console.log(`[Indexer] RaidContract: ${deployments.RaidContract}`);

    const currentBlock = await provider.getBlockNumber();
    console.log(`[Indexer] Current block: ${currentBlock}`);

    // Load cursors
    await cityStateCursor.load();
    await dexCursor.load();
    await raidCursor.load();

    console.log(`[Indexer] CityState cursor: block ${cityStateCursor.getLastBlock()}`);
    console.log(`[Indexer] SprawlDEX cursor: block ${dexCursor.getLastBlock()}`);
    console.log(`[Indexer] RaidContract cursor: block ${raidCursor.getLastBlock()}`);

    // ── Phase 1: Catch-up ─────────────────────────────────────
    console.log('[Indexer] Phase 1: Catching up from last processed block...');

    await catchUpFromLastBlock({
        contract: cityState,
        cursor: cityStateCursor,
        provider,
        contractName: 'CityState',
        eventHandlers: {
            AgentSpawned: cityStateHandlers.handleAgentSpawned,
            AgentOutcome: cityStateHandlers.handleAgentOutcome,
            BuildingGrew: cityStateHandlers.handleBuildingGrew,
        },
    });

    await catchUpFromLastBlock({
        contract: sprawlDEX,
        cursor: dexCursor,
        provider,
        contractName: 'SprawlDEX',
        eventHandlers: {
            Swap: dexHandlers.handleSwap,
            LiquidityAdded: dexHandlers.handleLiquidityAdded,
            LiquidityRemoved: dexHandlers.handleLiquidityRemoved,
        },
    });

    await catchUpFromLastBlock({
        contract: raidContract,
        cursor: raidCursor,
        provider,
        contractName: 'RaidContract',
        eventHandlers: {
            RaidResult: raidHandlers.handleRaidResult,
        },
    });

    console.log('[Indexer] Catch-up complete.');

    // ── Phase 2: Live listeners ───────────────────────────────
    console.log('[Indexer] Phase 2: Switching to live event listeners...');

    // CityState live listeners
    cityState.on('AgentSpawned', async (...args: any[]) => {
        try {
            await cityStateHandlers.handleAgentSpawned(...args);
            const event = args[args.length - 1] as ethers.Event;
            await cityStateCursor.save(event.blockNumber);
        } catch (err) {
            console.error('[Indexer] AgentSpawned live handler error:', err);
        }
    });

    cityState.on('AgentOutcome', async (...args: any[]) => {
        try {
            await cityStateHandlers.handleAgentOutcome(...args);
            const event = args[args.length - 1] as ethers.Event;
            await cityStateCursor.save(event.blockNumber);
        } catch (err) {
            console.error('[Indexer] AgentOutcome live handler error:', err);
        }
    });

    cityState.on('BuildingGrew', async (...args: any[]) => {
        try {
            await cityStateHandlers.handleBuildingGrew(...args);
            const event = args[args.length - 1] as ethers.Event;
            await cityStateCursor.save(event.blockNumber);
        } catch (err) {
            console.error('[Indexer] BuildingGrew live handler error:', err);
        }
    });

    // RaidContract live listeners
    raidContract.on('RaidResult', async (...args: any[]) => {
        try {
            await raidHandlers.handleRaidResult(...args);
            const event = args[args.length - 1] as ethers.Event;
            await raidCursor.save(event.blockNumber);
        } catch (err) {
            console.error('[Indexer] RaidResult live handler error:', err);
        }
    });

    // SprawlDEX live listeners
    sprawlDEX.on('Swap', async (...args: any[]) => {
        try {
            await dexHandlers.handleSwap(...args);
            const event = args[args.length - 1] as ethers.Event;
            await dexCursor.save(event.blockNumber);
        } catch (err) {
            console.error('[Indexer] Swap live handler error:', err);
        }
    });

    sprawlDEX.on('LiquidityAdded', async (...args: any[]) => {
        try {
            await dexHandlers.handleLiquidityAdded(...args);
            const event = args[args.length - 1] as ethers.Event;
            await dexCursor.save(event.blockNumber);
        } catch (err) {
            console.error('[Indexer] LiquidityAdded live handler error:', err);
        }
    });

    sprawlDEX.on('LiquidityRemoved', async (...args: any[]) => {
        try {
            await dexHandlers.handleLiquidityRemoved(...args);
            const event = args[args.length - 1] as ethers.Event;
            await dexCursor.save(event.blockNumber);
        } catch (err) {
            console.error('[Indexer] LiquidityRemoved live handler error:', err);
        }
    });

    console.log('[Indexer] Live listeners active. Watching for events...');

    // ── Heartbeat ─────────────────────────────────────────────
    setInterval(async () => {
        try {
            const block = await provider.getBlockNumber();
            console.log(`[Indexer] Heartbeat: block ${block}, CityState cursor: ${cityStateCursor.getLastBlock()}, DEX cursor: ${dexCursor.getLastBlock()}, Raid cursor: ${raidCursor.getLastBlock()}`);
        } catch (err) {
            console.error('[Indexer] Heartbeat RPC check failed:', err);
        }
    }, 60_000);

    // ── Raid tag expiry cleanup ───────────────────────────────
    setInterval(async () => {
        try {
            const { data, error } = await supabase
                .from('raid_tags')
                .update({ active: false })
                .eq('active', true)
                .lt('expires_at', new Date().toISOString())
                .select('id');

            if (data && data.length > 0) {
                console.log(`[Indexer] Expired ${data.length} raid tags`);
            }
        } catch (err) {
            console.error('[Indexer] Raid tag cleanup error:', err);
        }
    }, 300_000); // Every 5 minutes
}

// ── Graceful shutdown ─────────────────────────────────────────

function shutdown() {
    console.log('[Indexer] Shutting down...');
    cityState.removeAllListeners();
    sprawlDEX.removeAllListeners();
    raidContract.removeAllListeners();
    feedWriter.destroy();
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
    console.error('[Indexer] Fatal error:', err);
    process.exit(1);
});
```

**Step 2: Add run script to package.json**

In `frontend/package.json`, add to the `"scripts"` section:

```json
{
    "scripts": {
        "indexer": "tsx scripts/run-indexer.ts",
        "indexer:watch": "tsx watch scripts/run-indexer.ts"
    }
}
```

**Step 3: Install tsx if not already present**

```bash
cd frontend && npm install --save-dev tsx
```

**Step 4: Run the indexer (manual test)**

```bash
cd frontend && npm run indexer
```

Expected: Indexer starts, catches up from block 0 (first run), then prints heartbeat every 60 seconds.

**Step 5: Commit**

```bash
git add frontend/scripts/run-indexer.ts frontend/package.json
git commit -m "feat: add run-indexer.ts entry script with catch-up + live listeners"
```

---

### Task 15: Supabase helper -- increment_weekly_volume RPC

**Files:**
- Create: `frontend/supabase/migrations/028_weekly_volume_rpc.sql`

**Step 1: Write the RPC function**

The SprawlDEX swap handler calls this to atomically increment the weekly rolling volume for an agent.

```sql
-- ============================================================
-- 028: Weekly Volume RPC
-- Atomically increments an agent's weekly_volume.
-- Called by the indexer on every agent swap.
-- ============================================================

CREATE OR REPLACE FUNCTION increment_weekly_volume(
    p_agent_id integer,
    p_amount text       -- passed as text because BigInt doesn't fit in integer
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_week_start date := date_trunc('week', CURRENT_DATE)::date;
BEGIN
    -- Reset if it's a new week
    UPDATE agents
    SET weekly_volume = 0, weekly_start_date = v_week_start
    WHERE agent_id = p_agent_id
      AND (weekly_start_date IS NULL OR weekly_start_date < v_week_start);

    -- Increment
    UPDATE agents
    SET weekly_volume = weekly_volume + p_amount::bigint
    WHERE agent_id = p_agent_id;
END;
$$;

-- Increment recent_actions counter (called by indexer after any agent action)
CREATE OR REPLACE FUNCTION increment_recent_actions(
    p_agent_id integer
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    UPDATE agents
    SET recent_actions = recent_actions + 1,
        last_action_at = NOW()
    WHERE agent_id = p_agent_id;
END;
$$;
```

**Step 2: Run migration**

```bash
cd frontend && npx supabase db push
```

**Step 3: Commit**

```bash
git add frontend/supabase/migrations/028_weekly_volume_rpc.sql
git commit -m "feat: add increment_weekly_volume + increment_recent_actions RPCs"
```

---

### Task 16: Environment variables documentation

**Files:**
- Create: `frontend/.env.example` (append indexer-specific vars)

**Step 1: Add indexer env vars to .env.example**

Append the following to the existing `frontend/.env.example`:

```
# ── Indexer ────────────────────────────────────────────────────
# Mantle Sepolia RPC (used by indexer + engine)
MANTLE_SEPOLIA_RPC_URL=https://rpc.sepolia.mantle.xyz

# Supabase service role key (bypasses RLS for indexer writes)
# Get from: Supabase Dashboard → Settings → API → service_role
SUPABASE_SERVICE_ROLE_KEY=

# Supabase public URL (also used by frontend)
NEXT_PUBLIC_SUPABASE_URL=

# Backend encryption key for agent_wallets (AES-256-GCM)
BACKEND_ENCRYPTION_KEY=
```

**Step 2: Commit**

```bash
git add frontend/.env.example
git commit -m "chore: add indexer env vars to .env.example"
```

---

### Task 17: Re-export barrel file for indexer

**Files:**
- Create: `frontend/src/lib/indexer/index.ts`

**Step 1: Write barrel export**

Clean public API for the indexer module.

```typescript
// frontend/src/lib/indexer/index.ts
export { BlockCursor } from './block-cursor';
export { FeedWriter } from './feed-writer';
export { catchUpFromLastBlock } from './catch-up';
export { initTokenResolver, addressToSymbol, symbolToAddress } from './token-resolver';
export { createCityStateHandlers } from './handlers/citystate';
export { createSprawlDEXHandlers } from './handlers/sprawldex';
export { createRaidHandlers } from './handlers/raid';
export { CHUNK_SIZE, REALTIME_CHANNEL, XP_RAID_WIN_ATTACKER, XP_RAID_LOSS_DEFENDER, RAID_TAG_DURATION_DAYS } from './constants';
export type { IndexerState, FeedEvent, SwapEventArgs, AgentSpawnedArgs, AgentOutcomeArgs, RaidResultArgs, BuildingGrewArgs } from './types';
```

**Step 2: Commit**

```bash
git add frontend/src/lib/indexer/index.ts
git commit -m "feat: add indexer barrel export"
```

---

## Summary: What Phase 3 Delivers

After completing all 17 tasks:

- [x] `indexer_state` table for block cursor persistence (resume from last processed block)
- ~~`activity_feed` table~~ REMOVED -- Phase 2 owns this table (migration 006). FeedWriter INSERTs using Phase 2's schema.
- [x] `raids` + `raid_tags` tables adapted from git-city
- ~~`xp_log` table + `grant_xp` RPC~~ REMOVED -- Phase 6 owns XP/leveling (migration 003). Phase 3's indexer calls Phase 6's `grant_xp` RPC.
- [x] Missing `agents` columns (weekly_volume, profit_streak, etc.) + `agent_wallets` table + RLS policies
- [x] `BlockCursor` class -- loads from / saves to `indexer_state`, per-contract tracking
- [x] `FeedWriter` class -- simultaneous Supabase insert + Realtime broadcast (PetSupervisor pattern)
- [x] Token address resolver (deployed address -> human symbol mapping)
- [x] CityState handlers: `AgentSpawned` -> insert agents row, `AgentOutcome` -> update stats, `BuildingGrew` -> feed event
- [x] SprawlDEX handlers: `Swap` -> insert `trade_history` + update `agents.total_volume` + feed event, `LiquidityAdded/Removed` -> trade_history + feed
- [x] Raid handler: `RaidResult` (on RaidContract, not CityState) -> insert raids row + grant XP via Phase 6 RPC + insert raid_tags + feed events
- [x] Catch-up logic: `queryFilter` in 1000-block chunks from `last_block` to `latest`, then live `.on()` listeners
- [x] `run-indexer.ts` entry script -- standalone Node.js process with catch-up -> live -> heartbeat -> raid tag expiry cleanup
- [x] `increment_weekly_volume` + `increment_recent_actions` RPCs for atomic stat updates
- [x] Environment variable documentation for indexer-specific config

**Data flow after Phase 3:**

```
Mantle Sepolia Events (CityState + SprawlDEX + RaidContract)
    -> run-indexer.ts (ethers.Contract.on / queryFilter)
        -> Supabase Postgres (agents, trade_history, raids, raid_tags, activity_feed, xp_log)
        -> Supabase Realtime broadcast (city-feed channel)
            -> Frontend subscribes (Phase 4)
```

**Next phase:** Phase 4 (3D City Frontend) -- git-city fork rendering from Supabase, SIWE auth, decision feed overlay, building inspector.
