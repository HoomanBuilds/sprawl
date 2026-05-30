# Phase 5: Agent Spawning + Policy Editor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

> **Wallet creation consistency note:** The spawn route (`POST /api/agent/spawn`) in this phase is the CANONICAL wallet creation path. It generates a new `ethers.Wallet.createRandom()`, encrypts the private key with AES-256-GCM, and stores it in `agent_wallets`. Phase 2's wallet-manager (`frontend/src/lib/wallet-manager.ts`) is a recovery helper only — it reads existing wallets from the `agent_wallets` table and decrypts them for the engine tick loop. It does NOT create new wallets.

**Goal:** Build the complete agent spawning flow (wallet creation, on-chain registration, token funding) and the policy editor UI (strategy presets + custom rule builder). After this phase, a user can connect their wallet, spawn an autonomous agent with a chosen strategy, and customize its trading rules.

**Architecture:** Next.js 16 API routes handle spawn orchestration (SIWE auth, wallet creation, on-chain calls). Frontend pages provide the spawn form and policy editor. Agent wallets are AES-256-GCM encrypted in Supabase `agent_wallets` table. All on-chain calls use ethers v5.

**Tech Stack:** Next.js 16, ethers v5, Supabase, Zod, AES-256-GCM encryption, RainbowKit/Wagmi (SIWE), React

**Design doc reference:** `docs/plans/2026-05-30-sprawl-protocol-implementation-plan.md` — Sections 5.1-5.3, Appendix B.6, Appendix H

---

### Task 1: Supabase migration for `agent_wallets` table

**Files:**
- Create: `frontend/supabase/migrations/030_agent_wallets.sql`

**Step 1: Write the migration**

Reference: Design doc Appendix B.6

```sql
-- agent_wallets: encrypted private keys for agent server wallets
-- NEVER readable from the browser. Only accessed via getSupabaseAdmin()

CREATE TABLE agent_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER UNIQUE REFERENCES agents(agent_id),
    encrypted_private_key TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    wallet_address TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_wallets_agent_id ON agent_wallets(agent_id);
CREATE INDEX idx_agent_wallets_address ON agent_wallets(wallet_address);

ALTER TABLE agent_wallets ENABLE ROW LEVEL SECURITY;
-- No policies = zero browser access. Only service role key can read/write.
```

**Step 2: Apply migration**

```bash
cd frontend && npx supabase db push
```

**Step 3: Commit**

```bash
git add frontend/supabase/migrations/030_agent_wallets.sql
git commit -m "feat: add agent_wallets table with RLS lockdown"
```

---

### Task 2: Wallet encryption utilities

**Files:**
- Create: `frontend/src/lib/crypto.ts`

**Step 1: Write AES-256-GCM encrypt/decrypt helpers**

```typescript
// frontend/src/lib/crypto.ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
    const key = process.env.BACKEND_ENCRYPTION_KEY;
    if (!key) throw new Error('BACKEND_ENCRYPTION_KEY not set');
    return crypto.createHash('sha256').update(key).digest();
}

export function encryptPrivateKey(privateKey: string): {
    encrypted: string;
    iv: string;
    authTag: string;
} {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
    };
}

export function decryptPrivateKey(encrypted: string, iv: string, authTag: string): string {
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
```

**Step 2: Add env var to `.env.example`**

```
BACKEND_ENCRYPTION_KEY=your-random-32-char-string-here
```

**Step 3: Commit**

```bash
git add frontend/src/lib/crypto.ts
git commit -m "feat: add AES-256-GCM encrypt/decrypt for agent private keys"
```

---

### Task 3: SIWE session helper

**Files:**
- Create: `frontend/src/lib/auth.ts`

**Step 1: Write session extraction helper**

Reference: `inspiration/signatory/frontend/src/app/api/auth/session/route.ts`

```typescript
// frontend/src/lib/auth.ts
import { cookies } from 'next/headers';

export interface SIWESession {
    address: string;
    chainId: number;
    issuedAt: string;
}

export async function getSession(): Promise<SIWESession | null> {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('siwe_session')?.value;
    if (!sessionCookie) return null;

    try {
        const data: SIWESession = JSON.parse(
            Buffer.from(sessionCookie, 'base64').toString('utf-8')
        );
        return data;
    } catch {
        return null;
    }
}

export async function requireAuth(): Promise<SIWESession> {
    const session = await getSession();
    if (!session) throw new Error('Unauthorized');
    return session;
}
```

**Step 2: Commit**

```bash
git add frontend/src/lib/auth.ts
git commit -m "feat: add SIWE session helper for API route auth"
```

---

### Task 4: Agent policy types + Zod validation schema

**Files:**
- Create: `frontend/src/lib/policy-schema.ts`

**Step 1: Write Zod schema for AgentPolicy**

Reference: Design doc Section 5.3, Appendix H

```typescript
// frontend/src/lib/policy-schema.ts
import { z } from 'zod';

export const CONDITION_FIELDS = [
    'portfolio.totalValueUSD',
    'portfolio.holdings.sETH',
    'portfolio.holdings.sBTC',
    'portfolio.holdings.sPOL',
    'portfolio.holdings.sSOL',
    'portfolio.holdings.sUSDC',
    'portfolio.holdings.SPRAWL',
    'portfolio.unrealizedPnl',
    'portfolio.sprawlBalance',
    'market.price.sETH',
    'market.price.sBTC',
    'market.price.sPOL',
    'market.price.sSOL',
    'market.priceChange1h.sETH',
    'market.priceChange1h.sBTC',
    'market.priceChange1h.sPOL',
    'market.priceChange1h.sSOL',
    'market.priceChange24h.sETH',
    'market.priceChange24h.sBTC',
    'market.priceChange24h.sPOL',
    'market.priceChange24h.sSOL',
    'market.pool.sETH_sUSDC.apr',
    'market.pool.sBTC_sUSDC.apr',
    'market.pool.sPOL_sUSDC.apr',
    'market.pool.sSOL_sUSDC.apr',
    'market.pool.SPRAWL_sUSDC.apr',
    'market.pool.sETH_sUSDC.tvl',
    'market.pool.sBTC_sUSDC.tvl',
    'agent.level',
    'agent.raidWins',
    'agent.profitStreak',
] as const;

export const OPERATORS = ['>', '<', '==', '!='] as const;

export const ACTIONS = [
    'swap',
    'provideLiquidity',
    'removeLiquidity',
    'hold',
    'raid',
] as const;

export const PROTOCOLS = ['SprawlDEX'] as const;

export const PolicyRuleSchema = z.object({
    name: z.string().min(1).max(64),
    condition: z.object({
        field: z.string().min(1),
        operator: z.enum(OPERATORS),
        value: z.union([z.number(), z.string()]),
    }),
    action: z.enum(ACTIONS),
    protocol: z.string().default('SprawlDEX'),
    params: z.record(z.any()).default({}),
});

export const AgentPolicySchema = z.object({
    rules: z.array(PolicyRuleSchema).min(0).max(5),
    riskTolerance: z.enum(['low', 'medium', 'high']),
    maxPositionSize: z.number().min(1).max(100),
    maxSlippageBps: z.number().min(10).max(500),
    allowedProtocols: z.array(z.string()).min(1),
});

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;
export type AgentPolicy = z.infer<typeof AgentPolicySchema>;
```

**Step 2: Commit**

```bash
git add frontend/src/lib/policy-schema.ts
git commit -m "feat: add Zod schema for AgentPolicy with condition fields and actions"
```

---

### Task 5: Strategy presets

**Files:**
- Create: `frontend/src/lib/strategy-presets.ts`

**Step 1: Write the 5 strategy presets**

Reference: Design doc Section 5.2

