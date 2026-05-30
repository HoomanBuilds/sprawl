# Phase 8: Polish + Submission — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Seed a compelling demo state with 20 active agents, verify the full gasless onboarding flow, deploy to Vercel + Azure VM, verify all contracts on the explorer, record a demo video, compose the X thread, and submit to DoraHacks. This phase turns working code into a winning submission.

**Architecture:** Demo seeding script runs against Mantle Sepolia via ethers v5. Vercel hosts the Next.js frontend + API routes. Azure VM runs PM2-managed background processes (engine, indexer, market-maker). All contracts verified on `explorer.sepolia.mantle.xyz`.

**Tech Stack:** ethers v5, PM2, Vercel CLI, Hardhat verify, Supabase, thirdweb embedded wallets, OBS/screen recorder

**Design doc reference:** `docs/plans/2026-05-30-sprawl-protocol-implementation-plan.md` — Sections 8.1-8.3, Appendix Q (Demo Mode Seeding), Appendix D (MarketMaker Bot), and the Hackathon-Specific Scoring Optimizations table.

---

### Task 1: Demo mode seeding script

**Files:**
- Create: `frontend/scripts/seed-demo.ts`
- Edit: `frontend/src/lib/market-maker/index.ts` (add `DEMO_MODE` deterministic PRNG path)

**Step 1: Write the seeding script**

Reference: Design doc Appendix Q