```typescript
// frontend/src/lib/strategy-presets.ts
import { AgentPolicy } from './policy-schema';

export interface StrategyPreset {
    id: string;
    name: string;
    description: string;
    risk: 'low' | 'medium' | 'high';
    icon: string;
    policy: AgentPolicy;
}

export const STRATEGY_PRESETS: StrategyPreset[] = [
    {
        id: 'conservative-yield',
        name: 'Conservative Yield',
        description: 'Farm highest-APR stable pools, rebalance when APR drops. Low risk, steady returns.',
        risk: 'low',
        icon: '🛡️',
        policy: {
            rules: [
                {
                    name: 'Enter high APR pool',
                    condition: { field: 'market.pool.sETH_sUSDC.apr', operator: '>', value: 10 },
                    action: 'provideLiquidity',
                    protocol: 'SprawlDEX',
                    params: { tokenA: 'sETH', tokenB: 'sUSDC', amountPercent: 20 },
                },
                {
                    name: 'Exit low APR pool',
                    condition: { field: 'market.pool.sETH_sUSDC.apr', operator: '<', value: 5 },
                    action: 'removeLiquidity',
                    protocol: 'SprawlDEX',
                    params: { tokenA: 'sETH', tokenB: 'sUSDC', percentToRemove: 100 },
                },
                {
                    name: 'Hold when uncertain',
                    condition: { field: 'portfolio.totalValueUSD', operator: '>', value: 0 },
                    action: 'hold',
                    protocol: 'SprawlDEX',
                    params: {},
                },
            ],
            riskTolerance: 'low',
            maxPositionSize: 25,
            maxSlippageBps: 50,
            allowedProtocols: ['SprawlDEX'],
        },
    },
    {
        id: 'momentum-trader',
        name: 'Momentum Trader',
        description: 'Buy tokens with strong upward momentum, sell after 10% gain or 5% loss.',
        risk: 'medium',
        icon: '📈',
        policy: {
            rules: [
                {
                    name: 'Buy sETH on momentum',
                    condition: { field: 'market.priceChange1h.sETH', operator: '>', value: 0.03 },
                    action: 'swap',
                    protocol: 'SprawlDEX',
                    params: { tokenIn: 'sUSDC', tokenOut: 'sETH', amountPercent: 15 },
                },
                {
                    name: 'Buy sBTC on momentum',
                    condition: { field: 'market.priceChange1h.sBTC', operator: '>', value: 0.03 },
                    action: 'swap',
                    protocol: 'SprawlDEX',
                    params: { tokenIn: 'sUSDC', tokenOut: 'sBTC', amountPercent: 15 },
                },
                {
                    name: 'Sell on drawdown',
                    condition: { field: 'portfolio.unrealizedPnl', operator: '<', value: -250 },
                    action: 'swap',
                    protocol: 'SprawlDEX',
                    params: { tokenIn: 'sETH', tokenOut: 'sUSDC', amountPercent: 100 },
                },
            ],
            riskTolerance: 'medium',
            maxPositionSize: 40,
            maxSlippageBps: 100,
            allowedProtocols: ['SprawlDEX'],
        },
    },
    {
        id: 'arbitrage-hunter',
        name: 'Arbitrage Hunter',
        description: 'Monitor price discrepancies across pools, execute when spread exceeds 0.5%.',
        risk: 'medium',
        icon: '🔍',
        policy: {
            rules: [
                {
                    name: 'Arb sETH price gap',
                    condition: { field: 'market.priceChange1h.sETH', operator: '>', value: 0.005 },
                    action: 'swap',
                    protocol: 'SprawlDEX',
                    params: { tokenIn: 'sUSDC', tokenOut: 'sETH', amountPercent: 30 },
                },
                {
                    name: 'Reverse arb sETH',
                    condition: { field: 'market.priceChange1h.sETH', operator: '<', value: -0.005 },
                    action: 'swap',
                    protocol: 'SprawlDEX',
                    params: { tokenIn: 'sETH', tokenOut: 'sUSDC', amountPercent: 30 },
                },
                {
                    name: 'Provide LP during calm',
                    condition: { field: 'market.pool.sETH_sUSDC.apr', operator: '>', value: 8 },
                    action: 'provideLiquidity',
                    protocol: 'SprawlDEX',
                    params: { tokenA: 'sETH', tokenB: 'sUSDC', amountPercent: 15 },
                },
            ],
            riskTolerance: 'medium',
            maxPositionSize: 35,
            maxSlippageBps: 30,
            allowedProtocols: ['SprawlDEX'],
        },
    },
    {
        id: 'aggressive-degen',
        name: 'Aggressive Degen',
        description: 'Chase high-APR pools, max allocation, frequent rebalances. High risk, high reward.',
        risk: 'high',
        icon: '🔥',
        policy: {
            rules: [
                {
                    name: 'Ape into high APR',
                    condition: { field: 'market.pool.sETH_sUSDC.apr', operator: '>', value: 15 },
                    action: 'provideLiquidity',
                    protocol: 'SprawlDEX',
                    params: { tokenA: 'sETH', tokenB: 'sUSDC', amountPercent: 40 },
                },
                {
                    name: 'Momentum buy any spike',
                    condition: { field: 'market.priceChange1h.sSOL', operator: '>', value: 0.02 },
                    action: 'swap',
                    protocol: 'SprawlDEX',
                    params: { tokenIn: 'sUSDC', tokenOut: 'sSOL', amountPercent: 25 },
                },
                {
                    name: 'Raid when strong',
                    condition: { field: 'agent.profitStreak', operator: '>', value: 3 },
                    action: 'raid',
                    protocol: 'SprawlDEX',
                    params: { targetAgentId: 0 },
                },
            ],
            riskTolerance: 'high',
            maxPositionSize: 60,
            maxSlippageBps: 200,
            allowedProtocols: ['SprawlDEX'],
        },
    },
    {
        id: 'balanced-defi',
        name: 'Balanced DeFi',
        description: '50% yield farming, 30% swing trades, 20% liquidity provision. Well-rounded strategy.',
        risk: 'medium',
        icon: '⚖️',
        policy: {
            rules: [
                {
                    name: 'LP when APR attractive',
                    condition: { field: 'market.pool.sETH_sUSDC.apr', operator: '>', value: 8 },
                    action: 'provideLiquidity',
                    protocol: 'SprawlDEX',
                    params: { tokenA: 'sETH', tokenB: 'sUSDC', amountPercent: 20 },
                },
                {
                    name: 'Buy dip sETH',
                    condition: { field: 'market.priceChange24h.sETH', operator: '<', value: -0.05 },
                    action: 'swap',
                    protocol: 'SprawlDEX',
                    params: { tokenIn: 'sUSDC', tokenOut: 'sETH', amountPercent: 15 },
                },
                {
                    name: 'Sell rally sETH',
                    condition: { field: 'market.priceChange24h.sETH', operator: '>', value: 0.08 },
                    action: 'swap',
                    protocol: 'SprawlDEX',
                    params: { tokenIn: 'sETH', tokenOut: 'sUSDC', amountPercent: 30 },
                },
                {
                    name: 'Diversify into sBTC',
                    condition: { field: 'portfolio.holdings.sBTC', operator: '<', value: 0.01 },
                    action: 'swap',
                    protocol: 'SprawlDEX',
                    params: { tokenIn: 'sUSDC', tokenOut: 'sBTC', amountPercent: 10 },
                },
            ],
            riskTolerance: 'medium',
            maxPositionSize: 30,
            maxSlippageBps: 100,
            allowedProtocols: ['SprawlDEX'],
        },
    },
];
```

**Step 2: Commit**

```bash
git add frontend/src/lib/strategy-presets.ts
git commit -m "feat: add 5 strategy presets with pre-built AgentPolicy configs"
```

---

### Task 6: POST /api/agent/spawn route

**Files:**
- Create: `frontend/src/app/api/agent/spawn/route.ts`

**Step 1: Write the spawn API route**

Reference: Design doc Section 5.1, Appendix B (spawn flow). Registration from `inspiration/erc-8004-tee-agent/src/agent/registry.py:327-406`. SIWE auth from `inspiration/signatory/frontend/src/app/api/auth/verify/route.ts`.

```typescript
// frontend/src/app/api/agent/spawn/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { requireAuth } from '@/lib/auth';
import { encryptPrivateKey } from '@/lib/crypto';
import { AgentPolicySchema, AgentPolicy } from '@/lib/policy-schema';
import { getMantleSepoliaProvider, getDeployerWallet } from '@/lib/ethers-provider';
import { CONTRACTS, ERC8004 } from '@/lib/config';
import { getSupabaseAdmin } from '@/lib/supabase';
import { withTxLock } from '@/lib/execution/tx-lock';
import { CityStateABI } from '@/constants/abis';
import { AgentFaucetABI } from '@/constants/abis';

const IDENTITY_REGISTRY_ABI = [
    'function register(string calldata tokenURI) external returns (uint256)',
    'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

export async function POST(req: NextRequest) {
    try {
        const session = await requireAuth();
        const body = await req.json();

        const { name, strategyType, policy } = body as {
            name: string;
            strategyType: 0 | 1 | 2;
            policy: AgentPolicy;
        };

        // Validate inputs
        if (!name || name.length < 2 || name.length > 32) {
            return NextResponse.json({ error: 'Name must be 2-32 characters' }, { status: 400 });
        }

        if (![0, 1, 2].includes(strategyType)) {
            return NextResponse.json({ error: 'Invalid strategy type' }, { status: 400 });
        }

        const policyResult = AgentPolicySchema.safeParse(policy);
        if (!policyResult.success) {
            return NextResponse.json(
                { error: 'Invalid policy', details: policyResult.error.flatten() },
                { status: 400 }
            );
        }

        const supabase = getSupabaseAdmin();

        // Check if user already has max agents (limit: 3 per owner)
        const { count } = await supabase
            .from('agents')
            .select('*', { count: 'exact', head: true })
            .eq('owner_address', session.address);

        if ((count ?? 0) >= 3) {
            return NextResponse.json(
                { error: 'Maximum 3 agents per wallet' },
                { status: 429 }
            );
        }

        // 1. Create agent wallet (ethers.Wallet.createRandom)
        const agentWallet = ethers.Wallet.createRandom();
        const agentAddress = agentWallet.address;
        const agentPrivateKey = agentWallet.privateKey;

        // 2. Encrypt private key (AES-256-GCM)
        const { encrypted, iv, authTag } = encryptPrivateKey(agentPrivateKey);

        // 3. Insert agent record into Supabase
        const { data: agentRow, error: insertError } = await supabase
            .from('agents')
            .insert({
                wallet_address: agentAddress,
                owner_address: session.address,
                name,
                persona: `Autonomous DeFi agent "${name}" spawned by ${session.address}`,
                strategy_type: strategyType,
                policy_config: policyResult.data,
                sprawl_balance: 0,
                sprawl_lifetime_earned: 0,
                sprawl_lifetime_spent: 0,
                last_portfolio_value: 10000,
                total_volume: 0,
                strategy_count: policyResult.data.rules.length,
                recent_actions: 0,
                reputation_score: 0,
                xp_total: 0,
                xp_level: 1,
                xp_daily: 0,
                raid_xp: 0,
                raid_wins: 0,
                raid_losses: 0,
                app_streak: 0,
                weekly_volume: 0,
                profit_streak: 0,
                reputation_given: 0,
                poignancy_accumulator: 0,
                district: 'general',
                net_pnl: 0,
            })
            .select('agent_id')
            .single();

        if (insertError || !agentRow) {
            console.error('Failed to insert agent:', insertError);
            return NextResponse.json({ error: 'Failed to create agent record' }, { status: 500 });
        }

        const agentId = agentRow.agent_id;

        // 4. Store encrypted private key in agent_wallets
        const { error: walletError } = await supabase.from('agent_wallets').insert({
            agent_id: agentId,
            encrypted_private_key: encrypted,
            iv,
            auth_tag: authTag,
            wallet_address: agentAddress,
        });

        if (walletError) {
            console.error('Failed to store wallet:', walletError);
            await supabase.from('agents').delete().eq('agent_id', agentId);
            return NextResponse.json({ error: 'Failed to store agent wallet' }, { status: 500 });
        }

        // 5. On-chain operations (tx-locked to prevent nonce collisions)
        const provider = getMantleSepoliaProvider();
        const deployer = getDeployerWallet();

        let erc8004TokenId: number | null = null;

        try {
            await withTxLock(async () => {
                // 5a. Fund agent wallet via AgentFaucet
                const faucet = new ethers.Contract(CONTRACTS.AgentFaucet, AgentFaucetABI, deployer);
                const fundTx = await faucet.fundNewAgent(agentAddress);
                await fundTx.wait();

                // 5b. Register with ERC-8004 IdentityRegistry
                // The deployer registers on behalf of the agent, pointing tokenURI to our API
                const agentURI = `${process.env.NEXT_PUBLIC_APP_URL || 'https://sprawl.vercel.app'}/api/agent/${agentId}/registration.json`;
                const registry = new ethers.Contract(
                    ERC8004.IdentityRegistry,
                    IDENTITY_REGISTRY_ABI,
                    deployer
                );
                const registerTx = await registry.register(agentURI);
                const registerReceipt = await registerTx.wait();

                // Parse Transfer event to get tokenId (topics[3])
                for (const log of registerReceipt.logs) {
                    if (log.topics.length >= 4) {
                        erc8004TokenId = parseInt(log.topics[3], 16);
                        break;
                    }
                }

                // 5c. Register in CityState
                const cityState = new ethers.Contract(CONTRACTS.CityState, CityStateABI, deployer);
                const spawnTx = await cityState.spawnAgent(agentId, agentAddress, strategyType);
                await spawnTx.wait();
            });
        } catch (chainError: any) {
            console.error('On-chain spawn failed:', chainError);
            // Agent record exists but chain registration incomplete
            // Mark agent as pending so it can be retried
            await supabase
                .from('agents')
                .update({ district: 'pending' })
                .eq('agent_id', agentId);

            return NextResponse.json(
                {
                    error: 'On-chain registration partially failed. Agent created but pending chain confirmation.',
                    agentId,
                    retryable: true,
                },
                { status: 502 }
            );
        }

        // 6. Update agent record with ERC-8004 token ID
        if (erc8004TokenId !== null) {
            await supabase
                .from('agents')
                .update({ erc8004_token_id: erc8004TokenId })
                .eq('agent_id', agentId);
        }

        // 7. Insert activity feed event
        await supabase.from('activity_feed').insert({
            event_type: 'spawn',
            actor_id: agentId,
            metadata: {
                name,
                strategy_type: strategyType,
                owner: session.address,
                wallet: agentAddress,
                erc8004_token_id: erc8004TokenId,
            },
        });

        return NextResponse.json({
            ok: true,
            agentId,
            walletAddress: agentAddress,
            erc8004TokenId,
            strategyType,
            name,
        });
    } catch (error: any) {
        console.error('Spawn error:', error);
        if (error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Connect wallet first' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
```

**Step 2: Commit**

```bash
git add frontend/src/app/api/agent/spawn/route.ts
git commit -m "feat: add POST /api/agent/spawn with wallet creation, encryption, and on-chain registration"
```

---

### Task 7: GET /api/agent/[agentId]/registration.json route

**Files:**
- Create: `frontend/src/app/api/agent/[agentId]/registration.json/route.ts`

**Step 1: Write the ERC-8004 agent card endpoint**

Reference: `inspiration/erc-8004-tee-agent/src/agent/agent_card.py:422-610`. Design doc Appendix K.