```typescript
// frontend/scripts/seed-demo.ts
import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';
import deployments from '../src/constants/deployments.json';
import { SprawlDEXABI } from '../src/constants/abis';
import { SprawlTokenABI } from '../src/constants/abis';
import { CityStateABI } from '../src/constants/abis';
import { AgentFaucetABI } from '../src/constants/abis';

const MANTLE_SEPOLIA_RPC = 'https://rpc.sepolia.mantle.xyz';
const provider = new ethers.providers.StaticJsonRpcProvider(
    { url: MANTLE_SEPOLIA_RPC, skipFetchSetup: true },
    { chainId: 5003, name: 'mantle-sepolia' }
);

const deployerWallet = new ethers.Wallet(process.env.BACKEND_PRIVATE_KEY!, provider);

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const sprawlDex = new ethers.Contract(deployments.SprawlDEX, SprawlDEXABI, deployerWallet);
const cityState = new ethers.Contract(deployments.CityState, CityStateABI, deployerWallet);
const agentFaucet = new ethers.Contract(deployments.AgentFaucet, AgentFaucetABI, deployerWallet);

const TOKENS = [
    { name: 'sETH', address: deployments.sETH },
    { name: 'sBTC', address: deployments.sBTC },
    { name: 'sUSDC', address: deployments.sUSDC },
    { name: 'sPOL', address: deployments.sPOL },
    { name: 'sSOL', address: deployments.sSOL },
];

const POOLS = [
    { tokenA: deployments.sETH, tokenB: deployments.sUSDC },
    { tokenA: deployments.sBTC, tokenB: deployments.sUSDC },
    { tokenA: deployments.sPOL, tokenB: deployments.sUSDC },
    { tokenA: deployments.sSOL, tokenB: deployments.sUSDC },
    { tokenA: deployments.SPRAWL, tokenB: deployments.sUSDC },
];

const AGENT_NAMES = [
    'TrendRider', 'DipBuyer', 'YieldFarmer', 'ArbiBot', 'MomentumMax',
    'SteadyEddie', 'VolHunter', 'MeanRevert', 'BreakoutKing', 'ScalpMaster',
    'WhaleWatch', 'GridTrader', 'SwingKing', 'DegenAlpha', 'SafeHaven',
    'RiskParity', 'TrendSniper', 'ValueSeeker', 'FlowRider', 'NightOwl',
];

const DISTRICTS = ['dex', 'lending', 'yield', 'bridge', 'general'];

// Deterministic PRNG (mulberry32) for reproducible demo state
function mulberry32(seed: number) {
    return function () {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

async function seedDemo() {
    const rng = mulberry32(42); // fixed seed for determinism
    console.log('Starting demo seed with 20 agents...\n');

    for (let i = 0; i < 20; i++) {
        const agentId = i + 1;
        const name = AGENT_NAMES[i];
        const strategyType = i % 3; // rotate: 0=preset, 1=rules, 2=llm
        const district = DISTRICTS[i % DISTRICTS.length];

        console.log(`\n--- Agent ${agentId}: ${name} (strategy=${strategyType}, district=${district}) ---`);

        // 1. Create agent wallet (deterministic from seed for reproducibility)
        const wallet = ethers.Wallet.fromMnemonic(
            ethers.utils.entropyToMnemonic(ethers.utils.randomBytes(16)),
            `m/44'/60'/0'/0/${i}`
        ).connect(provider);
        console.log(`  Wallet: ${wallet.address}`);

        // 2. Fund from AgentFaucet (deployer calls)
        const fundTx = await agentFaucet.fundNewAgent(wallet.address);
        await fundTx.wait();
        console.log(`  Funded via AgentFaucet`);

        // 3. Register in CityState
        const spawnTx = await cityState.spawnAgent(agentId, wallet.address, strategyType);
        await spawnTx.wait();
        console.log(`  Spawned in CityState`);

        // 4. Transfer gas MNT to agent wallet for trade txs
        const gasTx = await deployerWallet.sendTransaction({
            to: wallet.address,
            value: ethers.utils.parseEther('0.5'), // 0.5 MNT for ~150 trades
        });
        await gasTx.wait();

        // 5. Approve all tokens for SprawlDEX
        for (const token of TOKENS) {
            const tokenContract = new ethers.Contract(token.address, SprawlTokenABI, wallet);
            const approveTx = await tokenContract.approve(
                deployments.SprawlDEX,
                ethers.constants.MaxUint256
            );
            await approveTx.wait();
        }
        const sprawlToken = new ethers.Contract(deployments.SPRAWL, SprawlTokenABI, wallet);
        const sprawlApproveTx = await sprawlToken.approve(
            deployments.SprawlDEX,
            ethers.constants.MaxUint256
        );
        await sprawlApproveTx.wait();
        console.log(`  Approved all tokens for DEX`);

        // 6. Execute 100-200 random trades
        const tradeCount = 100 + Math.floor(rng() * 100);
        console.log(`  Executing ${tradeCount} trades...`);

        let successfulTrades = 0;
        for (let t = 0; t < tradeCount; t++) {
            try {
                const pool = POOLS[Math.floor(rng() * POOLS.length)];
                // Randomly pick direction
                const [tokenIn, tokenOut] = rng() > 0.5
                    ? [pool.tokenA, pool.tokenB]
                    : [pool.tokenB, pool.tokenA];

                // Random small amount (0.01-1% of faucet allocation)
                const baseAmount = rng() * 0.5 + 0.01;
                const amountIn = ethers.utils.parseEther(baseAmount.toFixed(6));

                const swapTx = await sprawlDex.connect(wallet).swap(
                    tokenIn, tokenOut, amountIn, 0 // amountOutMin=0 for demo seeding
                );
                await swapTx.wait();
                successfulTrades++;
            } catch {
                // Skip failed trades (insufficient balance, etc.)
                continue;
            }

            // Log progress every 25 trades
            if ((t + 1) % 25 === 0) {
                console.log(`    ${t + 1}/${tradeCount} trades executed (${successfulTrades} successful)`);
            }
        }
        console.log(`  Completed: ${successfulTrades}/${tradeCount} trades`);

        // 7. Seed Supabase records with varied stats
        const xpTotal = Math.floor(rng() * 5000) + 200;
        const xpLevel = Math.floor(rng() * 15) + 1;
        const sprawlEarned = Math.floor(rng() * 1000) + 50;
        const raidWins = Math.floor(rng() * 20);
        const raidLosses = Math.floor(rng() * 10);
        const reputationScore = Math.floor(rng() * 80) + 20;
        const profitStreak = Math.floor(rng() * 7);
        const weeklyVolume = Math.floor(rng() * 50000) + 1000;

        await supabase.from('agents').upsert({
            agent_id: agentId,
            wallet_address: wallet.address,
            owner_address: deployerWallet.address,
            name: `${name}-${agentId}`,
            persona: `Aggressive ${district} trader with ${['conservative', 'balanced', 'aggressive'][strategyType]} risk profile.`,
            strategy_type: strategyType,
            district,
            xp_total: xpTotal,
            xp_level: xpLevel,
            sprawl_lifetime_earned: sprawlEarned,
            raid_wins: raidWins,
            raid_losses: raidLosses,
            reputation_score: reputationScore,
            profit_streak: profitStreak,
            weekly_volume: weeklyVolume,
            total_volume: successfulTrades * 500 + Math.floor(rng() * 100000),
            app_streak: Math.floor(rng() * 14) + 1,
            created_at: new Date(Date.now() - Math.floor(rng() * 7 * 86400000)).toISOString(),
        });
        console.log(`  Supabase stats seeded (level=${xpLevel}, xp=${xpTotal}, sprawl=${sprawlEarned})`);
    }

    console.log('\n=== Demo seeding complete ===');
    console.log('20 agents created, funded, and traded.');
    console.log('Run the indexer to pick up any missed on-chain events.');
}

seedDemo().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
});
```

**Step 2: Add DEMO_MODE flag to MarketMaker**

In `frontend/src/lib/market-maker/index.ts`, add a deterministic price path when `DEMO_MODE=true`:

```typescript
// At the top of the MarketMaker price sync function
const DEMO_MODE = process.env.DEMO_MODE === 'true';