```typescript
// frontend/src/app/api/agent/[agentId]/registration.json/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { ERC8004, MANTLE_SEPOLIA_CHAIN_ID } from '@/lib/config';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ agentId: string }> }
) {
    const { agentId } = await params;
    const id = parseInt(agentId, 10);

    if (isNaN(id) || id < 1) {
        return NextResponse.json({ error: 'Invalid agent ID' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: agent, error } = await supabase
        .from('agents')
        .select('agent_id, name, persona, wallet_address, owner_address, strategy_type, xp_level, reputation_score, total_volume, net_pnl, raid_wins, created_at, erc8004_token_id')
        .eq('agent_id', id)
        .single();

    if (error || !agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sprawl.vercel.app';
    const strategyLabel = ['Preset', 'Rules', 'LLM'][agent.strategy_type] || 'Unknown';

    const card = {
        type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
        name: agent.name,
        description: `Autonomous DeFi agent in The Sprawl. Strategy: ${strategyLabel}. Level ${agent.xp_level}. ${agent.total_volume > 0 ? `Total volume: $${Math.round(agent.total_volume).toLocaleString()}` : 'Newly spawned.'}`,
        image: `${appUrl}/api/share-card/${agent.agent_id}`,
        endpoints: [
            {
                name: 'A2A',
                endpoint: `${appUrl}/api/agent/${agent.agent_id}/registration.json`,
                version: '0.3.0',
            },
            {
                name: 'agentWallet',
                endpoint: `eip155:${MANTLE_SEPOLIA_CHAIN_ID}:${agent.wallet_address}`,
            },
        ],
        supportedTrust: ['reputation'],
        registrations: agent.erc8004_token_id
            ? [
                  {
                      agentId: agent.erc8004_token_id,
                      agentRegistry: `eip155:${MANTLE_SEPOLIA_CHAIN_ID}:${ERC8004.IdentityRegistry}`,
                  },
              ]
            : [],
        reputation: {
            feedbackCount: agent.raid_wins + (agent.reputation_score > 0 ? 1 : 0),
            averageScore: agent.reputation_score,
        },
        metadata: {
            strategyType: agent.strategy_type,
            level: agent.xp_level,
            netPnl: agent.net_pnl,
            totalVolume: agent.total_volume,
            raidWins: agent.raid_wins,
            owner: agent.owner_address,
            createdAt: agent.created_at,
        },
    };

    return NextResponse.json(card, {
        headers: {
            'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
            'Content-Type': 'application/json',
        },
    });
}
```

**Step 2: Commit**

```bash
git add frontend/src/app/api/agent/\\[agentId\\]/registration.json/route.ts
git commit -m "feat: add ERC-8004 spec-compliant agent card JSON endpoint"
```

---

### Task 8: Agent policy CRUD routes

**Files:**
- Create: `frontend/src/app/api/agent/[agentId]/policy/route.ts`

**Step 1: Write GET and POST handlers for policy CRUD**

```typescript
// frontend/src/app/api/agent/[agentId]/policy/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { AgentPolicySchema } from '@/lib/policy-schema';
import { getSupabaseAdmin } from '@/lib/supabase';

// GET /api/agent/[agentId]/policy — read current policy
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ agentId: string }> }
) {
    const { agentId } = await params;
    const id = parseInt(agentId, 10);

    if (isNaN(id) || id < 1) {
        return NextResponse.json({ error: 'Invalid agent ID' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: agent, error } = await supabase
        .from('agents')
        .select('agent_id, name, strategy_type, policy_config, owner_address')
        .eq('agent_id', id)
        .single();

    if (error || !agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    return NextResponse.json({
        agentId: agent.agent_id,
        name: agent.name,
        strategyType: agent.strategy_type,
        policy: agent.policy_config,
    });
}

// POST /api/agent/[agentId]/policy — update policy (owner only)
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ agentId: string }> }
) {
    try {
        const session = await requireAuth();
        const { agentId } = await params;
        const id = parseInt(agentId, 10);

        if (isNaN(id) || id < 1) {
            return NextResponse.json({ error: 'Invalid agent ID' }, { status: 400 });
        }

        const body = await req.json();
        const { policy, strategyType } = body as {
            policy: unknown;
            strategyType?: 0 | 1 | 2;
        };

        // Validate policy
        const policyResult = AgentPolicySchema.safeParse(policy);
        if (!policyResult.success) {
            return NextResponse.json(
                { error: 'Invalid policy', details: policyResult.error.flatten() },
                { status: 400 }
            );
        }

        const supabase = getSupabaseAdmin();

        // Verify ownership
        const { data: agent, error: fetchError } = await supabase
            .from('agents')
            .select('agent_id, owner_address')
            .eq('agent_id', id)
            .single();

        if (fetchError || !agent) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
        }

        if (agent.owner_address.toLowerCase() !== session.address.toLowerCase()) {
            return NextResponse.json({ error: 'Not your agent' }, { status: 403 });
        }

        // Update policy
        const updateData: Record<string, any> = {
            policy_config: policyResult.data,
            strategy_count: policyResult.data.rules.length,
        };

        if (strategyType !== undefined && [0, 1, 2].includes(strategyType)) {
            updateData.strategy_type = strategyType;
        }

        const { error: updateError } = await supabase
            .from('agents')
            .update(updateData)
            .eq('agent_id', id);

        if (updateError) {
            console.error('Failed to update policy:', updateError);
            return NextResponse.json({ error: 'Failed to update policy' }, { status: 500 });
        }

        // Log to activity feed
        await supabase.from('activity_feed').insert({
            event_type: 'policy_update',
            actor_id: id,
            metadata: {
                rules_count: policyResult.data.rules.length,
                risk_tolerance: policyResult.data.riskTolerance,
                owner: session.address,
            },
        });

        return NextResponse.json({
            ok: true,
            agentId: id,
            policy: policyResult.data,
        });
    } catch (error: any) {
        if (error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Connect wallet first' }, { status: 401 });
        }
        console.error('Policy update error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
```

**Step 2: Commit**

```bash
git add frontend/src/app/api/agent/\\[agentId\\]/policy/route.ts
git commit -m "feat: add agent policy CRUD routes with ownership verification"
```

---

### Task 9: Spawn page UI

**Files:**
- Create: `frontend/src/app/spawn/page.tsx`

**Step 1: Write the full spawn page component**

This page has three stages: (1) connect wallet, (2) name agent + pick strategy, (3) confirm + spawn.

```tsx
// frontend/src/app/spawn/page.tsx
'use client';

import { useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { STRATEGY_PRESETS, StrategyPreset } from '@/lib/strategy-presets';
import { AgentPolicy } from '@/lib/policy-schema';
import { RuleBuilder } from '@/components/ui/RuleBuilder';

type SpawnStage = 'connect' | 'configure' | 'review' | 'spawning' | 'done';

interface SpawnResult {
    agentId: number;
    walletAddress: string;
    erc8004TokenId: number | null;
    name: string;
}

export default function SpawnPage() {
    const { address, isConnected } = useAccount();
    const { openConnectModal } = useConnectModal();

    const [stage, setStage] = useState<SpawnStage>(isConnected ? 'configure' : 'connect');
    const [agentName, setAgentName] = useState('');
    const [selectedPreset, setSelectedPreset] = useState<StrategyPreset | null>(null);
    const [useCustomRules, setUseCustomRules] = useState(false);
    const [customPolicy, setCustomPolicy] = useState<AgentPolicy>({
        rules: [],
        riskTolerance: 'medium',
        maxPositionSize: 30,
        maxSlippageBps: 100,
        allowedProtocols: ['SprawlDEX'],
    });
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<SpawnResult | null>(null);

    const activePolicy = useCustomRules ? customPolicy : selectedPreset?.policy ?? null;
    const strategyType: 0 | 1 | 2 = useCustomRules ? 1 : 0;

    const handleSpawn = useCallback(async () => {
        if (!activePolicy || !agentName.trim()) return;

        setStage('spawning');
        setError(null);

        try {
            const res = await fetch('/api/agent/spawn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: agentName.trim(),
                    strategyType,
                    policy: activePolicy,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Spawn failed');
            }

            setResult(data);
            setStage('done');
        } catch (err: any) {
            setError(err.message);
            setStage('review');
        }
    }, [activePolicy, agentName, strategyType]);

    // Stage: Connect Wallet
    if (!isConnected || stage === 'connect') {
        return (
            <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
                <div className="max-w-md w-full mx-auto p-8 text-center">
                    <h1 className="text-4xl font-bold mb-4">Spawn Agent</h1>
                    <p className="text-gray-400 mb-8">
                        Connect your wallet to create an autonomous DeFi agent in The Sprawl.
                    </p>
                    <button
                        onClick={() => openConnectModal?.()}
                        className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold text-lg transition-colors"
                    >
                        Connect Wallet
                    </button>
                </div>
            </div>
        );
    }

    // Stage: Done
    if (stage === 'done' && result) {
        return (
            <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
                <div className="max-w-lg w-full mx-auto p-8 text-center">
                    <div className="text-6xl mb-6">&#x2713;</div>
                    <h1 className="text-3xl font-bold mb-2">Agent Spawned!</h1>
                    <p className="text-gray-400 mb-8">
                        &quot;{result.name}&quot; is now alive in The Sprawl.
                    </p>
                    <div className="bg-gray-900 rounded-lg p-6 text-left space-y-3 mb-8">
                        <div className="flex justify-between">
                            <span className="text-gray-400">Agent ID</span>
                            <span className="font-mono">#{result.agentId}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">Wallet</span>
                            <span className="font-mono text-sm">
                                {result.walletAddress.slice(0, 6)}...{result.walletAddress.slice(-4)}
                            </span>
                        </div>
                        {result.erc8004TokenId && (
                            <div className="flex justify-between">
                                <span className="text-gray-400">ERC-8004 ID</span>
                                <span className="font-mono">#{result.erc8004TokenId}</span>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <span className="text-gray-400">Starting Portfolio</span>
                            <span>~$10,000</span>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <a
                            href="/"
                            className="flex-1 py-3 px-4 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium transition-colors text-center"
                        >
                            View City
                        </a>
                        <a
                            href={`/api/agent/${result.agentId}/registration.json`}
                            target="_blank"
                            className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-medium transition-colors text-center"
                        >
                            Agent Card
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    // Stage: Spawning (loading)
    if (stage === 'spawning') {
        return (
            <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
                <div className="max-w-md w-full mx-auto p-8 text-center">
                    <div className="animate-spin text-4xl mb-6">&#9881;</div>
                    <h2 className="text-2xl font-bold mb-2">Spawning Agent...</h2>
                    <p className="text-gray-400">
                        Creating wallet, funding tokens, registering on-chain identity...
                    </p>
                    <div className="mt-8 space-y-2 text-left text-sm text-gray-500">
                        <p>1. Generating agent wallet (AES-256-GCM encrypted)</p>
                        <p>2. Funding starting portfolio via AgentFaucet</p>
                        <p>3. Minting ERC-8004 identity NFT</p>
                        <p>4. Registering in CityState contract</p>
                    </div>
                </div>
            </div>
        );
    }

    // Stage: Review (confirm before spawn)
    if (stage === 'review') {
        return (
            <div className="min-h-screen bg-gray-950 text-white py-12">
                <div className="max-w-2xl mx-auto px-6">
                    <h1 className="text-3xl font-bold mb-2">Review &amp; Spawn</h1>
                    <p className="text-gray-400 mb-8">Confirm your agent configuration before spawning.</p>

                    {error && (
                        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-6">
                            <p className="text-red-300">{error}</p>
                        </div>
                    )}

                    <div className="bg-gray-900 rounded-lg p-6 space-y-4 mb-8">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400">Name</span>
                            <span className="font-semibold">{agentName}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400">Strategy</span>
                            <span>
                                {useCustomRules
                                    ? 'Custom Rules'
                                    : selectedPreset?.name ?? 'None'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400">Risk Tolerance</span>
                            <span
                                className={
                                    activePolicy?.riskTolerance === 'high'
                                        ? 'text-red-400'
                                        : activePolicy?.riskTolerance === 'medium'
                                        ? 'text-yellow-400'
                                        : 'text-green-400'
                                }
                            >
                                {activePolicy?.riskTolerance ?? 'N/A'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400">Rules</span>
                            <span>{activePolicy?.rules.length ?? 0} rules</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400">Max Position Size</span>
                            <span>{activePolicy?.maxPositionSize ?? 0}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400">Max Slippage</span>
                            <span>{activePolicy?.maxSlippageBps ?? 0} bps</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400">Owner</span>
                            <span className="font-mono text-sm">
                                {address?.slice(0, 6)}...{address?.slice(-4)}
                            </span>
                        </div>
                    </div>

                    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 mb-8 text-sm text-gray-400">
                        <p>
                            Your agent will receive a ~$10,000 starting portfolio (5,000 sUSDC + 1 sETH +
                            0.035 sBTC + 5,000 sPOL + 15 sSOL + 100 $SPRAWL) and begin trading
                            autonomously based on your configured rules.
                        </p>
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={() => setStage('configure')}
                            className="flex-1 py-3 px-4 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium transition-colors"
                        >
                            Back
                        </button>
                        <button
                            onClick={handleSpawn}
                            className="flex-1 py-4 px-6 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-bold text-lg transition-colors"
                        >
                            Spawn Agent
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Stage: Configure (name + strategy selection)
    return (
        <div className="min-h-screen bg-gray-950 text-white py-12">
            <div className="max-w-4xl mx-auto px-6">
                <h1 className="text-4xl font-bold mb-2">Spawn Agent</h1>
                <p className="text-gray-400 mb-8">
                    Name your agent and choose a trading strategy. Connected as{' '}
                    <span className="font-mono text-indigo-400">
                        {address?.slice(0, 6)}...{address?.slice(-4)}
                    </span>
                </p>

                {/* Agent Name */}
                <div className="mb-10">
                    <label className="block text-sm font-medium text-gray-300 mb-2">Agent Name</label>
                    <input
                        type="text"
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        placeholder="e.g. AlphaBot, DeFi Sage, Night Trader..."
                        maxLength={32}
                        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <p className="text-xs text-gray-500 mt-1">{agentName.length}/32 characters</p>
                </div>

                {/* Strategy Mode Toggle */}
                <div className="mb-8">
                    <div className="flex gap-2 p-1 bg-gray-900 rounded-lg w-fit">
                        <button
                            onClick={() => setUseCustomRules(false)}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                !useCustomRules
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            Strategy Presets
                        </button>
                        <button
                            onClick={() => setUseCustomRules(true)}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                useCustomRules
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            Custom Rules
                        </button>
                    </div>
                </div>

                {/* Strategy Presets */}
                {!useCustomRules && (
                    <div className="mb-10">
                        <h2 className="text-xl font-semibold mb-4">Choose a Strategy</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {STRATEGY_PRESETS.map((preset) => (
                                <button
                                    key={preset.id}
                                    onClick={() => setSelectedPreset(preset)}
                                    className={`text-left p-5 rounded-lg border-2 transition-all ${
                                        selectedPreset?.id === preset.id
                                            ? 'border-indigo-500 bg-indigo-950/30'
                                            : 'border-gray-800 bg-gray-900 hover:border-gray-600'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-2xl">{preset.icon}</span>
                                        <h3 className="font-semibold">{preset.name}</h3>
                                    </div>
                                    <p className="text-sm text-gray-400 mb-3">{preset.description}</p>
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                                preset.risk === 'high'
                                                    ? 'bg-red-900/50 text-red-400'
                                                    : preset.risk === 'medium'
                                                    ? 'bg-yellow-900/50 text-yellow-400'
                                                    : 'bg-green-900/50 text-green-400'
                                            }`}
                                        >
                                            {preset.risk} risk
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            {preset.policy.rules.length} rules
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Custom Rule Builder */}
                {useCustomRules && (
                    <div className="mb-10">
                        <h2 className="text-xl font-semibold mb-4">Build Your Rules</h2>
                        <RuleBuilder policy={customPolicy} onChange={setCustomPolicy} />
                    </div>
                )}

                {/* Continue Button */}
                <button
                    onClick={() => setStage('review')}
                    disabled={
                        !agentName.trim() ||
                        agentName.length < 2 ||
                        (!useCustomRules && !selectedPreset)
                    }
                    className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg font-bold text-lg transition-colors"
                >
                    Review &amp; Spawn
                </button>
            </div>
        </div>
    );
}
```