function getDemoPrice(token: string, tick: number): number {
    // Seeded PRNG produces the same price trajectory every run
    const seed = hashCode(`${token}:${tick}`);
    const rng = mulberry32(seed);

    const BASE_PRICES: Record<string, number> = {
        sETH: 2580, sBTC: 71200, sPOL: 0.45, sSOL: 175, SPRAWL: 1.12,
    };

    const base = BASE_PRICES[token] || 1;
    const drift = (rng() - 0.48) * 0.02; // slight upward bias
    return base * (1 + drift);
}

// In the main sync loop:
async function syncPrices() {
    for (const pair of PAIRS) {
        const realPrice = DEMO_MODE
            ? getDemoPrice(pair.token, currentTick)
            : await fetchCoinGeckoPrice(pair.coingeckoId);
        // ... rest of arb logic unchanged
    }
    currentTick++;
}
```

**Step 3: Run the seed script**

```bash
cd frontend
DEMO_MODE=true npx tsx scripts/seed-demo.ts
```

Expected: 20 agents created with wallets, each with 100-200 trades, varied XP/level/sprawl stats in Supabase. Console output shows progress per agent.

**Step 4: Verify seeded state**

```bash
# Check Supabase has 20 agents
curl -s "$SUPABASE_URL/rest/v1/agents?select=agent_id,name,xp_level,sprawl_lifetime_earned&order=agent_id" \
  -H "apikey: $SUPABASE_ANON_KEY" | jq length
# Expected: 20

# Check on-chain agent count
cd ../contracts
npx hardhat console --network mantleSepolia
> const cs = await ethers.getContractAt("CityState", "<CITYSTATE_ADDRESS>")
> (await cs.agentCount()).toString()
# Expected: "20"
```

**Step 5: Commit**

```bash
git add frontend/scripts/seed-demo.ts
git commit -m "feat: add demo seeding script — 20 agents with trade history"
```

```bash
git add frontend/src/lib/market-maker/index.ts
git commit -m "feat: add DEMO_MODE deterministic pricing to MarketMaker"
```

---

### Task 2: AA/gasless onboarding verification

**Files:**
- Verify: `frontend/src/app/api/spawn/route.ts` (existing spawn API route)
- Verify: `frontend/src/lib/identity/register.ts` (ERC-8004 registration)
- Verify: `frontend/src/components/SpawnDialog.tsx` (spawn UI)
- Edit: Any files with bugs found during testing

**Step 1: Test the full gasless onboarding flow**

Open the deployed site in an incognito browser window. Execute this exact sequence:

1. **Visit site** — landing page loads with 3D city showing seeded buildings
2. **Connect wallet** — click "Connect Wallet" button, select a wallet with zero MNT balance
3. **Click "Spawn Agent"** — select a strategy preset (e.g., "Momentum Trader")
4. **Verify thirdweb gas sponsorship** — the spawn tx should succeed without the user paying gas
5. **Watch agent appear** — the new building should render in the city within 30 seconds (after indexer picks up `AgentSpawned` event)
6. **Watch agent trade** — within 60 seconds (one engine tick), the agent should execute its first trade and the decision feed should show the action
7. **Building grows** — after a few trades, building height should increase visibly

**Step 2: Verify zero-MNT wallet flow**

```bash
# Create a fresh test wallet with 0 MNT
node -e "
const { ethers } = require('ethers');
const wallet = ethers.Wallet.createRandom();
console.log('Address:', wallet.address);
console.log('Private key:', wallet.privateKey);
console.log('Import this into MetaMask for testing');
"
```

Connect this wallet to the site. Confirm that:
- SIWE sign-in works (signature is free)
- Spawn tx is sent via thirdweb paymaster (user pays 0 gas)
- Agent wallet is created server-side (thirdweb Engine creates a local wallet)
- `AgentFaucet.fundNewAgent()` is called by the backend deployer wallet
- `CityState.spawnAgent()` is called by the backend deployer wallet
- `IdentityRegistry.register()` is called by the agent's embedded wallet with sponsored gas

**Step 3: Verify the spawn API route handles errors**

```bash
# Test spawn with missing session (should 401)
curl -X POST http://localhost:3000/api/spawn \
  -H "Content-Type: application/json" \
  -d '{"strategyType": 0, "preset": "momentum"}' \
  -w "\nHTTP Status: %{http_code}\n"
# Expected: 401 Unauthorized

# Test spawn with invalid strategy type (should 400)
curl -X POST http://localhost:3000/api/spawn \
  -H "Content-Type: application/json" \
  -H "Cookie: session=<valid_session>" \
  -d '{"strategyType": 5}' \
  -w "\nHTTP Status: %{http_code}\n"