**Step 2: Commit**

```bash
git add frontend/src/app/spawn/page.tsx
git commit -m "feat: add spawn page with wallet connect, strategy presets, and review flow"
```

---

### Task 10: RuleBuilder UI component

**Files:**
- Create: `frontend/src/components/ui/RuleBuilder.tsx`

**Step 1: Write the visual if/then rule editor**

Reference: Design doc Section 5.3 wireframe. Condition fields from Appendix H.

```tsx
// frontend/src/components/ui/RuleBuilder.tsx
'use client';

import { useState } from 'react';
import {
    CONDITION_FIELDS,
    OPERATORS,
    ACTIONS,
    AgentPolicy,
    PolicyRule,
} from '@/lib/policy-schema';

interface RuleBuilderProps {
    policy: AgentPolicy;
    onChange: (policy: AgentPolicy) => void;
}

const FIELD_LABELS: Record<string, string> = {
    'portfolio.totalValueUSD': 'Portfolio Value (USD)',
    'portfolio.holdings.sETH': 'sETH Holdings',
    'portfolio.holdings.sBTC': 'sBTC Holdings',
    'portfolio.holdings.sPOL': 'sPOL Holdings',
    'portfolio.holdings.sSOL': 'sSOL Holdings',
    'portfolio.holdings.sUSDC': 'sUSDC Holdings',
    'portfolio.holdings.SPRAWL': 'SPRAWL Holdings',
    'portfolio.unrealizedPnl': 'Unrealized P&L',
    'portfolio.sprawlBalance': 'SPRAWL Balance',
    'market.price.sETH': 'sETH Price',
    'market.price.sBTC': 'sBTC Price',
    'market.price.sPOL': 'sPOL Price',
    'market.price.sSOL': 'sSOL Price',
    'market.priceChange1h.sETH': 'sETH 1h Change',
    'market.priceChange1h.sBTC': 'sBTC 1h Change',
    'market.priceChange1h.sPOL': 'sPOL 1h Change',
    'market.priceChange1h.sSOL': 'sSOL 1h Change',
    'market.priceChange24h.sETH': 'sETH 24h Change',
    'market.priceChange24h.sBTC': 'sBTC 24h Change',
    'market.priceChange24h.sPOL': 'sPOL 24h Change',
    'market.priceChange24h.sSOL': 'sSOL 24h Change',
    'market.pool.sETH_sUSDC.apr': 'sETH/sUSDC Pool APR',
    'market.pool.sBTC_sUSDC.apr': 'sBTC/sUSDC Pool APR',
    'market.pool.sPOL_sUSDC.apr': 'sPOL/sUSDC Pool APR',
    'market.pool.sSOL_sUSDC.apr': 'sSOL/sUSDC Pool APR',
    'market.pool.SPRAWL_sUSDC.apr': 'SPRAWL/sUSDC Pool APR',
    'market.pool.sETH_sUSDC.tvl': 'sETH/sUSDC Pool TVL',
    'market.pool.sBTC_sUSDC.tvl': 'sBTC/sUSDC Pool TVL',
    'agent.level': 'Agent Level',
    'agent.raidWins': 'Raid Wins',
    'agent.profitStreak': 'Profit Streak (days)',
};

const OPERATOR_LABELS: Record<string, string> = {
    '>': 'greater than',
    '<': 'less than',
    '==': 'equals',
    '!=': 'not equals',
};

const ACTION_LABELS: Record<string, string> = {
    swap: 'Swap Tokens',
    provideLiquidity: 'Provide Liquidity',
    removeLiquidity: 'Remove Liquidity',
    hold: 'Hold (do nothing)',
    raid: 'Raid an Agent',
};

const TOKENS = ['sETH', 'sBTC', 'sPOL', 'sSOL', 'sUSDC', 'SPRAWL'] as const;

function emptyRule(): PolicyRule {
    return {
        name: '',
        condition: { field: 'market.price.sETH', operator: '>', value: 0 },
        action: 'swap',
        protocol: 'SprawlDEX',
        params: { tokenIn: 'sUSDC', tokenOut: 'sETH', amountPercent: 10 },
    };
}

function ActionParams({
    rule,
    onUpdate,
}: {
    rule: PolicyRule;
    onUpdate: (params: Record<string, any>) => void;
}) {
    const params = rule.params;

    if (rule.action === 'swap') {
        return (
            <div className="flex flex-wrap gap-3 items-center">
                <label className="text-sm text-gray-400">Sell</label>
                <select
                    value={params.tokenIn || 'sUSDC'}
                    onChange={(e) => onUpdate({ ...params, tokenIn: e.target.value })}
                    className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
                >
                    {TOKENS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>
                <label className="text-sm text-gray-400">Buy</label>
                <select
                    value={params.tokenOut || 'sETH'}
                    onChange={(e) => onUpdate({ ...params, tokenOut: e.target.value })}
                    className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
                >
                    {TOKENS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>
                <label className="text-sm text-gray-400">Amount</label>
                <input
                    type="number"
                    min={1}
                    max={100}
                    value={params.amountPercent || 10}
                    onChange={(e) =>
                        onUpdate({ ...params, amountPercent: Number(e.target.value) })
                    }
                    className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-center"
                />
                <span className="text-sm text-gray-500">% of held balance</span>
            </div>
        );
    }

    if (rule.action === 'provideLiquidity') {
        return (
            <div className="flex flex-wrap gap-3 items-center">
                <label className="text-sm text-gray-400">Token A</label>
                <select
                    value={params.tokenA || 'sETH'}
                    onChange={(e) => onUpdate({ ...params, tokenA: e.target.value })}
                    className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
                >
                    {TOKENS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>
                <label className="text-sm text-gray-400">Token B</label>
                <select
                    value={params.tokenB || 'sUSDC'}
                    onChange={(e) => onUpdate({ ...params, tokenB: e.target.value })}
                    className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
                >
                    {TOKENS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>
                <label className="text-sm text-gray-400">Amount</label>
                <input
                    type="number"
                    min={1}
                    max={50}
                    value={params.amountPercent || 10}
                    onChange={(e) =>
                        onUpdate({ ...params, amountPercent: Number(e.target.value) })
                    }
                    className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-center"
                />
                <span className="text-sm text-gray-500">% of portfolio</span>
            </div>
        );
    }

    if (rule.action === 'removeLiquidity') {
        return (
            <div className="flex flex-wrap gap-3 items-center">
                <label className="text-sm text-gray-400">Token A</label>
                <select
                    value={params.tokenA || 'sETH'}
                    onChange={(e) => onUpdate({ ...params, tokenA: e.target.value })}
                    className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
                >
                    {TOKENS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>
                <label className="text-sm text-gray-400">Token B</label>
                <select
                    value={params.tokenB || 'sUSDC'}
                    onChange={(e) => onUpdate({ ...params, tokenB: e.target.value })}
                    className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
                >
                    {TOKENS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>
                <label className="text-sm text-gray-400">Remove</label>
                <input
                    type="number"
                    min={1}
                    max={100}
                    value={params.percentToRemove || 100}
                    onChange={(e) =>
                        onUpdate({ ...params, percentToRemove: Number(e.target.value) })
                    }
                    className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-center"
                />
                <span className="text-sm text-gray-500">% of LP position</span>
            </div>
        );
    }

    if (rule.action === 'raid') {
        return (
            <div className="flex items-center gap-3">
                <label className="text-sm text-gray-400">Target Agent ID</label>
                <input
                    type="number"
                    min={0}
                    value={params.targetAgentId || 0}
                    onChange={(e) =>
                        onUpdate({ ...params, targetAgentId: Number(e.target.value) })
                    }
                    className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-center"
                />
                <span className="text-xs text-gray-500">(0 = auto-pick weakest opponent)</span>
            </div>
        );
    }

    // hold — no params
    return <p className="text-sm text-gray-500 italic">No parameters needed for hold.</p>;
}

function RuleCard({
    rule,
    index,
    onUpdate,
    onRemove,
}: {
    rule: PolicyRule;
    index: number;
    onUpdate: (rule: PolicyRule) => void;
    onRemove: () => void;
}) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
            {/* Rule Header */}
            <div className="flex items-center justify-between">
                <input
                    type="text"
                    value={rule.name}
                    onChange={(e) => onUpdate({ ...rule, name: e.target.value })}
                    placeholder={`Rule ${index + 1} name`}
                    className="bg-transparent text-white font-medium focus:outline-none border-b border-transparent focus:border-indigo-500 transition-colors"
                />
                <button
                    onClick={onRemove}
                    className="text-gray-500 hover:text-red-400 text-sm transition-colors"
                >
                    Remove
                </button>
            </div>

            {/* IF Condition */}
            <div>
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">IF</span>
                <div className="flex flex-wrap gap-3 mt-2 items-center">
                    <select
                        value={rule.condition.field}
                        onChange={(e) =>
                            onUpdate({
                                ...rule,
                                condition: { ...rule.condition, field: e.target.value },
                            })
                        }
                        className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm flex-1 min-w-[180px]"
                    >
                        {CONDITION_FIELDS.map((f) => (
                            <option key={f} value={f}>
                                {FIELD_LABELS[f] || f}
                            </option>
                        ))}
                    </select>

                    <select
                        value={rule.condition.operator}
                        onChange={(e) =>
                            onUpdate({
                                ...rule,
                                condition: {
                                    ...rule.condition,
                                    operator: e.target.value as '>' | '<' | '==' | '!=',
                                },
                            })
                        }
                        className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                    >
                        {OPERATORS.map((op) => (
                            <option key={op} value={op}>
                                {OPERATOR_LABELS[op]}
                            </option>
                        ))}
                    </select>

                    <input
                        type="number"
                        step="any"
                        value={
                            typeof rule.condition.value === 'number'
                                ? rule.condition.value
                                : parseFloat(rule.condition.value as string) || 0
                        }
                        onChange={(e) =>
                            onUpdate({
                                ...rule,
                                condition: {
                                    ...rule.condition,
                                    value: parseFloat(e.target.value) || 0,
                                },
                            })
                        }
                        className="w-28 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                    />
                </div>
            </div>

            {/* THEN Action */}
            <div>
                <span className="text-xs font-bold text-green-400 uppercase tracking-wider">THEN</span>
                <div className="mt-2 space-y-3">
                    <select
                        value={rule.action}
                        onChange={(e) => {
                            const action = e.target.value as PolicyRule['action'];
                            let params: Record<string, any> = {};
                            if (action === 'swap')
                                params = { tokenIn: 'sUSDC', tokenOut: 'sETH', amountPercent: 10 };
                            else if (action === 'provideLiquidity')
                                params = { tokenA: 'sETH', tokenB: 'sUSDC', amountPercent: 10 };
                            else if (action === 'removeLiquidity')
                                params = { tokenA: 'sETH', tokenB: 'sUSDC', percentToRemove: 100 };
                            else if (action === 'raid') params = { targetAgentId: 0 };
                            onUpdate({ ...rule, action, params });
                        }}
                        className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm w-full"
                    >
                        {ACTIONS.map((a) => (
                            <option key={a} value={a}>
                                {ACTION_LABELS[a]}
                            </option>
                        ))}
                    </select>

                    <ActionParams
                        rule={rule}
                        onUpdate={(params) => onUpdate({ ...rule, params })}
                    />
                </div>
            </div>
        </div>
    );
}

export function RuleBuilder({ policy, onChange }: RuleBuilderProps) {
    const addRule = () => {
        if (policy.rules.length >= 5) return;
        onChange({ ...policy, rules: [...policy.rules, emptyRule()] });
    };

    const updateRule = (index: number, rule: PolicyRule) => {
        const rules = [...policy.rules];
        rules[index] = rule;
        onChange({ ...policy, rules });
    };

    const removeRule = (index: number) => {
        onChange({ ...policy, rules: policy.rules.filter((_, i) => i !== index) });
    };

    return (
        <div className="space-y-6">
            {/* Global Settings */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
                <h3 className="font-semibold mb-4">Global Settings</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Risk Tolerance</label>
                        <select
                            value={policy.riskTolerance}
                            onChange={(e) =>
                                onChange({
                                    ...policy,
                                    riskTolerance: e.target.value as 'low' | 'medium' | 'high',
                                })
                            }
                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">
                            Max Position Size (%)
                        </label>
                        <input
                            type="number"
                            min={1}
                            max={100}
                            value={policy.maxPositionSize}
                            onChange={(e) =>
                                onChange({ ...policy, maxPositionSize: Number(e.target.value) })
                            }
                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">
                            Max Slippage (bps)
                        </label>
                        <input
                            type="number"
                            min={10}
                            max={500}
                            value={policy.maxSlippageBps}
                            onChange={(e) =>
                                onChange({ ...policy, maxSlippageBps: Number(e.target.value) })
                            }
                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                        />
                    </div>
                </div>
            </div>

            {/* Rules */}
            {policy.rules.map((rule, i) => (
                <RuleCard
                    key={i}
                    rule={rule}
                    index={i}
                    onUpdate={(r) => updateRule(i, r)}
                    onRemove={() => removeRule(i)}
                />
            ))}

            {/* Add Rule Button */}
            {policy.rules.length < 5 && (
                <button
                    onClick={addRule}
                    className="w-full py-3 border-2 border-dashed border-gray-700 hover:border-indigo-500 rounded-lg text-gray-400 hover:text-indigo-400 transition-colors font-medium"
                >
                    + Add Rule ({policy.rules.length}/5)
                </button>
            )}

            {policy.rules.length >= 5 && (
                <p className="text-sm text-gray-500 text-center">
                    Maximum 5 rules per agent reached.
                </p>
            )}
        </div>
    );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/ui/RuleBuilder.tsx
git commit -m "feat: add visual if/then rule builder with condition fields, operators, and action params"
```

---

### Task 11: Strategy preset selector component

**Files:**
- Create: `frontend/src/components/ui/PresetSelector.tsx`

**Step 1: Write the standalone preset selector (reusable for policy edit page)**

This component is extracted so it can be reused on the policy edit page independent of the spawn flow.

```tsx
// frontend/src/components/ui/PresetSelector.tsx
'use client';

import { STRATEGY_PRESETS, StrategyPreset } from '@/lib/strategy-presets';

interface PresetSelectorProps {
    selected: StrategyPreset | null;
    onSelect: (preset: StrategyPreset) => void;
}

export function PresetSelector({ selected, onSelect }: PresetSelectorProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {STRATEGY_PRESETS.map((preset) => (
                <button
                    key={preset.id}
                    onClick={() => onSelect(preset)}
                    className={`text-left p-5 rounded-lg border-2 transition-all ${
                        selected?.id === preset.id
                            ? 'border-indigo-500 bg-indigo-950/30 shadow-lg shadow-indigo-500/10'
                            : 'border-gray-800 bg-gray-900 hover:border-gray-600'
                    }`}
                >
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">{preset.icon}</span>
                        <h3 className="font-semibold">{preset.name}</h3>
                    </div>
                    <p className="text-sm text-gray-400 mb-3">{preset.description}</p>
                    <div className="flex items-center justify-between">
                        <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                preset.risk === 'high'
                                    ? 'bg-red-900/50 text-red-400'
                                    : preset.risk === 'medium'
                                    ? 'bg-yellow-900/50 text-yellow-400'
                                    : 'bg-green-900/50 text-green-400'
                            }`}
                        >
                            {preset.risk} risk
                        </span>
                        <span className="text-xs text-gray-500">
                            {preset.policy.rules.length} rules | max {preset.policy.maxPositionSize}% position
                        </span>
                    </div>

                    {/* Show rules summary when selected */}
                    {selected?.id === preset.id && (
                        <div className="mt-4 pt-4 border-t border-gray-800 space-y-2">
                            {preset.policy.rules.map((rule, i) => (
                                <div key={i} className="text-xs text-gray-400">
                                    <span className="text-indigo-400 font-medium">IF</span>{' '}
                                    {rule.condition.field}{' '}
                                    <span className="text-white">{rule.condition.operator}</span>{' '}
                                    {rule.condition.value}{' '}
                                    <span className="text-green-400 font-medium">THEN</span>{' '}
                                    {rule.action}
                                </div>
                            ))}
                        </div>
                    )}
                </button>
            ))}
        </div>
    );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/ui/PresetSelector.tsx