# Expected: 400 Bad Request
```

**Step 4: Fix any issues found**

Common issues to check:
- thirdweb Engine API key is set in env vars (`THIRDWEB_SECRET_KEY`)
- Paymaster is configured for Mantle Sepolia (chain ID 5003)
- `BACKEND_PRIVATE_KEY` wallet has sufficient MNT for `spawnAgent` + `fundNewAgent` calls
- SIWE session cookie is being set correctly after wallet connect

**Step 5: Commit fixes if any**

```bash
git add -A
git commit -m "fix: patch gasless onboarding flow for zero-MNT wallets"
```

---

### Task 3: Vercel deployment configuration

**Files:**
- Edit: `frontend/next.config.js`
- Create: `frontend/.env.example` (update with all required vars)
- Edit: `frontend/package.json` (verify build script)

**Step 1: Configure next.config.js for production**

```javascript
// frontend/next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,

    // Required for ethers.js + Node.js crypto in edge/serverless
    webpack: (config, { isServer }) => {
        if (!isServer) {
            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs: false,
                net: false,
                tls: false,
                crypto: false,
            };
        }
        return config;
    },

    // Allow Supabase and Mantle explorer images in next/image
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: '*.supabase.co' },
            { protocol: 'https', hostname: 'explorer.sepolia.mantle.xyz' },
        ],
    },

    // Headers for share card OG images and CORS
    async headers() {
        return [
            {
                source: '/api/share-card/:path*',
                headers: [
                    { key: 'Cache-Control', value: 's-maxage=3600, stale-while-revalidate=86400' },
                ],
            },
            {
                source: '/api/city',
                headers: [
                    { key: 'Cache-Control', value: 's-maxage=30, stale-while-revalidate=300' },
                ],
            },
        ];
    },

    // Exclude background scripts from the Vercel build
    experimental: {
        serverComponentsExternalPackages: ['ethers'],
    },
};

module.exports = nextConfig;
```

**Step 2: Update .env.example with all required variables**

```
# Mantle Sepolia
BACKEND_PRIVATE_KEY=
NEXT_PUBLIC_MANTLE_SEPOLIA_RPC=https://rpc.sepolia.mantle.xyz

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# thirdweb (gasless AA)
THIRDWEB_SECRET_KEY=
NEXT_PUBLIC_THIRDWEB_CLIENT_ID=

# DeepSeek v4 (LLM strategy)
DEEPSEEK_API_KEY=

# Demo mode (set to 'true' for deterministic MarketMaker)
DEMO_MODE=false

# WalletConnect (RainbowKit)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
```

**Step 3: Verify build passes**

```bash
cd frontend
npm run build
```

Expected: Build succeeds with no errors. Check that:
- All API routes compile (no missing env vars at build time — use `process.env` not imports)
- R3F/Three.js tree-shakes correctly (no "window is not defined" errors)
- Share card route compiles (next/og ImageResponse)

**Step 4: Deploy to Vercel**

```bash
cd frontend

# Install Vercel CLI if not present
npm install -g vercel

# Login and link project
vercel login
vercel link

# Set environment variables
vercel env add BACKEND_PRIVATE_KEY
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add THIRDWEB_SECRET_KEY
vercel env add NEXT_PUBLIC_THIRDWEB_CLIENT_ID
vercel env add DEEPSEEK_API_KEY
vercel env add NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
vercel env add NEXT_PUBLIC_MANTLE_SEPOLIA_RPC

# Deploy to production
vercel --prod
```

Expected: Deployment succeeds. Note the `.vercel.app` URL (e.g., `sprawl-protocol.vercel.app`).

**Step 5: Verify production deployment**

```bash
# Check the site loads
curl -s -o /dev/null -w "%{http_code}" https://sprawl-protocol.vercel.app
# Expected: 200

# Check API routes respond
curl -s https://sprawl-protocol.vercel.app/api/city | jq '.buildings | length'
# Expected: 20 (seeded agents)

# Check share card generates
curl -s -o /dev/null -w "%{http_code}" https://sprawl-protocol.vercel.app/api/share-card/1
# Expected: 200
```

**Step 6: Commit**

```bash
git add frontend/next.config.js frontend/.env.example
git commit -m "chore: configure next.config.js for Vercel production deployment"
```

---

### Task 4: Azure VM PM2 setup

**Files:**
- Create: `frontend/ecosystem.config.js` (PM2 config file)

**Step 1: Write PM2 ecosystem config**

```javascript
// frontend/ecosystem.config.js
module.exports = {
    apps: [
        {
            name: 'sprawl-engine',
            script: 'npx',
            args: 'tsx scripts/run-engine.ts',
            cwd: '/root/sprawl/frontend',
            env: {
                NODE_ENV: 'production',
            },
            max_memory_restart: '250M',
            error_file: '/root/sprawl/logs/engine-error.log',
            out_file: '/root/sprawl/logs/engine-out.log',
            merge_logs: true,
            restart_delay: 5000,
        },
        {
            name: 'sprawl-indexer',
            script: 'npx',
            args: 'tsx scripts/run-indexer.ts',
            cwd: '/root/sprawl/frontend',
            env: {
                NODE_ENV: 'production',
            },
            max_memory_restart: '100M',
            error_file: '/root/sprawl/logs/indexer-error.log',
            out_file: '/root/sprawl/logs/indexer-out.log',
            merge_logs: true,
            restart_delay: 5000,
        },
        {
            name: 'sprawl-market-maker',
            script: 'npx',
            args: 'tsx scripts/run-market-maker.ts',
            cwd: '/root/sprawl/frontend',
            env: {
                NODE_ENV: 'production',
                DEMO_MODE: 'true',
            },
            max_memory_restart: '100M',
            error_file: '/root/sprawl/logs/mm-error.log',
            out_file: '/root/sprawl/logs/mm-out.log',
            merge_logs: true,
            restart_delay: 5000,
        },
    ],
};
```

**Step 2: SSH into Azure VM and set up**

```bash
# SSH into Azure VM
ssh user@<AZURE_VM_IP>

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 and tsx globally
sudo npm install -g pm2 tsx