git commit -m "feat: add reusable strategy preset selector component"
```

---

### Task 12: Agent policy edit page

**Files:**
- Create: `frontend/src/app/agent/[agentId]/policy/page.tsx`

**Step 1: Write the policy edit page for existing agents**

```tsx
// frontend/src/app/agent/[agentId]/policy/page.tsx
'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useAccount } from 'wagmi';
import { RuleBuilder } from '@/components/ui/RuleBuilder';
import { PresetSelector } from '@/components/ui/PresetSelector';
import { AgentPolicy } from '@/lib/policy-schema';
import { StrategyPreset, STRATEGY_PRESETS } from '@/lib/strategy-presets';

interface AgentPolicyData {
    agentId: number;
    name: string;
    strategyType: 0 | 1 | 2;
    policy: AgentPolicy;
}

export default function PolicyEditPage({
    params,
}: {
    params: Promise<{ agentId: string }>;
}) {
    const { agentId } = use(params);
    const { address } = useAccount();

    const [data, setData] = useState<AgentPolicyData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const [useCustomRules, setUseCustomRules] = useState(false);
    const [selectedPreset, setSelectedPreset] = useState<StrategyPreset | null>(null);
    const [policy, setPolicy] = useState<AgentPolicy>({
        rules: [],
        riskTolerance: 'medium',
        maxPositionSize: 30,
        maxSlippageBps: 100,
        allowedProtocols: ['SprawlDEX'],
    });

    useEffect(() => {
        async function fetchPolicy() {
            try {
                const res = await fetch(`/api/agent/${agentId}/policy`);
                if (!res.ok) throw new Error('Failed to fetch');
                const json: AgentPolicyData = await res.json();
                setData(json);
                setPolicy(json.policy);
                setUseCustomRules(json.strategyType === 1);

                // Try to match to a preset
                if (json.strategyType === 0) {
                    const match = STRATEGY_PRESETS.find(
                        (p) => JSON.stringify(p.policy) === JSON.stringify(json.policy)
                    );
                    if (match) setSelectedPreset(match);
                }
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchPolicy();
    }, [agentId]);

    const handleSave = useCallback(async () => {
        setSaving(true);
        setError(null);
        setSuccess(false);

        const activePolicy = useCustomRules ? policy : selectedPreset?.policy ?? policy;
        const strategyType: 0 | 1 | 2 = useCustomRules ? 1 : 0;

        try {
            const res = await fetch(`/api/agent/${agentId}/policy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ policy: activePolicy, strategyType }),
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Failed to update');

            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }, [agentId, policy, selectedPreset, useCustomRules]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
                <p className="text-gray-400">Loading policy...</p>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
                <p className="text-red-400">Agent not found</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 text-white py-12">
            <div className="max-w-4xl mx-auto px-6">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold">Edit Policy</h1>
                        <p className="text-gray-400">
                            Agent #{data.agentId} &mdash; {data.name}
                        </p>
                    </div>
                    <a
                        href="/"
                        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
                    >
                        Back to City
                    </a>
                </div>

                {error && (
                    <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-6">
                        <p className="text-red-300">{error}</p>
                    </div>
                )}

                {success && (
                    <div className="bg-green-900/50 border border-green-700 rounded-lg p-4 mb-6">
                        <p className="text-green-300">Policy updated successfully!</p>
                    </div>
                )}

                {/* Strategy Mode Toggle */}
                <div className="mb-8">
                    <div className="flex gap-2 p-1 bg-gray-900 rounded-lg w-fit">
                        <button
                            onClick={() => setUseCustomRules(false)}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                !useCustomRules
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            Strategy Presets
                        </button>
                        <button
                            onClick={() => setUseCustomRules(true)}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                useCustomRules
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            Custom Rules
                        </button>
                    </div>
                </div>

                {!useCustomRules && (
                    <div className="mb-10">
                        <PresetSelector selected={selectedPreset} onSelect={setSelectedPreset} />
                    </div>
                )}

                {useCustomRules && (
                    <div className="mb-10">
                        <RuleBuilder policy={policy} onChange={setPolicy} />
                    </div>
                )}

                <button
                    onClick={handleSave}
                    disabled={saving || (!useCustomRules && !selectedPreset)}
                    className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg font-bold text-lg transition-colors"
                >
                    {saving ? 'Saving...' : 'Save Policy'}
                </button>
            </div>
        </div>
    );
}
```

**Step 2: Commit**

```bash
git add frontend/src/app/agent/\\[agentId\\]/policy/page.tsx
git commit -m "feat: add agent policy edit page with preset selector and rule builder"
```

---

### Task 13: useAgentWallet hook for server-side agent key recovery

**Files:**
- Create: `frontend/src/lib/agent-wallet.ts`

**Step 1: Write the server-side helper to recover an agent's wallet for engine use**

This is used by the engine tick loop to sign transactions on behalf of agents.

```typescript
// frontend/src/lib/agent-wallet.ts
import { ethers } from 'ethers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { decryptPrivateKey } from '@/lib/crypto';
import { getMantleSepoliaProvider } from '@/lib/ethers-provider';

export async function getAgentWallet(agentId: number): Promise<ethers.Wallet> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
        .from('agent_wallets')
        .select('encrypted_private_key, iv, auth_tag')
        .eq('agent_id', agentId)
        .single();

    if (error || !data) {
        throw new Error(`No wallet found for agent ${agentId}`);
    }

    const privateKey = decryptPrivateKey(data.encrypted_private_key, data.iv, data.auth_tag);
    return new ethers.Wallet(privateKey, getMantleSepoliaProvider());
}

export async function getAgentAddress(agentId: number): Promise<string> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
        .from('agent_wallets')
        .select('wallet_address')
        .eq('agent_id', agentId)
        .single();

    if (error || !data) {
        throw new Error(`No wallet found for agent ${agentId}`);
    }

    return data.wallet_address;
}
```

**Step 2: Commit**

```bash
git add frontend/src/lib/agent-wallet.ts
git commit -m "feat: add server-side agent wallet recovery with AES-256-GCM decryption"
```

---

## Summary: What Phase 5 Delivers

After completing all 13 tasks:

- [x] `agent_wallets` Supabase table with RLS lockdown (zero browser access)
- [x] AES-256-GCM encryption/decryption for agent private keys
- [x] SIWE session helper for API route authentication
- [x] Zod-validated `AgentPolicy` schema with 30+ condition fields
- [x] 5 strategy presets (Conservative Yield, Momentum Trader, Arbitrage Hunter, Aggressive Degen, Balanced DeFi)
- [x] `POST /api/agent/spawn` — full spawn flow: wallet creation, encryption, AgentFaucet funding, ERC-8004 registration, CityState.spawnAgent
- [x] `GET /api/agent/[agentId]/registration.json` — ERC-8004 spec-compliant agent card
- [x] `GET /api/agent/[agentId]/policy` — read agent policy
- [x] `POST /api/agent/[agentId]/policy` — update policy (owner-only)
- [x] Spawn page UI with wallet connect, name input, strategy selection, and review flow
- [x] Visual if/then rule builder with dropdown condition fields, operators, values, and action params
- [x] Reusable PresetSelector component
- [x] Agent policy edit page for modifying existing agent strategies
- [x] Server-side agent wallet recovery for engine tick loop

**Next phase:** Phase 6 (Raids + XP + Achievements) — raid execution, XP system, achievement engine, and the raid animation in the 3D city.