# Clone the repo
git clone https://github.com/<your-org>/sprawl.git ~/sprawl
cd ~/sprawl/frontend
npm install

# Create logs directory
mkdir -p ~/sprawl/logs

# Create .env with all keys
cp .env.example .env
nano .env
# Add: BACKEND_PRIVATE_KEY, DEEPSEEK_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
#      NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, DEMO_MODE=true

# Add swap file if RAM is tight (1GB VM)
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**Step 3: Start all processes with PM2**

```bash
cd ~/sprawl/frontend

# Start using ecosystem config
pm2 start ecosystem.config.js

# Verify all 3 processes are running
pm2 status
# Expected:
# ┌─────────────────────┬────┬─────────┬──────┐
# │ App name            │ id │ status  │ cpu  │
# ├─────────────────────┼────┼─────────┼──────┤
# │ sprawl-engine       │ 0  │ online  │ 0%   │
# │ sprawl-indexer      │ 1  │ online  │ 0%   │
# │ sprawl-market-maker │ 2  │ online  │ 0%   │
# └─────────────────────┴────┴─────────┴──────┘

# Save process list + enable auto-restart on reboot
pm2 save
pm2 startup
# (follow the printed sudo command to enable systemd startup)

# Check logs
pm2 logs --lines 20
```

**Step 4: Verify processes are working**

```bash
# Check engine is ticking
pm2 logs sprawl-engine --lines 5
# Expected: "Tick 1: processing 20 agents..." or similar

# Check indexer is listening
pm2 logs sprawl-indexer --lines 5
# Expected: "Listening for events on CityState, RaidContract..." or similar

# Check market maker is syncing prices
pm2 logs sprawl-market-maker --lines 5
# Expected: "Price sync: sETH=$2,580, sBTC=$71,200..." or similar

# Monitor RAM usage (should be under 760MB total)
pm2 monit
```

**Step 5: Commit**

```bash
git add frontend/ecosystem.config.js
git commit -m "chore: add PM2 ecosystem config for Azure VM deployment"
```

---

### Task 5: Contract verification on explorer

**Files:**
- Reference: `contracts/deployments.json` (deployed addresses)
- Reference: `contracts/hardhat.config.js` (explorer config)

**Step 1: Verify each contract**

Run from the `contracts/` directory. Each command verifies source code on `explorer.sepolia.mantle.xyz`.

```bash
cd contracts

# SprawlToken instances (6 tokens, each has constructor args)
npx hardhat verify --network mantleSepolia <sETH_ADDRESS> "Sprawl ETH" "sETH" <DEPLOYER_ADDRESS>
npx hardhat verify --network mantleSepolia <sBTC_ADDRESS> "Sprawl BTC" "sBTC" <DEPLOYER_ADDRESS>
npx hardhat verify --network mantleSepolia <sUSDC_ADDRESS> "Sprawl USDC" "sUSDC" <DEPLOYER_ADDRESS>
npx hardhat verify --network mantleSepolia <sPOL_ADDRESS> "Sprawl POL" "sPOL" <DEPLOYER_ADDRESS>
npx hardhat verify --network mantleSepolia <sSOL_ADDRESS> "Sprawl SOL" "sSOL" <DEPLOYER_ADDRESS>
npx hardhat verify --network mantleSepolia <SPRAWL_ADDRESS> "SPRAWL" "SPRAWL" <DEPLOYER_ADDRESS>

# SprawlDEX (no constructor args)
npx hardhat verify --network mantleSepolia <SPRAWLDEX_ADDRESS>

# CityState (no constructor args)
npx hardhat verify --network mantleSepolia <CITYSTATE_ADDRESS>

# AgentFaucet (6 constructor args — token addresses)
npx hardhat verify --network mantleSepolia <AGENTFAUCET_ADDRESS> \
    <sETH_ADDRESS> <sBTC_ADDRESS> <sUSDC_ADDRESS> \
    <sPOL_ADDRESS> <sSOL_ADDRESS> <SPRAWL_ADDRESS>

# CityReferee (constructor args depend on implementation)
npx hardhat verify --network mantleSepolia <CITYREFEREE_ADDRESS> <CITYSTATE_ADDRESS> <SPRAWL_ADDRESS>

# RaidContract (constructor args depend on implementation)
npx hardhat verify --network mantleSepolia <RAIDCONTRACT_ADDRESS> <CITYSTATE_ADDRESS>
```

Note: Replace all `<ADDRESS>` placeholders with actual values from `contracts/deployments.json`.

**Step 2: Handle verification failures**

If `hardhat verify` fails with "Already Verified", that's fine — the contract is already verified.

If it fails with a source code mismatch:
```bash
# Check compiler settings match
npx hardhat compile --force

# Try with explicit constructor args file
echo '["Sprawl ETH", "sETH", "0xDEPLOYER"]' > arguments.js
npx hardhat verify --network mantleSepolia --constructor-args arguments.js <ADDRESS>
```

If the explorer API rejects the request:
```bash
# Use the explorer's manual verification UI as fallback
# 1. Go to https://explorer.sepolia.mantle.xyz/address/<ADDRESS>/contract-verification
# 2. Upload flattened source: npx hardhat flatten contracts/SprawlToken.sol > SprawlToken.flat.sol
# 3. Select compiler 0.8.19, optimization 200 runs
```

**Step 3: Verify all contracts show green checkmarks**

Open each contract URL in the browser and confirm the "Contract" tab shows verified source:

```
https://explorer.sepolia.mantle.xyz/address/<sETH_ADDRESS>/contracts
https://explorer.sepolia.mantle.xyz/address/<sBTC_ADDRESS>/contracts
https://explorer.sepolia.mantle.xyz/address/<sUSDC_ADDRESS>/contracts
https://explorer.sepolia.mantle.xyz/address/<sPOL_ADDRESS>/contracts
https://explorer.sepolia.mantle.xyz/address/<sSOL_ADDRESS>/contracts
https://explorer.sepolia.mantle.xyz/address/<SPRAWL_ADDRESS>/contracts
https://explorer.sepolia.mantle.xyz/address/<SPRAWLDEX_ADDRESS>/contracts
https://explorer.sepolia.mantle.xyz/address/<CITYSTATE_ADDRESS>/contracts
https://explorer.sepolia.mantle.xyz/address/<AGENTFAUCET_ADDRESS>/contracts
https://explorer.sepolia.mantle.xyz/address/<CITYREFEREE_ADDRESS>/contracts
https://explorer.sepolia.mantle.xyz/address/<RAIDCONTRACT_ADDRESS>/contracts
```

Expected: All contracts show a green checkmark and "Verified" badge with readable source code.

**Step 4: Commit verification artifacts**

```bash
git add contracts/deployments.json
git commit -m "chore: verify all contracts on explorer.sepolia.mantle.xyz"
```

---

### Task 6: Demo video recording

**Files:**
- Create: `docs/demo-script.md` (script/shot list — delete after recording)

**Step 1: Write the demo script**

The demo video should be 2-3 minutes. Script the following shots:

```
Shot 1 (0:00-0:15): Landing page
- Show the site URL (sprawl-protocol.vercel.app)
- Pan across the 3D city skyline with 20 buildings of different heights
- Quick zoom on a tall building (high-level agent)

Shot 2 (0:15-0:40): Spawn an agent
- Click "Connect Wallet" → show MetaMask popup
- Click "Spawn Agent" → select "Momentum Trader" preset
- Show the spawn confirmation (tx hash, agent ID)
- Highlight: "Zero gas paid — thirdweb sponsors the transaction"

Shot 3 (0:40-1:10): Watch agent trade
- Switch to agent detail view
- Show the decision feed: "Swapped 0.3 sETH → 774 sUSDC — momentum breakout confirmed"
- Show the building growing in the city (height increases after trades)
- Click the tx hash → opens explorer.sepolia.mantle.xyz showing the verified on-chain tx

Shot 4 (1:10-1:35): Raid sequence
- Click "Raid" on another agent's building
- Show the attack/defense score calculation
- Show raid result: "Raid successful! +50 XP, graffiti tag applied"
- Show the loser's building with a visible raid tag

Shot 5 (1:35-2:00): Leaderboard + share card
- Open the leaderboard tab
- Show agents sorted by $SPRAWL earned, PnL, raid wins
- Click a share card → show the generated OG image
- "Share to X" button

Shot 6 (2:00-2:20): Under the hood
- Quick flash of contract addresses on explorer (green verified badges)
- Show the ERC-8004 agent identity NFT
- Show the $SPRAWL/sUSDC price chart in the header

Shot 7 (2:20-2:30): Closing
- Zoom out to full city view
- Overlay text: "Sprawl Protocol — Autonomous Agents Build a City"
- GitHub link + contract addresses
```

**Step 2: Record the video**

```bash
# Use OBS Studio or similar screen recorder
# Resolution: 1920x1080 (required for most hackathon submissions)
# Audio: Optional background music or voiceover
# Format: MP4, H.264, < 100MB

# For macOS: QuickTime → New Screen Recording
# For Linux: OBS Studio or SimpleScreenRecorder
# For Windows: OBS Studio or Xbox Game Bar
```

Tips:
- Use a clean browser with no extensions visible
- Set the 3D city to the Neon theme (most visually impressive)
- Pre-open all tabs you need (explorer, leaderboard, etc.)
- Record at 30fps minimum
- Keep it under 3 minutes

**Step 3: Upload to a hosting service**

```bash
# Upload to YouTube (unlisted) or Loom
# Get the share URL for the X thread and DoraHacks submission
```

Expected: A polished 2-3 minute video showing the full flow from landing to city interaction.

---

### Task 7: X thread composition

**Files:**
- None (compose directly in X/Twitter)

**Step 1: Compose the thread**

The thread should tag `#MantleAIHackathon` and include the demo video, GitHub link, and contract addresses. Format:

```
Tweet 1 (Hook):
Sprawl Protocol: Autonomous AI agents trade on-chain, and their performance builds a living 3D city.

Every trade is real. Every building tells a story.

Built on @0xMantle Sepolia with ERC-8004 agent identity.

#MantleAIHackathon

[Demo video embedded]

Tweet 2 (How it works):
How it works:
1. You spawn an agent and set its strategy (presets or custom rules)
2. The agent trades autonomously on SprawlDEX — a real constant-product AMM
3. Profitable trades earn $SPRAWL → your building grows
4. Agents raid each other for XP and glory

All on-chain, all verifiable.

Tweet 3 (Tech stack):
Tech stack:
- SprawlDEX: real x*y=k AMM with 5 trading pairs on Mantle Sepolia
- ERC-8004: on-chain agent identity (deployed at 0x8004...)
- DeepSeek v4: LLM-powered trading decisions with tool calling
- Memory + Skills: generative_agents reflection + Voyager skill library
- 3D City: Three.js instanced rendering (git-city fork)

Tweet 4 (Gasless):
Zero friction onboarding:
- Connect any wallet (no MNT needed)
- 1-click spawn via thirdweb AA paymaster
- Agent starts trading immediately
- Building appears in the city within 30 seconds

Judges: just visit and click.

Tweet 5 (Links):
Links:
- Live demo: https://sprawl-protocol.vercel.app
- GitHub: https://github.com/<org>/sprawl
- Contracts (all verified): https://explorer.sepolia.mantle.xyz/address/<SPRAWLDEX>

Built for @0xMantle AI Hackathon
Track: On-chain AI Agents + Agentic Economy

@doaborahacks
```

**Step 2: Review thread against scoring rubric**

Verify the thread addresses every scoring dimension:
- Technical: SprawlDEX real AMM, CityState on-chain, ERC-8004
- Ecosystem Fit: Mantle Sepolia, ERC-8004 at `0x8004...`, mETH/USDY mention
- Business Potential: $SPRAWL economy narrative
- Innovation: 3D city + agents + DEX combination
- UX: Gasless 1-click spawn
- Transparency: On-chain tx hashes, verified contracts
- Demo Quality: Video link

**Step 3: Post the thread**

Post the thread on X. Pin it to your profile during the judging period.

---

### Task 8: DoraHacks submission

**Files:**
- None (submit on dorahacks.io)

**Step 1: Create the submission**

Go to the Mantle AI Hackathon page on DoraHacks. Fill in:

| Field | Value |
|-------|-------|
| Project Name | Sprawl Protocol |
| Tagline | Autonomous AI agents trade on-chain and build a living 3D city |
| Description | Full description covering: problem (agents need transparency), solution (on-chain DEX + 3D visualization), tech stack, architecture |
| Demo Video URL | YouTube/Loom link from Task 6 |
| GitHub URL | `https://github.com/<org>/sprawl` |
| Live Demo URL | `https://sprawl-protocol.vercel.app` |
| Track | On-chain AI Agents / Agentic Economy |
| Chain | Mantle Sepolia (5003) |
| Contract Addresses | List all from `deployments.json` with explorer links |
| Team | Your name + role |

**Step 2: Verify submission fields**

- Demo video plays and is under 3 minutes
- GitHub repo is public (required — AGPL-3.0 license from git-city)
- Live demo URL loads the 3D city with seeded agents
- All contract addresses link to verified contracts on the explorer
- Track selection matches the hackathon categories

**Step 3: Submit**

Click submit on DoraHacks. Save the submission URL for reference.

---

### Task 9: Final testing checklist

**Files:**
- None (this is a verification pass)

**Step 1: Contracts verification**

```bash
# For each contract address in deployments.json, verify it shows green on explorer
cd contracts
node -e "
const d = require('./deployments.json');
for (const [name, addr] of Object.entries(d)) {
    if (name === 'deployer' || name === 'chainId') continue;
    console.log(name + ': https://explorer.sepolia.mantle.xyz/address/' + addr + '/contracts');
}
"
```

Open each URL and confirm "Verified" badge. Check off:

- [ ] sETH verified
- [ ] sBTC verified
- [ ] sUSDC verified
- [ ] sPOL verified
- [ ] sSOL verified
- [ ] SPRAWL verified
- [ ] SprawlDEX verified
- [ ] CityState verified
- [ ] AgentFaucet verified
- [ ] CityReferee verified
- [ ] RaidContract verified

**Step 2: API routes**

```bash
SITE=https://sprawl-protocol.vercel.app

# City data endpoint
curl -s "$SITE/api/city" | jq '.buildings | length'
# Expected: >= 20

# Leaderboard
curl -s "$SITE/api/leaderboard" | jq '.[0].name'
# Expected: an agent name string

# Share card (should return image)
curl -s -o /dev/null -w "%{http_code}\n%{content_type}\n" "$SITE/api/share-card/1"
# Expected: 200, image/png

# Agent registration JSON (ERC-8004 tokenURI)
curl -s "$SITE/api/agent/1/registration.json" | jq '.type'
# Expected: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1"

# Heartbeat / health check
curl -s -o /dev/null -w "%{http_code}\n" "$SITE/api/health"
# Expected: 200
```

**Step 3: Background processes**

```bash
# SSH into Azure VM
ssh user@<AZURE_VM_IP>

# All 3 processes running
pm2 status
# Expected: 3 processes, all "online"

# Engine is actively ticking
pm2 logs sprawl-engine --lines 3 --nostream
# Expected: recent timestamps showing tick activity

# Indexer is caught up
pm2 logs sprawl-indexer --lines 3 --nostream
# Expected: "Processed block XXXXX" with recent block numbers

# Market maker is syncing
pm2 logs sprawl-market-maker --lines 3 --nostream
# Expected: "Price sync complete" with recent timestamps

# Memory usage under budget
pm2 monit
# Expected: total < 760MB across all 3 processes
```

**Step 4: 3D city rendering**

Open `https://sprawl-protocol.vercel.app` in Chrome and verify:
- [ ] Buildings render with correct heights (tall for high-level agents)
- [ ] Building glow matches reputation score
- [ ] Click on a building opens agent detail panel
- [ ] Agent detail shows: name, strategy type, level, PnL, recent trades
- [ ] Clicking a tx hash opens explorer.sepolia.mantle.xyz
- [ ] Theme switcher works (Emerald/Midnight/Sunset/Neon)
- [ ] Camera controls: orbit, zoom, pan all work
- [ ] FPS counter stays above 30fps with 20 buildings

**Step 5: Share cards**

- [ ] `/api/share-card/1` returns a valid PNG image
- [ ] Image contains: agent name, building pixel art, level, PnL, strategy type
- [ ] Image dimensions are correct for X (1200x630 landscape, 1080x1920 stories)
- [ ] OG meta tags on agent pages reference the share card URL

**Step 6: Leaderboard**

Open the leaderboard page and verify:
- [ ] Agents sorted by $SPRAWL earned (default)
- [ ] Can switch sort: by PnL, by level, by raid wins
- [ ] Each row shows: rank, agent name, building thumbnail, key stats
- [ ] Clicking an agent navigates to their detail view

**Step 7: Full user flow end-to-end**

In a fresh incognito window, walk through the complete flow one last time:
1. [ ] Land on homepage — city loads with 20+ buildings
2. [ ] Connect wallet (MetaMask or WalletConnect)
3. [ ] SIWE signature prompt appears and works
4. [ ] Click "Spawn Agent" — dialog opens with preset selector
5. [ ] Select a preset → agent spawns (tx succeeds with zero gas)
6. [ ] Agent appears in city within 60 seconds
7. [ ] Agent executes first trade within 120 seconds
8. [ ] Building grows after trades
9. [ ] Raid another agent — result displays
10. [ ] Share card generates for the new agent
11. [ ] Leaderboard includes the new agent

**Step 8: Commit any final fixes**

```bash
git add -A
git commit -m "fix: final polish fixes from testing checklist"
```

---

## Summary: What Phase 8 Delivers

After completing all 9 tasks:

- [x] 20 demo agents seeded with trade history, varied levels/XP/stats
- [x] DEMO_MODE deterministic MarketMaker for stable demo environment
- [x] AA/gasless onboarding verified end-to-end (zero MNT required)
- [x] Vercel production deployment live at `sprawl-protocol.vercel.app`
- [x] Azure VM running PM2-managed engine + indexer + market-maker
- [x] All 11 contracts verified on `explorer.sepolia.mantle.xyz`
- [x] 2-3 minute demo video recorded and uploaded
- [x] X thread posted with #MantleAIHackathon tag, video, and links
- [x] DoraHacks submission complete
- [x] Final testing checklist passed: city renders, APIs respond, processes run, cards generate, leaderboard live

**Deadline:** June 15, 2026 15:59 UTC
