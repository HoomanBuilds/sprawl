# Sprawl Protocol — Implementation Plan

> Deadline: June 15, 2026 15:59 | Demo Day: July 2-3 | Chain: Mantle Sepolia (5003)

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│  LAYER 5: 3D CITY + UI                                       │
│  Next.js 16 + R3F + InstancedBuildings (git-city fork)       │
│  Policy Editor (presets + rule builder)                       │
│  Share Cards, Leaderboard, Watch Mode                        │
├──────────────────────────────────────────────────────────────┤
│  LAYER 4: DATA LAYER                                         │
│  Supabase (Postgres + Realtime + RLS)                        │
│  Mantle Event Indexer (Node listener)                         │
├──────────────────────────────────────────────────────────────┤
│  LAYER 3: AGENT ENGINE                                       │
│  Custom TS runtime (ai-town tick loop + generative_agents    │
│  memory + Voyager skill library)                             │
│  DeepSeek v4 for LLM-driven agents                           │
│  Policy engine for rule-driven agents                        │
├──────────────────────────────────────────────────────────────┤
│  LAYER 2: ON-CHAIN EXECUTION                                 │
│  viem/ethers direct tx signing (Signatory pattern)           │
│  SprawlDEX (real-price-tracking AMM) + $SPRAWL economy       │
│  thirdweb embedded wallets (gasless onboarding)              │
│  GuardrailLayer (dry-run, caps, rate limits)                 │
├──────────────────────────────────────────────────────────────┤
│  LAYER 1: SMART CONTRACTS (Mantle Sepolia 5003)              │
│  ERC-8004 (already deployed at 0x8004...)                    │
│  SprawlDEX + SprawlTokens (sETH/sBTC/sPOL/sSOL/sUSDC/$SPRAWL) │
│  CityState + CityReferee + RaidContract + BillboardContract  │
└──────────────────────────────────────────────────────────────┘
```

## Core Concept

Humans spawn agents and set their policies (strategy presets or custom rules). Agents act autonomously — trading real-price-tracking tokens (sETH, sBTC, sPOL, sSOL) on SprawlDEX, earning $SPRAWL from profitable trades, battling each other in raids, and building reputation. Every action is recorded on-chain via CityState events. The 3D city renders agent activity as a living skyline: buildings grow from $SPRAWL earned, glow from reputation, animate from recent trades, and fight via raids. The $SPRAWL token price on SprawlDEX IS the city's economic health indicator — it rises when agents thrive and falls when they struggle.

---

## Phase 1: Contracts + Chain Foundation (Days 1-3)

### 1.1 Project Scaffold

**Two folders. npm. Same pattern as Signatory.**

```
sprawl/
├── contracts/                    ← Hardhat + ethers v5 (same as Signatory)
│   ├── contracts/                ← Solidity source
│   │   ├── SprawlDEX.sol
│   │   ├── SprawlToken.sol
│   │   ├── CityState.sol
│   │   ├── CityReferee.sol
│   │   ├── RaidContract.sol
│   │   ├── BillboardContract.sol
│   │   └── AgentFaucet.sol
│   ├── scripts/                  ← Hardhat deploy scripts
│   │   ├── deploy.js             ← deploys all contracts in order
│   │   └── seed-pools.js         ← seeds SprawlDEX with initial liquidity
│   ├── test/                     ← Hardhat tests
│   ├── hardhat.config.js
│   └── package.json
│
├── frontend/                     ← Next.js 16 — EVERYTHING else lives here
│   ├── src/
│   │   ├── app/                  ← Next.js pages + API routes
│   │   │   ├── api/
│   │   │   │   ├── city/         ← city data aggregation endpoint
│   │   │   │   ├── agent/        ← spawn, policy CRUD, registration.json
│   │   │   │   ├── raid/         ← raid execution
│   │   │   │   ├── auth/         ← SIWE verify
│   │   │   │   ├── share-card/   ← OG image generation
│   │   │   │   └── feed/         ← activity feed
│   │   │   ├── page.tsx          ← 3D city home
│   │   │   ├── spawn/            ← agent spawning + policy editor
│   │   │   ├── leaderboard/      ← rankings
│   │   │   └── layout.tsx        ← RainbowKit + Wagmi + SIWE
│   │   │
│   │   ├── components/           ← 3D renderer (copied from git-city)
│   │   │   ├── InstancedBuildings.tsx
│   │   │   ├── CityCanvas.tsx
│   │   │   ├── CityScene.tsx
│   │   │   ├── Building3D.tsx
│   │   │   ├── InstancedLabels.tsx
│   │   │   ├── EffectsLayer.tsx
│   │   │   ├── BuildingEffects.tsx
│   │   │   ├── RaidTag3D.tsx
│   │   │   ├── LiveDots.tsx
│   │   │   ├── DropBeacon.tsx
│   │   │   ├── LoadingScreen.tsx
│   │   │   └── ui/               ← policy editor, leaderboard, feed components
│   │   │
│   │   ├── lib/                  ← shared business logic
│   │   │   ├── engine/           ← agent tick loop, strategy engines
│   │   │   │   ├── game-loop.ts
│   │   │   │   ├── policy-strategy.ts
│   │   │   │   ├── llm-strategy.ts
│   │   │   │   ├── guardrails.ts
│   │   │   │   └── constants.ts
│   │   │   ├── memory/           ← memory stream, retrieval, reflection
│   │   │   │   ├── memory-stream.ts
│   │   │   │   ├── retrieval.ts
│   │   │   │   ├── reflection.ts
│   │   │   │   └── embeddings-cache.ts
│   │   │   ├── skills/           ← Voyager-pattern skill library
│   │   │   │   ├── skill-manager.ts
│   │   │   │   └── critic.ts
│   │   │   ├── indexer/          ← Mantle event listener → Supabase
│   │   │   │   └── index.ts
│   │   │   ├── market-maker/     ← CoinGecko feed → SprawlDEX trades
│   │   │   │   └── index.ts
│   │   │   ├── execution/        ← on-chain tx building + signing
│   │   │   │   ├── swap.ts
│   │   │   │   ├── executor.ts
│   │   │   │   └── pnl-tracker.ts
│   │   │   ├── identity/         ← ERC-8004 registration, reputation
│   │   │   │   ├── register.ts
│   │   │   │   ├── agent-card.ts
│   │   │   │   └── reputation.ts
│   │   │   ├── city-layout.ts    ← building placement (adapted from git-city)
│   │   │   ├── xp.ts            ← XP formulas (copied from git-city)
│   │   │   ├── raid.ts          ← raid scoring (copied from git-city)
│   │   │   ├── zones.ts         ← cosmetics zones (copied from git-city)
│   │   │   ├── achievements.ts  ← achievement engine (copied from git-city)
│   │   │   ├── dailies.ts       ← daily missions (copied from git-city)
│   │   │   ├── deepseek.ts      ← DeepSeek v4 client (from Signatory)
│   │   │   ├── ethers-provider.ts ← provider factory (from Signatory)
│   │   │   ├── supabase.ts      ← Supabase clients (from git-city)
│   │   │   ├── chains.ts        ← Mantle Sepolia chain config
│   │   │   ├── config.ts        ← contract addresses, env vars
│   │   │   └── perfMode.ts      ← performance monitor (from git-city)
│   │   │
│   │   ├── hooks/                ← React hooks
│   │   ├── types/                ← AgentRecord, CityBuilding, etc.
│   │   └── constants/            ← contract ABIs, addresses
│   │
│   ├── scripts/                  ← standalone Node.js entry points
│   │   ├── run-engine.ts         ← starts agent tick loop
│   │   ├── run-indexer.ts        ← starts Mantle event listener
│   │   ├── run-market-maker.ts   ← starts price feed bot
│   │   ├── seed-demo.ts          ← pre-seeds 20 demo agents
│   │   └── run-all.ts            ← convenience: starts engine + indexer + market-maker together
│   │
│   ├── supabase/
│   │   └── migrations/           ← SQL migrations
│   ├── package.json
│   └── next.config.js
```

**Deployment map:**

| What | Deploy to | Command |
|------|-----------|---------|
| Contracts | Mantle Sepolia | `cd contracts && npx hardhat run scripts/deploy.js --network mantleSepolia` |
| Frontend + API routes | Vercel | `cd frontend && vercel deploy` (auto on git push) |
| Agent engine | Your laptop / Railway $5/mo | `cd frontend && npx tsx scripts/run-engine.ts` |
| Indexer | Same as engine | `cd frontend && npx tsx scripts/run-indexer.ts` |
| Market maker | Same as engine | `cd frontend && npx tsx scripts/run-market-maker.ts` |
| All background processes | Same as engine | `cd frontend && npx tsx scripts/run-all.ts` |
| Seed demo | One-time before demo | `cd frontend && npx tsx scripts/seed-demo.ts` |

The scripts in `frontend/scripts/` import directly from `frontend/src/lib/` — shared types, shared Supabase client, shared contract ABIs. Zero duplication.

**For the hackathon demo**: `vercel deploy` for the frontend, then run the background processes on your Azure VM.

**Infrastructure:**

| Service | Where | Cost |
|---------|-------|------|
| Frontend + API routes | Vercel Hobby (free) | $0 |
| Database | Supabase free tier | $0 |
| Contracts | Mantle Sepolia (faucet MNT) | $0 |
| Background processes (engine + indexer + market-maker) | Azure Ubuntu VM (1GB RAM, free) | $0 |
| LLM inference | DeepSeek v4 API (your key) | ~$32/day (apply for $110K credit pool) |

**Azure VM setup (one-time):**
```bash
# SSH into your Azure VM
sudo apt update && sudo apt install -y nodejs npm
sudo npm install -g pm2 tsx

# Clone the repo
git clone <your-repo> ~/sprawl && cd ~/sprawl/frontend
npm install

# Create .env with all keys
cp .env.example .env
nano .env  # add BACKEND_PRIVATE_KEY, DEEPSEEK_API_KEY, SUPABASE_URL, etc.

# Start all 3 processes via PM2
pm2 start "npx tsx scripts/run-engine.ts" --name sprawl-engine
pm2 start "npx tsx scripts/run-indexer.ts" --name sprawl-indexer
pm2 start "npx tsx scripts/run-market-maker.ts" --name sprawl-market-maker

# Auto-restart on reboot
pm2 save && pm2 startup

# Monitor
pm2 logs          # live logs from all 3
pm2 monit         # RAM/CPU dashboard
```

**1GB RAM budget:**
- OS + Node.js runtime: ~400MB
- Engine process: ~200MB (DeepSeek calls are HTTP, not local inference)
- Indexer process: ~80MB (WebSocket listener + Supabase writes)
- Market maker process: ~80MB (CoinGecko fetch + DEX swap txs)
- **Total: ~760MB** — fits with ~240MB headroom

If RAM gets tight, add a 1GB swap file: `sudo fallocate -l 1G /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`

### 1.2 CityState Contract

The central on-chain ledger. Minimal storage, rich events.

```solidity
// Events (cheap, ~8 gas/byte — the indexer reads these)
event AgentSpawned(uint256 indexed agentId, address indexed wallet, uint8 strategyType);
event AgentDecision(uint256 indexed agentId, string action, string protocol, bytes params, uint256 ts);
event AgentOutcome(uint256 indexed agentId, int256 pnlDelta, uint256 newVolume, uint256 newLevel);
event BuildingGrew(uint256 indexed agentId, uint256 newHeight, uint256 newWidth);
event RaidResult(uint256 indexed attackerId, uint256 indexed defenderId, bool attackerWon, uint256 spoilsXp);

// Minimal storage (only what must be on-chain for verification)
mapping(uint256 => AgentStats) public agents;
struct AgentStats {
    uint256 totalVolume;    // cumulative trade volume (always increases)
    int256  netPnl;         // net profit/loss
    uint256 level;          // current level
    uint256 raidWins;       // total raid victories
    uint256 raidLosses;
    uint8   strategyType;   // 0=preset, 1=rules, 2=llm
}
```

**Reference**: Event-over-storage pattern from doc3 section 7. Gas cost analysis: events ~8 gas/byte vs SSTORE ~20K gas per slot.

### 1.3 CityReferee Contract

Trusted intermediary that writes to the already-deployed ERC-8004 ReputationRegistry on Mantle Sepolia.

```solidity
function recordOutcome(uint256 agentId, int256 pnl, string memory tag) external onlyEngine {
    // Update CityState
    cityState.updateAgent(agentId, pnl);
    
    // Write to ERC-8004 Reputation (already at 0x8004B663...)
    int128 score = _pnlToScore(pnl); // normalize to 0-100 scale
    reputationRegistry.giveFeedback(agentId, score, 2, tag, "", "", "", bytes32(0), feedbackAuth);
}
```

**Reference**: ERC-8004 ReputationRegistry is deployed at `0x8004B663056A597Dffe9eCcC1965A193B7388713` on Mantle Sepolia. Interface from `inspiration/erc-8004-tee-agent/src/agent/registry.py` lines 163-236. The `giveFeedback` signature: `(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash, bytes feedbackAuth)`.

### 1.4 RaidContract

```solidity
function initiateRaid(uint256 attackerId, uint256 defenderId) external {
    require(raidCooldown[attackerId] < block.timestamp, "Cooldown active");
    require(dailyRaids[attackerId][today()] < 3, "Max 3 raids/day");
    require(weeklyTarget[attackerId][defenderId] == 0, "Already raided this week");
    
    AgentStats memory a = cityState.agents(attackerId);
    AgentStats memory d = cityState.agents(defenderId);
    
    uint256 attackScore = a.totalVolume * 3 + a.raidWins * 50 + a.level * 10;
    uint256 defenseScore = d.totalVolume * 3 + d.raidWins * 30 + d.level * 10;
    
    bool attackerWon = attackScore > defenseScore;
    emit RaidResult(attackerId, defenderId, attackerWon, XP_REWARD);
}
```

**Reference**: Scoring formula adapted from `inspiration/git-city/src/lib/raid.ts` lines 51-81. Original uses `weeklyContributions*3 + appStreak*1 + weeklyKudos*2`. We remap: `weeklyContributions` → `totalVolume`, `appStreak` → `raidWins`, `weeklyKudos` → `level`.

### 1.5 SprawlDEX — Realistic Testnet Market Simulation

A full constant-product AMM that behaves like a real DEX with dynamic prices, slippage, fees, and market volatility. Deployed on Mantle Sepolia so every trade is a real on-chain transaction agents can verify.

**Why not a simple mock**: Judges score "meaningful simulation" and "strategy design & risk management." A static-price mock proves nothing. A real AMM with moving prices lets agents demonstrate actual strategy intelligence — buying dips, avoiding slippage, timing entries, managing risk.

#### Core AMM Contract: `SprawlDEX.sol`

```solidity
contract SprawlDEX {
    struct Pool {
        address tokenA;
        address tokenB;
        uint256 reserveA;
        uint256 reserveB;
        uint256 feeNumerator;    // e.g., 3 for 0.3%
        uint256 feeDenominator;  // e.g., 1000
        uint256 totalSwaps;
        uint256 totalVolumeA;
        uint256 totalVolumeB;
    }
    
    mapping(bytes32 => Pool) public pools;  // keccak256(tokenA, tokenB) => Pool
    
    event PoolCreated(address indexed tokenA, address indexed tokenB, uint256 reserveA, uint256 reserveB);
    event Swap(address indexed trader, address indexed tokenIn, address indexed tokenOut, 
               uint256 amountIn, uint256 amountOut, uint256 priceAfter, uint256 fee);
    event LiquidityAdded(address indexed provider, bytes32 indexed poolId, uint256 amountA, uint256 amountB);
    event LiquidityRemoved(address indexed provider, bytes32 indexed poolId, uint256 amountA, uint256 amountB);
    
    // --- Swap with real x*y=k math and fee ---
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin) 
        external returns (uint256 amountOut) 
    {
        Pool storage pool = _getPool(tokenIn, tokenOut);
        
        // Deduct fee from input
        uint256 amountInAfterFee = amountIn * (pool.feeDenominator - pool.feeNumerator) / pool.feeDenominator;
        
        // Constant product: x * y = k
        uint256 reserveIn = _getReserve(pool, tokenIn);
        uint256 reserveOut = _getReserve(pool, tokenOut);
        amountOut = (amountInAfterFee * reserveOut) / (reserveIn + amountInAfterFee);
        
        require(amountOut >= amountOutMin, "Slippage exceeded");
        require(amountOut < reserveOut, "Insufficient liquidity");
        
        // Transfer tokens
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).transfer(msg.sender, amountOut);
        
        // Update reserves
        _updateReserves(pool, tokenIn, tokenOut, amountIn, amountOut);
        pool.totalSwaps++;
        
        // Emit with new price for indexer
        uint256 priceAfter = (_getReserve(pool, tokenOut) * 1e18) / _getReserve(pool, tokenIn);
        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut, priceAfter, amountIn - amountInAfterFee);
    }
    
    // --- LP: provide liquidity ---
    function addLiquidity(address tokenA, address tokenB, uint256 amountA, uint256 amountB) external { ... }
    function removeLiquidity(address tokenA, address tokenB, uint256 lpShares) external { ... }
    
    // --- Read: price quotes without executing ---
    function getAmountOut(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256);
    function getPrice(address tokenA, address tokenB) external view returns (uint256); // price in 1e18
    function getPoolInfo(address tokenA, address tokenB) external view returns (Pool memory);
}
```

#### Token Suite: Real-Price-Tracking Tradeable Assets + $SPRAWL City Currency

Two kinds of tokens in the ecosystem:

**A) Tradeable assets** — mirror real crypto prices, agents buy/sell/hold/LP these:

```solidity
contract SprawlToken is ERC20 {
    address public minter;
    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "Only minter");
        _mint(to, amount);
    }
}
```

| Token | Symbol | Mirrors | Volatility | Initial Seed Price |
|-------|--------|---------|------------|-------------------|
| Sprawl ETH | sETH | Real ETH | High | ~$2,500 equivalent in sUSDC |
| Sprawl BTC | sBTC | Real BTC | High | ~$70,000 equivalent in sUSDC |
| Sprawl POL | sPOL | Real POL | Medium | ~$0.45 equivalent in sUSDC |
| Sprawl SOL | sSOL | Real SOL | High | ~$170 equivalent in sUSDC |
| Sprawl USDC | sUSDC | USDC stablecoin | Very low (pegged) | $1.00 (quote currency) |
| **$SPRAWL** | SPRAWL | **City currency** | Medium | Starts at 1.00 sUSDC |

**B) $SPRAWL — The City Currency** (see Section 1.7 for full economy design):

$SPRAWL is the native currency that runs the city. It's an ERC-20 on SprawlDEX with its own sUSDC pool. Agents earn it from profitable trading, raids, achievements — and spend it on raids, billboards, cosmetics, and compute boosts. Its price floats on the DEX like every other token.

#### Market Maker: Real-Price-Tracking Engine

The MarketMaker is an off-chain Node.js bot that **feeds real-world prices into SprawlDEX pools** by executing arbitrage trades that push pool prices toward real market prices.

```typescript
import { CoinGeckoClient } from 'coingecko-api-v3';

const PRICE_FEEDS: Record<string, string> = {
    'sETH':  'ethereum',
    'sBTC':  'bitcoin',
    'sPOL':  'matic-network',
    'sSOL':  'solana',
};

// Runs every 30 seconds
async function syncPrices() {
    // 1. Fetch real prices from CoinGecko (free, 30 req/min)
    const realPrices = await coingecko.simplePrice({
        ids: Object.values(PRICE_FEEDS).join(','),
        vs_currencies: 'usd'
    });
    
    for (const [token, coingeckoId] of Object.entries(PRICE_FEEDS)) {
        const realPrice = realPrices[coingeckoId].usd;
        const dexPrice = await sprawlDex.getPrice(tokenAddresses[token], tokenAddresses['sUSDC']);
        
        // 2. Calculate deviation from real price
        const deviation = (dexPrice - realPrice) / realPrice;
        
        // 3. If pool price deviates >0.5% from real, arb it back
        if (Math.abs(deviation) > 0.005) {
            const direction = deviation > 0 ? 'sell' : 'buy'; // sell if overpriced, buy if underpriced
            
            // Size: proportional to deviation, capped at 2% of reserves
            const intensity = Math.min(Math.abs(deviation) * 10, 0.02); // 0.5% dev → 5% of cap
            const tradeSize = poolReserves * intensity;
            
            if (direction === 'sell') {
                await sprawlDex.swap(token, sUSDC, tradeSize, 0); // push price down
            } else {
                await sprawlDex.swap(sUSDC, token, tradeSize * realPrice, 0); // push price up
            }
        }
        
        // 4. Add noise: small random trades for organic volume (±0.1-0.3% of reserves)
        const noiseSize = poolReserves * (0.001 + Math.random() * 0.002);
        const noiseDir = Math.random() > 0.5;
        await sprawlDex.swap(
            noiseDir ? token : sUSDC, 
            noiseDir ? sUSDC : token, 
            noiseSize, 0
        );
    }
    
    // 5. $SPRAWL price: driven by organic demand (agent earnings/spending), 
    //    plus small random perturbation. No peg — it floats freely.
    const sprawlNoise = poolReserves * (0.001 + Math.random() * 0.003);
    await sprawlDex.swap(
        Math.random() > 0.5 ? SPRAWL : sUSDC,
        Math.random() > 0.5 ? sUSDC : SPRAWL,
        sprawlNoise, 0
    );
}

setInterval(syncPrices, 30_000);
```

**What this gives us:**
- **sETH/sBTC/sPOL/sSOL prices track real markets** — agents analyzing "should I buy sETH" are making real market decisions, just with fake money
- **Real slippage**: large agent trades still move the pool price, MarketMaker arbs it back over ~30-60 seconds (realistic fill simulation)
- **$SPRAWL price is organic** — driven purely by agent earning/spending, no peg. If agents are earning a lot (city is growing), demand goes up and $SPRAWL appreciates. If agents dump their earnings, it drops. The $SPRAWL price IS the city's health metric.
- **Agents can hold positions** — buy sETH, wait for real ETH to pump, sell at a profit. Real trading intelligence rewarded.
- **LP yields are real** — agents providing sETH/sUSDC liquidity earn swap fees from both agent trades AND MarketMaker volume
- **Portfolio management matters** — agents allocate across volatile (sBTC), medium (sPOL), stable (sUSDC), and city currency ($SPRAWL)

#### Agent Faucet: `AgentFaucet.sol`

Mints starting portfolio to newly spawned agents:

```solidity
function fundNewAgent(address agentWallet) external {
    require(!funded[agentWallet], "Already funded");
    funded[agentWallet] = true;
    
    // Tradeable assets: ~$10K equivalent starting portfolio
    sUSDC.mint(agentWallet, 5_000 * 1e18);     // $5,000 in stables
    sETH.mint(agentWallet, 1 * 1e18);           // ~$2,500 in ETH
    sBTC.mint(agentWallet, 0.035 * 1e18);       // ~$2,500 in BTC
    
    // City currency: starter balance
    SPRAWL.mint(agentWallet, 100 * 1e18);       // 100 $SPRAWL to get started
}
```

Every agent starts with the same ~$10K portfolio + 100 $SPRAWL. Differentiation comes entirely from strategy quality — the purest benchmark.

### 1.7 $SPRAWL City Economy

$SPRAWL is the economic backbone of the city. It's what connects DeFi trading performance to city growth.

#### How agents EARN $SPRAWL:

| Source | Amount | Frequency |
|--------|--------|-----------|
| Daily P&L settlement | `max(0, dailyPnL) * 0.1` converted to SPRAWL | Once per day (engine cron) |
| Raid victory | 10 SPRAWL (flat) | Per raid win |
| Achievement unlock | 5-50 SPRAWL (by tier: bronze=5, silver=15, gold=30, diamond=50) | On unlock |
| LP fee income | Proportional to swap fees earned | Continuous (on claim) |
| Daily mission completion | 5 SPRAWL per mission, 20 bonus for 3/3 | Daily |

The **daily P&L settlement** is the core earning loop:
```typescript
// Runs at end of each day (engine cron)
async function settleDaily(agent: AgentRecord) {
    const portfolioValueNow = await calculatePortfolioValue(agent.wallet);  // in sUSDC
    const portfolioValueYesterday = agent.last_portfolio_value;
    const pnl = portfolioValueNow - portfolioValueYesterday;
    
    if (pnl > 0) {
        // Profitable day: earn 10% of profit as $SPRAWL
        const sprawlReward = pnl * 0.10;
        await SPRAWL.mint(agent.wallet, toWei(sprawlReward));
        await cityState.recordOutcome(agent.id, pnl, portfolioValueNow);
    }
    
    agent.last_portfolio_value = portfolioValueNow;
}
```

#### How agents SPEND $SPRAWL:

| Action | Cost | Effect |
|--------|------|--------|
| Initiate a raid | 5 SPRAWL | Burned — creates deflationary pressure |
| Buy billboard ad (per day) | 10-50 SPRAWL (by tier) | Burned — renders 3D ad in city |
| Unlock cosmetic item | 10-100 SPRAWL (by rarity) | Burned — equips crown/roof/aura item |
| Boost (extra compute turn) | 1 SPRAWL | Burned — agent gets an extra tick this cycle |
| Purchase premium strategy slot | 20 SPRAWL | Burned — allows >5 policy rules |

All spending **burns** $SPRAWL (removes from circulation). This creates deflationary pressure that balances against the minting from earnings. Active, successful cities have appreciating $SPRAWL. Dead cities have worthless $SPRAWL.

#### $SPRAWL → Building Growth

$SPRAWL earnings are what make buildings grow:

```typescript
function computeBuildingHeight(agent: AgentRecord): number {
    // Height is driven by CUMULATIVE $SPRAWL earned (not held — earned lifetime)
    const sprawlEarnedNorm = Math.min(agent.sprawl_lifetime_earned / MAX_SPRAWL_EARNED, 1);
    const levelNorm = agent.xp_level / 25;
    const raidNorm = Math.min(agent.raid_wins / 100, 1);
    
    const composite = 
        Math.pow(sprawlEarnedNorm, 0.45) * 0.50 +  // earning power is primary
        Math.pow(levelNorm, 0.50) * 0.25 +
        Math.pow(raidNorm, 0.55) * 0.25;
    
    return Math.min(600, 35 + composite * 565);
}
```

Cumulative $SPRAWL earned (not current balance) drives height — so spending $SPRAWL on raids/cosmetics doesn't shrink your building. But you must keep earning to keep growing.

#### $SPRAWL price as city health indicator

Since $SPRAWL trades freely on SprawlDEX:
- Lots of profitable agents → lots of minting → agents hold/use SPRAWL → price rises → city is thriving
- Agents losing money → no minting → agents sell SPRAWL for sUSDC → price drops → city is struggling
- The $SPRAWL/sUSDC price chart IS the city's economic health dashboard — show it prominently in the UI

**Reference**: Economy design from `inspiration/Emergence-World/docs/ECONOMY.md` — survival tax, boost queue, peer-judged contribution. Immutable ledger wallet pattern from `inspiration/git-city/supabase/migrations/052_pixels_core.sql`. PnL settlement logic from `inspiration/Agent-8004-x402/services/perps-platform/src/lib/engine.js`.

### 1.6 Deploy to Mantle Sepolia

- Fund deployer from faucet (1000 MNT/day from `faucet.sepolia.mantle.xyz`)
- Deploy in order:
  1. SprawlToken factory → mint sETH, sBTC, sPOL, sSOL, sUSDC, $SPRAWL
  2. SprawlDEX → create pools: sETH/sUSDC, sBTC/sUSDC, sPOL/sUSDC, sSOL/sUSDC, SPRAWL/sUSDC
  3. Seed pools with initial liquidity (from deployer mints)
  4. AgentFaucet (authorized to mint starting portfolios)
  5. CityState + CityReferee + RaidContract
  6. Start MarketMaker bot (off-chain, pulls CoinGecko prices every 30s)
- Verify all contracts on `explorer.sepolia.mantle.xyz`
- Record addresses in `contracts/deployments.json`

**Reference**: Mantle Sepolia config from `inspiration/erc-8004-contracts/hardhat.config.ts` — already has `mantleSepolia` network with chain ID 5003 and RPC `https://rpc.sepolia.mantle.xyz`.

---

## Phase 2: Agent Engine (Days 3-7)

### 2.1 Agent Runtime Core

Custom TypeScript runtime borrowing patterns from three projects:

**Tick loop** (from ai-town):
```typescript
// Reference: inspiration/ai-town/convex/engine/abstractGame.ts
// Pattern: runStep loops for ENGINE_ACTION_DURATION, processes inputs, calls tick()
class SprawlEngine {
    async runStep() {
        const inputs = await this.loadPendingInputs(); // from Supabase
        for (const input of inputs) {
            await this.handleInput(input); // agent decisions, raid initiations
        }
        for (const agent of this.agents) {
            await agent.tick(this.marketContext);
        }
        await this.saveStep(); // write diffs to Supabase
    }
}
```

**Reference**: `inspiration/ai-town/convex/aiTown/main.ts` line 89 for runStep pattern. `inspiration/ai-town/convex/engine/abstractGame.ts` line 22 for the tick inner loop. The `startOperation` bridge pattern (line 238 of `inspiration/ai-town/convex/aiTown/agent.ts`) for async LLM calls without blocking the tick loop.

**Memory system** (from generative_agents):
```typescript
// Reference: inspiration/generative_agents/reverie/backend_server/persona/cognitive_modules/retrieve.py
interface MemoryNode {
    id: string;
    type: 'event' | 'thought' | 'trade';
    description: string;
    embedding: number[];
    poignancy: number;       // 1-10 importance
    lastAccessed: Date;
    evidence: string[];      // source node IDs for reflections
}

// Retrieval scoring: 0.5*recency + 3*relevance + 2*importance
// Reference: retrieve.py lines 199-271
function scoreMemory(node: MemoryNode, query: number[], now: Date): number {
    const recency = Math.pow(0.995, hoursSince(node.lastAccessed, now));
    const relevance = cosineSimilarity(node.embedding, query);
    const importance = node.poignancy / 10;
    return normalize(recency)*0.5 + normalize(relevance)*3 + normalize(importance)*2;
}
```

**Reference**: Full cognitive loop from `inspiration/generative_agents/reverie/backend_server/persona/persona.py` line 185 (`move()` method). Reflection trigger at cumulative poignancy budget = 150 (from `inspiration/generative_agents/reverie/backend_server/persona/cognitive_modules/reflect.py`).

**Skill library** (from Voyager):
```typescript
// Reference: inspiration/Voyager/voyager/agents/skill.py lines 61-127
// Pattern: embed description, store code, retrieve code
interface TradingSkill {
    name: string;
    code: string;           // the strategy function
    description: string;    // LLM-generated summary (this gets embedded)
    successRate: number;
    avgPnl: number;
}
// Only persist skills that pass critic verification
// Reference: inspiration/Voyager/voyager/agents/critic.py
```

### 2.2 Agent Memory & State Awareness

This is how the agent knows what it owns, what it did, whether it's winning, and what to do next.

#### Three layers of agent state (different storage, different purposes):

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER A: ON-CHAIN (ground truth, read-only for agent)           │
│ • Wallet token balances (sETH, sBTC, sUSDC, $SPRAWL...)        │
│ • SprawlDEX pool prices + reserves                              │
│ • CityState agent stats (level, volume, P&L, raid record)       │
│ • ERC-8004 identity + reputation score                          │
│ Source: direct RPC reads to Mantle Sepolia                       │
├─────────────────────────────────────────────────────────────────┤
│ LAYER B: SUPABASE (indexed cache, fast reads)                    │
│ • agents table — all stats, policy config, portfolio value       │
│ • trade_history — every swap/LP/harvest with amounts + P&L       │
│ • agent_memories — the memory stream (ConceptNodes)              │
│ • agent_memory_embeddings — vector embeddings for retrieval      │
│ • activity_feed — public event log                               │
│ • skills — learned strategy patterns (Voyager skill library)     │
│ Source: written by indexer (from chain events) + agent engine     │
├─────────────────────────────────────────────────────────────────┤
│ LAYER C: LLM CONTEXT (assembled per-tick for DeepSeek v4)       │
│ • ISS header (persona, goals, risk tolerance)                    │
│ • Current portfolio snapshot                                     │
│ • Recent trade history (last 10 trades with outcomes)            │
│ • Retrieved relevant memories (top-5 by 3-factor scoring)        │
│ • Current market prices + pool states                            │
│ • Active policy rules (if policy-driven agent)                   │
│ Source: assembled by composeAgentContext() each tick              │
└─────────────────────────────────────────────────────────────────┘
```

#### Supabase tables for agent memory:

```sql
-- Trade history: every trade the agent executed
CREATE TABLE trade_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER REFERENCES agents(agent_id),
    action TEXT NOT NULL,              -- 'swap', 'add_lp', 'remove_lp', 'harvest'
    token_in TEXT,                     -- 'sETH'
    token_out TEXT,                    -- 'sUSDC'
    amount_in BIGINT,
    amount_out BIGINT,
    price_at_trade NUMERIC,            -- sUSDC price of token_in at trade time
    pnl_realized NUMERIC DEFAULT 0,    -- realized P&L from this trade (in sUSDC)
    tx_hash TEXT NOT NULL,
    rationale TEXT,                     -- LLM's reasoning (logged on-chain too)
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_trade_history_agent ON trade_history(agent_id, created_at DESC);

-- Memory stream: the cognitive layer (generative_agents pattern)
CREATE TABLE agent_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER REFERENCES agents(agent_id),
    type TEXT NOT NULL,                -- 'event', 'thought', 'trade', 'reflection'
    depth INTEGER DEFAULT 0,           -- 0=raw observation, 1+=reflection
    description TEXT NOT NULL,          -- human-readable: "Sold 0.5 sETH at $2,580 for +$40 profit"
    subject TEXT,                       -- SPO triple: "Agent #42"
    predicate TEXT,                     -- "sold"
    object TEXT,                        -- "0.5 sETH at $2,580"
    poignancy INTEGER DEFAULT 5,        -- 1-10, LLM-scored importance
    keywords TEXT[],                    -- for fast keyword lookup
    evidence UUID[],                    -- source memory IDs (for reflections)
    embedding_id UUID,                  -- FK to agent_memory_embeddings
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ              -- NULL = permanent (soul entries)
);
CREATE INDEX idx_memories_agent ON agent_memories(agent_id, created_at DESC);
CREATE INDEX idx_memories_keywords ON agent_memories USING GIN(keywords);

-- Vector embeddings for semantic retrieval
CREATE TABLE agent_memory_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER,
    embedding_key TEXT NOT NULL,         -- the text that was embedded
    embedding vector(1536),              -- OpenAI ada-002 or DeepSeek embeddings
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Supabase pgvector index for similarity search
CREATE INDEX idx_embeddings_vector ON agent_memory_embeddings 
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Learned skills (Voyager pattern)
CREATE TABLE agent_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER REFERENCES agents(agent_id),
    name TEXT NOT NULL,                 -- 'momentum_breakout_eth'
    code TEXT NOT NULL,                 -- the strategy function as JSON policy rules
    description TEXT NOT NULL,          -- LLM-generated summary (THIS gets embedded)
    embedding_id UUID,                  -- FK to agent_memory_embeddings
    success_rate NUMERIC DEFAULT 0,
    avg_pnl NUMERIC DEFAULT 0,
    times_used INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agent_id, name)
);
```

**Reference**: Memory stream schema from `inspiration/generative_agents/reverie/backend_server/persona/memory_structures/associative_memory.py`. Vector search pattern from `inspiration/ai-town/convex/agent/memory.ts`. Skill library from `inspiration/Voyager/voyager/agents/skill.py:61-127`.

#### The per-tick perception → memory → decision flow:

```typescript
// This runs every tick (every ~60 seconds for each agent)
async function agentTick(agent: AgentRecord, market: MarketContext) {

    // ── STEP 1: PERCEIVE ─────────────────────────────────
    // Read on-chain state (Layer A) and cache in Supabase (Layer B)
    
    const portfolio = await readPortfolio(agent.wallet);
    // Returns: { sETH: 1.2, sBTC: 0.03, sUSDC: 4800, SPRAWL: 85, ... }
    
    const portfolioValueUSD = await calculatePortfolioValue(portfolio, market.prices);
    // Returns: ~$10,240 (sum of all holdings at current SprawlDEX prices)
    
    const unrealizedPnl = portfolioValueUSD - agent.last_portfolio_value;
    // Returns: +$240 since last settlement
    
    const recentTrades = await supabase.from('trade_history')
        .select('*').eq('agent_id', agent.agent_id)
        .order('created_at', { ascending: false }).limit(10);
    // Last 10 trades with amounts, prices, P&L, rationale
    
    // ── STEP 2: MEMORIZE ─────────────────────────────────
    // Turn current state into memory events
    
    // If portfolio value changed significantly (>2%), create a memory
    if (Math.abs(unrealizedPnl / agent.last_portfolio_value) > 0.02) {
        await addMemory(agent, {
            type: 'event',
            description: `Portfolio is ${unrealizedPnl > 0 ? 'up' : 'down'} ${formatUSD(unrealizedPnl)} ` +
                         `(${(unrealizedPnl/agent.last_portfolio_value*100).toFixed(1)}%) since last settlement. ` +
                         `Current value: ${formatUSD(portfolioValueUSD)}. ` +
                         `Largest position: ${portfolio.largestHolding.token} (${portfolio.largestHolding.pct}%)`,
            poignancy: Math.min(10, Math.ceil(Math.abs(unrealizedPnl) / 100)), // bigger moves = more important
            keywords: ['portfolio', 'pnl', unrealizedPnl > 0 ? 'profit' : 'loss'],
        });
    }
    
    // If any pool price moved >5% since last tick, create a market event memory
    for (const pool of market.pools) {
        if (Math.abs(pool.priceChange1h) > 0.05) {
            await addMemory(agent, {
                type: 'event',
                description: `${pool.name} price moved ${(pool.priceChange1h*100).toFixed(1)}% in the last hour. ` +
                             `Current price: $${pool.price}. Volume: $${pool.volume24h}`,
                poignancy: Math.min(8, Math.ceil(Math.abs(pool.priceChange1h) * 40)),
                keywords: ['market', pool.tokenA, pool.tokenB, pool.priceChange1h > 0 ? 'pump' : 'dump'],
            });
        }
    }
    
    // ── STEP 3: REFLECT (if poignancy budget depleted) ───
    // Reference: generative_agents reflect.py — trigger when importance_sum >= 150
    
    agent.poignancy_accumulator += newMemories.reduce((sum, m) => sum + m.poignancy, 0);
    if (agent.poignancy_accumulator >= 150) {
        await reflect(agent); // generates focal points → retrieves evidence → synthesizes insights
        agent.poignancy_accumulator = 0;
    }
    
    // ── STEP 4: RETRIEVE RELEVANT MEMORIES ───────────────
    // 3-factor scoring: 0.5*recency + 3*relevance + 2*importance
    
    const queryText = `Current market: sETH=$${market.prices.sETH}, sBTC=$${market.prices.sBTC}. ` +
                      `My portfolio: ${formatPortfolio(portfolio)}. ` +
                      `Unrealized P&L: ${formatUSD(unrealizedPnl)}. What should I do?`;
    
    const relevantMemories = await retrieveMemories(agent, queryText, { topK: 5, overfetch: 50 });
    // Returns top-5 memories scored by relevance to current situation
    // e.g., "Last time sETH dropped 5% I bought the dip and made 8% in 2 days" (poignancy: 7)
    
    // ── STEP 5: RETRIEVE RELEVANT SKILLS ─────────────────
    // Voyager pattern: embed market context, retrieve matching strategy code
    
    const relevantSkills = await retrieveSkills(agent, queryText, { topK: 3 });
    // Returns top-3 learned strategies whose DESCRIPTIONS match current context
    // e.g., "momentum_breakout_eth: buys when price breaks above 1h high with volume confirmation"
    
    // ── STEP 6: COMPOSE CONTEXT FOR LLM ──────────────────
    // This is what DeepSeek v4 actually sees
    
    const context: AgentContext = {
        // Identity Stable Set (ISS) — from generative_agents scratch.py:382
        iss: {
            name: agent.name,
            persona: agent.persona,           // "Aggressive momentum trader with high risk tolerance"
            strategy_type: agent.strategy_type, // 'preset:momentum' or 'rules' or 'llm'
            goal: "Maximize $SPRAWL earnings through profitable DeFi trading on SprawlDEX",
            constraints: `Max position: ${agent.policy_config.maxPositionSize}% of portfolio. ` +
                         `Max slippage: ${agent.policy_config.maxSlippageBps}bps. ` +
                         `Allowed tokens: ${agent.policy_config.allowedProtocols.join(', ')}`,
        },
        
        // Current portfolio (from chain)
        portfolio: {
            holdings: portfolio,              // { sETH: 1.2, sBTC: 0.03, sUSDC: 4800, SPRAWL: 85 }
            totalValueUSD: portfolioValueUSD, // $10,240
            unrealizedPnl: unrealizedPnl,     // +$240
            sprawlEarned: agent.sprawl_lifetime_earned,  // 450 $SPRAWL total
            sprawlBalance: portfolio.SPRAWL,             // 85 $SPRAWL available
        },
        
        // Recent trade history (from Supabase)
        recentTrades: recentTrades.map(t => ({
            action: t.action,
            pair: `${t.token_in}/${t.token_out}`,
            amount: t.amount_in,
            pnl: t.pnl_realized,
            rationale: t.rationale,
            time: t.created_at,
        })),
        // e.g., [{ action: 'swap', pair: 'sETH/sUSDC', amount: 0.3, pnl: +$45, rationale: 'momentum breakout', time: '2h ago' }]
        
        // Market data (from SprawlDEX reads)
        market: {
            prices: market.prices,            // { sETH: 2580, sBTC: 71200, sPOL: 0.48, sSOL: 175, SPRAWL: 1.12 }
            pools: market.pools.map(p => ({
                name: p.name,
                price: p.price,
                volume24h: p.volume24h,
                priceChange1h: p.priceChange1h,
                priceChange24h: p.priceChange24h,
                tvl: p.tvl,
                apr: p.apr,                   // estimated from fees/tvl
            })),
        },
        
        // Retrieved memories (from vector search)
        memories: relevantMemories.map(m => m.description),
        // e.g., ["Last time sETH dropped 5% I bought the dip and made 8%", "sSOL has been trending up for 3 days"]
        
        // Learned skills (from Voyager-pattern skill library)
        skills: relevantSkills.map(s => ({ name: s.name, description: s.description, successRate: s.success_rate })),
        
        // Active policy rules (if policy-driven agent)
        policyRules: agent.policy_config.rules,
    };
    
    // ── STEP 7: DECIDE ───────────────────────────────────
    const decision = await strategyEngine.decide(context);
    // PolicyStrategy: evaluates rules against context, returns first matching action
    // LLMStrategy: sends context to DeepSeek v4 with tool schemas, returns tool call
    
    // ── STEP 8: EXECUTE (through GuardrailLayer) ─────────
    const result = await guardrails.execute(decision, agent);
    // dry-run check → position cap → slippage limit → rate limit → execute on SprawlDEX
    
    // ── STEP 9: RECORD ───────────────────────────────────
    // Write trade to history
    await supabase.from('trade_history').insert({
        agent_id: agent.agent_id,
        action: decision.action,
        token_in: decision.params.tokenIn,
        token_out: decision.params.tokenOut,
        amount_in: result.amountIn,
        amount_out: result.amountOut,
        price_at_trade: market.prices[decision.params.tokenIn],
        pnl_realized: result.realizedPnl,
        tx_hash: result.txHash,
        rationale: decision.rationale,
    });
    
    // Write to memory stream
    await addMemory(agent, {
        type: 'trade',
        description: `Executed ${decision.action}: ${decision.params.tokenIn} → ${decision.params.tokenOut}, ` +
                     `amount: ${result.amountIn}, received: ${result.amountOut}, ` +
                     `P&L: ${formatUSD(result.realizedPnl)}. Rationale: ${decision.rationale}`,
        poignancy: Math.min(9, 3 + Math.ceil(Math.abs(result.realizedPnl) / 50)),
        keywords: ['trade', decision.action, decision.params.tokenIn, decision.params.tokenOut,
                   result.realizedPnl > 0 ? 'profit' : 'loss'],
    });
    
    // Record on-chain via CityState (for indexer → building growth)
    await cityState.recordDecision(agent.agent_id, decision.action, 'SprawlDEX', 
                                    encodeParams(decision.params));
    
    // ── STEP 10: LEARN (Voyager critic pattern) ──────────
    // If trade was profitable AND used a novel approach, save as a new skill
    if (result.realizedPnl > 0 && decision.rationale.includes('new strategy')) {
        const criticVerdict = await critic.evaluate(decision, result);
        if (criticVerdict.success) {
            await skillManager.addSkill(agent, {
                name: generateSkillName(decision),
                code: JSON.stringify(decision.params), // the strategy params
                description: decision.rationale,
            });
        }
    }
}
```

#### How the agent knows if it's profitable:

The agent has **three levels of P&L awareness**:

| Level | What | Where stored | How agent sees it |
|-------|------|-------------|-------------------|
| **Per-trade P&L** | Realized gain/loss from each swap | `trade_history.pnl_realized` | In `context.recentTrades[].pnl` — the LLM sees "last trade: +$45" |
| **Unrealized P&L** | Current portfolio value vs last settlement | Computed live from chain balances × SprawlDEX prices | In `context.portfolio.unrealizedPnl` — the LLM sees "portfolio up $240 today" |
| **Lifetime $SPRAWL earned** | Cumulative reward from profitable days | `agents.sprawl_lifetime_earned` | In `context.portfolio.sprawlEarned` — the LLM sees "earned 450 $SPRAWL total" |

The agent also builds **memory-based awareness** over time:
- After a profitable streak: reflection creates a thought like "I perform well when sETH is trending up — my momentum strategy works in bull markets"
- After a losing trade: memory records "Lost $120 on sBTC short when market reversed — need to set tighter stop losses"
- These memories are **retrieved by relevance** when similar market conditions occur again

#### What happens when the agent looks back at its own history:

The LLM literally sees this in its context (assembled by `composeAgentContext()`):

```
You are TrendRider-42, an aggressive momentum trader.
Goal: Maximize $SPRAWL earnings on SprawlDEX.
Risk: Max 30% per position. Max 100bps slippage.

PORTFOLIO:
  sETH:  1.2 ($3,096)
  sBTC:  0.03 ($2,136)
  sUSDC: 4,800
  $SPRAWL: 85
  Total: $10,117 | Unrealized P&L: +$117 today

RECENT TRADES:
  1. 2h ago: Swapped 0.3 sETH → 774 sUSDC (+$45 profit) — "momentum breakout confirmed"
  2. 5h ago: Swapped 500 sUSDC → 0.19 sETH — "buying dip after 3% pullback"
  3. 8h ago: Added LP to sETH/sUSDC pool — "high volume, good fee opportunity"
  ...

RELEVANT MEMORIES:
  - "Last time sETH pulled back 5% and recovered, I bought the dip and made 8% in 2 days" (importance: 7)
  - "sSOL has been trending up for 3 straight days — might be overextended" (importance: 5)
  - "Reflection: I tend to overtrade during low-volume periods — should wait for volume confirmation" (importance: 8)

LEARNED SKILLS:
  - momentum_breakout_eth (72% success rate, avg +$38/trade): "Buys sETH when price breaks above 1h high with >2x avg volume"
  - mean_reversion_btc (61% success rate, avg +$25/trade): "Sells sBTC when RSI > 75, buys when RSI < 30"

MARKET:
  sETH: $2,580 (+1.2% 1h, +3.5% 24h) | Volume: $45K | TVL: $180K
  sBTC: $71,200 (-0.3% 1h, +1.8% 24h) | Volume: $32K | TVL: $120K
  $SPRAWL: $1.12 (+0.5% 1h, +2.1% 24h)
  
Available actions: swap, provideLiquidity, removeLiquidity, harvest, hold, raid
```

The LLM then decides: "sETH momentum is strong, I'll add to my position" → calls `swap(sUSDC, sETH, 500, minOut)`.

**Reference**: ISS prompt header from `inspiration/generative_agents/reverie/backend_server/persona/memory_structures/scratch.py:382-414`. Context composition pattern from `inspiration/ai-town/convex/agent/conversation.ts`. Trade history → memory pattern from generative_agents' conversation → 3 memory records flow. Portfolio valuation from `inspiration/Agent-8004-x402/services/perps-platform/src/lib/engine.js`.

### 2.3 Strategy Engine Interface

```typescript
interface StrategyEngine {
    decide(ctx: MarketContext & AgentState): Promise<AgentDecision>;
}

interface AgentDecision {
    action: 'swap' | 'provideLiquidity' | 'removeLiquidity' | 'harvest' | 'hold' | 'raid';
    protocol: string;
    params: Record<string, any>;
    rationale: string; // logged on-chain for transparency
}
```

Two implementations:

**PolicyStrategy** (human-configured rules):
```typescript
class PolicyStrategy implements StrategyEngine {
    constructor(private policy: AgentPolicy) {}
    
    async decide(ctx: MarketContext & AgentState): Promise<AgentDecision> {
        for (const rule of this.policy.rules) {
            if (evaluateCondition(rule.condition, ctx)) {
                return { action: rule.action, protocol: rule.protocol, params: rule.params, rationale: `Rule: ${rule.name}` };
            }
        }
        return { action: 'hold', protocol: '', params: {}, rationale: 'No rule triggered' };
    }
}
```

**LLMStrategy** (DeepSeek v4):
```typescript
class LLMStrategy implements StrategyEngine {
    async decide(ctx: MarketContext & AgentState): Promise<AgentDecision> {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'deepseek-chat', // DeepSeek v4
                messages: [
                    { role: 'system', content: buildSystemPrompt(ctx.agent.persona, ctx.agent.skills) },
                    { role: 'user', content: buildMarketContext(ctx) }
                ],
                tools: DEFI_TOOL_SCHEMAS, // structured tool definitions
                tool_choice: 'auto'
            })
        });
        return parseToolCallToDecision(response);
    }
}
```

**Reference**: DeepSeek integration pattern from `inspiration/signatory/frontend/src/lib/openai.ts` — same `api.deepseek.com/v1/chat/completions` endpoint with tool calling. The Signatory project already uses DeepSeek with tools in production.

### 2.3 GuardrailLayer

Wraps both strategy types:

```typescript
class GuardrailLayer {
    constructor(private strategy: StrategyEngine, private limits: GuardrailConfig) {}
    
    async decide(ctx: MarketContext & AgentState): Promise<AgentDecision | null> {
        const decision = await this.strategy.decide(ctx);
        
        // Position size cap
        if (decision.params.amount > this.limits.maxPositionSize) return null;
        // Protocol allowlist
        if (!this.limits.allowedProtocols.includes(decision.protocol)) return null;
        // Rate limit
        if (this.txCount[ctx.agent.id] >= this.limits.maxTxPerHour) return null;
        // Slippage check (fix Signatory's amountOutMinimum=0 gap)
        if (decision.action === 'swap') {
            decision.params.amountOutMin = calculateMinOutput(decision.params, this.limits.maxSlippageBps);
        }
        
        return decision;
    }
}
```

**Reference**: Dry-run → confirm pattern from `inspiration/byreal-agent-skills/src/core/confirm.ts`. Three-mode execution gating. The `error.suggestions[]` pattern from byreal for machine-readable recovery.

### 2.4 On-Chain Execution

```typescript
// Reference: inspiration/signatory/frontend/src/lib/agent-actions.ts
// Pattern: ethers v5 server-side, StaticJsonRpcProvider with skipFetchSetup
import { ethers } from 'ethers';

const mantleSepoliaProvider = new ethers.providers.StaticJsonRpcProvider(
    { url: 'https://rpc.sepolia.mantle.xyz', skipFetchSetup: true },
    { chainId: 5003, name: 'mantle-sepolia' }
);

async function executeSwap(agentWallet: ethers.Wallet, decision: AgentDecision) {
    const sprawlDex = new ethers.Contract(SPRAWL_DEX_ADDRESS, SPRAWL_DEX_ABI, agentWallet);
    
    // Encode swap calldata (same pattern as Signatory's goat.ts)
    const tx = await sprawlDex.swap(
        decision.params.tokenIn,
        decision.params.tokenOut,
        ethers.utils.parseUnits(decision.params.amount, decision.params.decimals),
        decision.params.amountOutMin
    );
    const receipt = await tx.wait();
    
    // Record to CityState
    const cityState = new ethers.Contract(CITY_STATE_ADDRESS, CITY_STATE_ABI, agentWallet);
    await cityState.recordDecision(agentId, 'swap', decision.protocol, encodedParams);
    
    return { txHash: receipt.transactionHash, success: true };
}
```

**Reference**: `StaticJsonRpcProvider` + `skipFetchSetup: true` from `inspiration/signatory/frontend/src/lib/ethers-provider.ts` — critical for Next.js server environments.

---

## Phase 3: Indexer + Data Layer (Days 6-8)

### 3.1 Mantle Event Indexer

Node.js service that listens to CityState, RaidContract, and ERC-8004 events on Mantle Sepolia, then writes to Supabase.

```typescript
// Watches CityState events → writes to Supabase agents table
const cityState = new ethers.Contract(CITY_STATE_ADDRESS, CITY_STATE_ABI, provider);

cityState.on('AgentSpawned', async (agentId, wallet, strategyType) => {
    await supabase.from('agents').insert({
        agent_id: agentId.toNumber(),
        wallet_address: wallet,
        strategy_type: strategyType,
        total_volume: 0,
        net_pnl: 0,
        level: 1,
        xp_total: 0,
    });
});

cityState.on('AgentOutcome', async (agentId, pnlDelta, newVolume, newLevel) => {
    await supabase.from('agents').update({
        total_volume: newVolume.toNumber(),
        net_pnl: pnlDelta.toNumber(),
        level: newLevel.toNumber(),
    }).eq('agent_id', agentId.toNumber());
});

cityState.on('RaidResult', async (attackerId, defenderId, attackerWon, spoilsXp) => {
    await supabase.from('raids').insert({ attacker_id: attackerId, defender_id: defenderId, success: attackerWon });
    // Grant XP via RPC (copied from git-city migration 032)
    await supabase.rpc('grant_xp', { developer_id: attackerId, source: 'raid_win', amount: 50 });
});
```

This replaces git-city's GitHub API ingestion. The Supabase schema stays compatible — the frontend reads the same table shapes.

### 3.2 Supabase Schema

Adapted from git-city migrations, renaming `developers` → `agents`:

```sql
-- Core agents table (adapted from git-city migration 001)
CREATE TABLE agents (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER UNIQUE NOT NULL,      -- ERC-8004 token ID
    wallet_address TEXT NOT NULL,
    owner_address TEXT NOT NULL,            -- human who spawned it
    name TEXT,
    strategy_type SMALLINT DEFAULT 0,       -- 0=preset, 1=rules, 2=llm
    policy_config JSONB DEFAULT '{}',       -- the human's policy rules
    persona TEXT,                           -- LLM agent personality
    
    -- $SPRAWL economy
    sprawl_balance BIGINT DEFAULT 0,            -- current $SPRAWL holdings
    sprawl_lifetime_earned BIGINT DEFAULT 0,    -- cumulative earned (never decreases) → PRIMARY height driver
    sprawl_lifetime_spent BIGINT DEFAULT 0,     -- cumulative spent
    last_portfolio_value BIGINT DEFAULT 0,      -- in sUSDC, for daily P&L settlement
    
    -- Building dimensions
    total_volume BIGINT DEFAULT 0,          -- cumulative trade volume → secondary height
    strategy_count INTEGER DEFAULT 1,       -- distinct strategies used → width
    recent_actions INTEGER DEFAULT 0,       -- actions in last 24h → lit windows
    reputation_score INTEGER DEFAULT 0,     -- ERC-8004 score → glow
    
    -- Game state (copied from git-city)
    xp_total INTEGER DEFAULT 0,
    xp_level INTEGER DEFAULT 1,
    xp_daily INTEGER DEFAULT 0,
    xp_daily_date DATE,
    raid_xp INTEGER DEFAULT 0,
    raid_wins INTEGER DEFAULT 0,
    raid_losses INTEGER DEFAULT 0,
    app_streak INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_action_at TIMESTAMPTZ,
    
    -- District (DeFi category instead of programming language)
    district TEXT DEFAULT 'general'         -- 'dex', 'lending', 'yield', 'bridge', etc.
);

-- XP system RPCs (copied verbatim from git-city migration 032)
-- Reference: inspiration/git-city/supabase/migrations/032_xp_leveling.sql
-- grant_xp RPC with daily cap logic (150/day for engagement, uncapped for raids/achievements)

-- Raid tables (adapted from git-city migration 015)
-- Reference: inspiration/git-city/supabase/migrations/015_raid_system.sql

-- Achievements (copied from git-city migration 007)
-- Reference: inspiration/git-city/src/lib/achievements.ts

-- Activity feed (adapted from git-city migration 007)
-- Reference: inspiration/git-city/src/app/api/feed/route.ts
```

### 3.3 Data Flow

```
Mantle Sepolia Events
    → Node Indexer (ethers.Contract.on)
        → Supabase Postgres (agents, raids, activity_feed, xp_log)
            → Supabase Realtime (live updates)
                → Next.js frontend (useQuery / Realtime subscription)
                    → React Three Fiber (building dimensions update)
```

---

## Phase 4: 3D City Frontend (Days 7-11)

### 4.1 Fork git-city

```bash
cp -r inspiration/git-city frontend
```

**Files to COPY as-is:**
- `src/components/InstancedBuildings.tsx` — GPU instanced rendering, GLSL shaders, atlas, rise animation
- `src/components/CityCanvas.tsx` — themes, sky dome, bloom, fog
- `src/lib/xp.ts` — XP formula, tiers, ranks (rename titles)
- `src/lib/raid.ts` — scoring formulas (swap input field names)
- `src/lib/zones.ts` — zone model (crown/roof/aura)
- `src/lib/achievements.ts` — batch check engine
- `src/lib/dailies.ts` — deterministic PRNG missions
- `src/lib/ad-moderation.ts` — blocklist
- `src/lib/supabase.ts` — client patterns + Realtime broadcast
- `src/app/api/share-card/` — OG image generation
- `src/app/api/compare-card/` — comparison cards

**Reference**: Full COPY/ADAPT/REWRITE verdicts in `docs/RESEARCH_DIGEST.md` section on git-city.

### 4.2 Remap Building Dimensions

Replace `src/lib/github.ts` → `src/lib/city-layout.ts`:

```typescript
// Original (git-city): height = f(contributions, stars, PRs, repos)
// Sprawl: height = f(totalVolume) — always increases

function computeBuildingHeight(agent: AgentRecord): number {
    // Reference: inspiration/git-city/src/lib/github.ts line 199
    // Same power-curve approach — PRIMARY driver is $SPRAWL lifetime earned
    const sprawlNorm = Math.min(agent.sprawl_lifetime_earned / MAX_SPRAWL_EARNED, 1);
    const levelNorm = agent.xp_level / 25;
    const raidNorm = Math.min(agent.raid_wins / 100, 1);
    
    const composite = 
        Math.pow(sprawlNorm, 0.45) * 0.50 +  // $SPRAWL earned = primary growth driver
        Math.pow(levelNorm, 0.50) * 0.25 +
        Math.pow(raidNorm, 0.55) * 0.25;
    
    return Math.min(600, 35 + composite * 565);
}

function computeBuildingWidth(agent: AgentRecord): number {
    const stratNorm = Math.min(agent.strategy_count / 10, 1);
    return Math.round(14 + Math.pow(stratNorm, 0.5) * 24);
}

function computeGlow(agent: AgentRecord): number {
    return agent.reputation_score / 100; // 0-1 from ERC-8004
}

function computeLitPercentage(agent: AgentRecord): number {
    const hoursSinceAction = (Date.now() - agent.last_action_at) / 3600000;
    return Math.max(0.05, Math.min(0.95, 1 - hoursSinceAction / 48));
}
```

### 4.3 Building Color by Performance

```typescript
// Profitable agent = green tint, losing = red, top performer = gold
function computeBuildingTint(agent: AgentRecord): [number, number, number, number] {
    if (agent.net_pnl > 0) return [0.2, 1.0, 0.3, 0.5]; // green
    if (agent.net_pnl < 0) return [1.0, 0.2, 0.2, 0.5]; // red
    return [0.5, 0.5, 0.5, 0.3]; // neutral gray
}
```

### 4.4 Replace Auth

- Remove GitHub OAuth
- Add SIWE (Sign-In with Ethereum) — same pattern as Signatory
- **Reference**: `inspiration/signatory/frontend/src/app/layout.tsx` for RainbowKit + Wagmi + SIWE adapter setup. `inspiration/signatory/frontend/src/app/api/auth/verify/route.ts` for session cookie creation.

### 4.5 Decision Feed Overlay

New component showing real-time agent activity:

```tsx
// Subscribes to Supabase Realtime on activity_feed table
const DecisionFeed = () => {
    const [events, setEvents] = useState<FeedEvent[]>([]);
    
    useEffect(() => {
        const channel = supabase.channel('city-feed')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_feed' }, 
                (payload) => setEvents(prev => [payload.new, ...prev].slice(0, 50))
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, []);
    
    return (
        <div className="fixed right-4 top-20 w-80 max-h-96 overflow-y-auto">
            {events.map(e => <FeedItem key={e.id} event={e} />)}
        </div>
    );
};
```

### 4.6 Per-Building Inspector

Click a building → panel shows:
- Agent name, ERC-8004 ID, strategy type badge
- Last 10 decisions with tx hashes (link to `explorer.sepolia.mantle.xyz`)
- P&L chart (sparkline)
- Reputation score from ERC-8004
- Raid history
- Current policy rules (if policy-driven)

---

## Phase 5: Agent Spawning + Policy Editor (Days 8-10)

### 5.1 Spawn Flow

```
User connects wallet (SIWE)
  → Clicks "Spawn Agent"
    → thirdweb creates embedded wallet for agent (gasless, ERC-4337)
      → CityState.spawnAgent(agentId, wallet, strategyType) called
        → ERC-8004 IdentityRegistry.register(agentURI) mints NFT
          → Indexer picks up AgentSpawned event → agent appears in city
```

**Reference**: thirdweb embedded wallets (10K free MAW). ERC-8004 registration from `inspiration/erc-8004-tee-agent/src/agent/registry.py` lines 327-406. The `agent.json` builder from `inspiration/erc-8004-tee-agent/src/agent/agent_card.py` lines 422-610.

### 5.2 Strategy Presets

5 presets covering the common DeFi archetypes:

| Preset | Rules | Risk |
|--------|-------|------|
| Conservative Yield | Farm highest-APR stable pools, rebalance monthly | Low |
| Momentum Trader | Buy tokens with >20% 24h volume increase, sell after 10% gain or 5% loss | Medium |
| Arbitrage Hunter | Monitor price discrepancies across pools, execute when spread > 0.5% | Medium |
| Aggressive Degen | Chase new pools with high APR, max allocation, frequent rebalances | High |
| Balanced DeFi | 50% yield farming, 30% swing trades, 20% liquidity provision | Medium |

Each preset is a pre-built `AgentPolicy` JSON object with if/then rules.

### 5.3 Rule Builder UI

Visual if/then editor for power users:

```
┌─────────────────────────────────────────────────┐
│ IF                                               │
│  ┌─────────────┐  ┌──────┐  ┌────────────────┐ │
│  │ Pool APR    │  │  >   │  │ 15%            │ │
│  └─────────────┘  └──────┘  └────────────────┘ │
│ AND                                              │
│  ┌─────────────┐  ┌──────┐  ┌────────────────┐ │
│  │ Portfolio % │  │  <   │  │ 30%            │ │
│  └─────────────┘  └──────┘  └────────────────┘ │
│ THEN                                             │
│  ┌──────────────────────────────────────────┐   │
│  │ Provide Liquidity with 20% of portfolio  │   │
│  └──────────────────────────────────────────┘   │
│                                    [+ Add Rule]  │
└─────────────────────────────────────────────────┘
```

Rules are serialized as JSON and stored in `agents.policy_config`.

```typescript
interface AgentPolicy {
    rules: PolicyRule[];
    riskTolerance: 'low' | 'medium' | 'high';
    maxPositionSize: number;   // % of portfolio
    maxSlippageBps: number;    // basis points
    allowedProtocols: string[];
}

interface PolicyRule {
    name: string;
    condition: { field: string; operator: '>' | '<' | '==' | '!='; value: number | string; };
    action: string;
    protocol: string;
    params: Record<string, any>;
}
```

---

## Phase 6: Raids + XP + Achievements (Days 9-11)

### 6.1 Raid System

**Reference**: Entire raid flow from `inspiration/git-city/src/app/api/raid/execute/route.ts`. Scoring from `inspiration/git-city/src/lib/raid.ts`.

Remapped scoring:
```typescript
// Original: weeklyContributions*3 + appStreak*1 + weeklyKudosGiven*2
// Sprawl:   weeklyVolume*3 + consecutiveProfitDays*1 + reputationGiven*2

function calculateAttackScore(agent: AgentRecord): number {
    const volume = agent.weekly_volume * 3;
    const streak = agent.profit_streak * 1;
    const reputation = agent.reputation_given * 2;
    const boost = agent.boost_bonus ?? 0;
    return volume + streak + reputation + boost;
}
```

- 3 raids/day limit (copied from git-city `MAX_RAIDS_PER_DAY = 3`)
- Weekly per-target cooldown
- XP: attacker wins +50, defender +30 (copied from git-city `XP_WIN_ATTACKER = 50`)
- Raid tag on loser's building for 3 days (`RAID_TAG_DURATION_DAYS = 3`)

### 6.2 XP System

**Reference**: Copied from `inspiration/git-city/src/lib/xp.ts`.

```typescript
// Formula: xpForLevel(n) = floor(25 * n^2.2)
// 6 tiers rethemed:
const XP_TIERS = [
    { id: 'testnet',   name: 'Testnet',    color: '#4ade80', minLevel: 1,  maxLevel: 4  },
    { id: 'devnet',    name: 'Devnet',     color: '#60a5fa', minLevel: 5,  maxLevel: 8  },
    { id: 'mainnet',   name: 'Mainnet',    color: '#a78bfa', minLevel: 9,  maxLevel: 13 },
    { id: 'protocol',  name: 'Protocol',   color: '#fbbf24', minLevel: 14, maxLevel: 18 },
    { id: 'whale',     name: 'Whale',      color: '#22d3ee', minLevel: 19, maxLevel: 23 },
    { id: 'sovereign', name: 'Sovereign',  color: '#ffffff', minLevel: 24, maxLevel: 999 },
];
```

### 6.3 Achievements

**Reference**: Engine from `inspiration/git-city/src/lib/achievements.ts`. Category remapping:

| git-city category | Sprawl category | Example |
|---|---|---|
| commits | trades | "First Trade" (1+ swaps) |
| repos | protocols | "Multi-Protocol" (5+ protocols used) |
| stars | reputation | "High Rep" (80+ score) |
| social (referrals) | agents_spawned | "City Founder" (5+ agents spawned) |
| streak | profit_streak | "Profit Streak" (7+ consecutive profitable days) |
| raid | raid | "Kingpin" (10000+ raid XP) — kept as-is |

---

## Phase 7: Leaderboard + Watch Mode + Share Cards (Days 11-13)

### 7.1 Live Leaderboard

Ranked by: cumulative volume, level, raid wins, reputation. Filterable: all agents, policy-driven only, LLM-driven only.

Real-time via Supabase Realtime subscription on `agents` table changes.

### 7.2 Watch Mode

Full-screen view designed for Demo Day livestream (July 2-3):
- City flythrough camera auto-orbit
- Decision feed prominently displayed
- New buildings rise with animation when agents spawn
- Raid battles flash on screen
- Agent vs Agent comparison when raids happen

### 7.3 Share Cards

**Reference**: Copied from `inspiration/git-city/src/app/api/share-card/[username]/route.tsx`. OG image generation via `next/og` with pixel building renderer.

Adapted: Shows agent name, building render, P&L, level, raid record, strategy type badge. Optimized for X/Twitter cards → targets the $17K community voting prize.

---

## Phase 8: Polish + Submission (Days 13-16)

### 8.1 AA/Gasless Onboarding

Ensure a judge can:
1. Visit the site
2. Connect wallet (no MNT needed)
3. Spawn an agent with 1 click (thirdweb pays gas)
4. Watch the agent start trading and the building grow
5. See the city with other agents' buildings

### 8.2 Demo Mode

Pre-seeded scenario with 10-20 agents already active, some with high buildings, some raiding. Deterministic market simulation so the demo never breaks from testnet flakiness.

**Reference**: From doc3 section 9: "seed a deterministic demo mode with pre-funded agents and a scripted market scenario."

### 8.3 Submission Checklist

- [ ] Public Vercel deployment (`.vercel.app` subdomain)
- [ ] GitHub repo (AGPL-3.0, source published — required by git-city license)
- [ ] Demo video (screen recording of the full flow)
- [ ] X thread tagged #MantleAIHackathon with: pitch, demo video, GitHub link, Mantle contract addresses
- [ ] DoraHacks registration
- [ ] Contract addresses verified on `explorer.sepolia.mantle.xyz`

---

## Exact Copy/Adapt Instructions Per Repo

### From `inspiration/git-city/` — THE FORK BASE (AGPL-3.0)

**COPY VERBATIM** (only rename types/variables):

| Source File | Copy To | What it gives us | What to change |
|-------------|---------|-------------------|----------------|
| `src/components/InstancedBuildings.tsx` | `frontend/src/components/InstancedBuildings.tsx` | GPU instanced rendering, custom GLSL vertex+fragment shaders, 2048x2048 atlas system, rise animation, focus/dim dithering, manual raycasting | Replace `DeveloperRecord` type with `AgentRecord`. Keep ALL shader code, atlas logic, click handling as-is |
| `src/components/CityCanvas.tsx` | `frontend/src/components/CityCanvas.tsx` | 4 themes (Emerald/Midnight/Sunset/Neon), sky dome gradient, bloom postprocessing, fog, PerformanceMonitor | Remove GitHub-specific types. Keep themes, lighting, effects as-is |
| `src/components/CityScene.tsx` | `frontend/src/components/CityScene.tsx` | Focus state, EffectsLayer wiring, building-to-camera bridge | Adapt to AgentRecord type |
| `src/lib/xp.ts` | `frontend/src/lib/xp.ts` | `xpForLevel(n) = floor(25*n^2.2)`, 6 tiers, 25 levels, rank titles, daily cap (150), `calculateGithubXp` | Rename tiers (localhost→testnet, etc.), rename `calculateGithubXp` → `calculateAgentXp`, swap inputs (contributions→volume, stars→reputation) |
| `src/lib/raid.ts` | `frontend/src/lib/raid.ts` | `calculateAttackScore`, `calculateDefenseScore`, `MAX_RAIDS_PER_DAY=3`, `RAID_TAG_DURATION_DAYS=3`, titles (Pickpocket/Burglar/Heist Master/Kingpin), `isFridayThe13th` special event | Rename inputs: `weeklyContributions`→`weeklyVolume`, `appStreak`→`profitStreak`, `weeklyKudosGiven`→`reputationGiven` |
| `src/lib/zones.ts` | `frontend/src/lib/zones.ts` | 3-zone model (crown/roof/aura), `ZONE_ITEMS`, `ZONE_LABELS`, `ITEM_NAMES`, `ACHIEVEMENT_ITEMS` mapping | Keep zone architecture. Rename achievement triggers (e.g., `first_push`→`first_trade`) |
| `src/lib/achievements.ts` | `frontend/src/lib/achievements.ts` | `checkAchievements()` batch engine: parallel fetch → filter by category → batch insert unlocks → grant items → XP → feed event → email | Rename categories (commits→trades, repos→protocols, stars→reputation). Keep the engine |
| `src/lib/dailies.ts` | `frontend/src/lib/dailies.ts` | `mulberry32` PRNG seeded by `hash(date:agentId)`, 12 mission types, threshold tracking, streak calculation | Rename missions (visit_building→inspect_agent, fly_score→trade_volume, etc.) |
| `src/lib/ad-moderation.ts` | `frontend/src/lib/ad-moderation.ts` | Blocklist, regex patterns for phishing/scam detection | Copy as-is |
| `src/lib/supabase.ts` | `frontend/src/lib/supabase.ts` | `getSupabaseAdmin()`, `createServerSupabase()`, `createBrowserSupabase()`, `broadcastToChannel()` | Copy as-is |
| `src/app/api/share-card/[username]/route.tsx` | `frontend/src/app/api/share-card/[agentId]/route.tsx` | next/og ImageResponse, pixel building renderer, stats grid, Silkscreen font, landscape+stories formats | Replace GitHub stats with agent stats (P&L, level, raids, strategy type) |
| `src/app/api/compare-card/[userA]/[userB]/route.tsx` | `frontend/src/app/api/compare-card/[agentA]/[agentB]/route.tsx` | Side-by-side building comparison, winner highlighting, trash talk | Same — swap metric names |
| `supabase/migrations/032_xp_leveling.sql` | `frontend/supabase/migrations/003_xp_leveling.sql` | `grant_xp` RPC with daily cap, `xp_log` audit table, auto-level-up | Rename `developers`→`agents`, rename XP sources |
| `supabase/migrations/015_raid_system.sql` | `frontend/supabase/migrations/004_raids.sql` | `raids` table, `raid_tags` table, unique active tag constraint | Rename `building_id`→`agent_id`, swap score field names |
| `supabase/migrations/026_dailies.sql` | `frontend/supabase/migrations/005_dailies.sql` | `record_mission_progress` RPC, `complete_all_dailies` RPC | Copy structure, rename mission IDs |
| `supabase/migrations/052_pixels_core.sql` | `frontend/supabase/migrations/006_credits.sql` | `wallets` table, `wallet_transactions` immutable ledger, `earn_pixels`/`credit_pixels`/`debit_pixels` RPCs | Rename "pixels"→"credits" or "sprawl_tokens" |

**ADAPT** (keep structure, replace data source):

| Source File | Becomes | What changes |
|-------------|---------|--------------|
| `src/lib/github.ts` (lines 383+) | `frontend/src/lib/city-layout.ts` | Keep `generateCityLayout()` spiral algorithm, block grid (LOT_W=38, LOT_D=32, STREET_W=12), district grouping, decoration spawning. Replace: `DeveloperRecord`→`AgentRecord`, height formula inputs (contributions→volume), width inputs (repos→strategies), district source (language→defi_category) |
| `src/lib/github-api.ts` | `frontend/src/lib/mantle-api.ts` | FULL REWRITE. Replace GitHub REST+GraphQL with Mantle RPC reads + Supabase queries |
| `src/app/api/city/route.ts` | `frontend/src/app/api/city/route.ts` | Keep the 2-round parallel query pattern. Replace `developers` table with `agents`. Keep CDN cache headers |
| `src/app/api/raid/execute/route.ts` | `frontend/src/app/api/raid/execute/route.ts` | Keep: auth check → rate limit → score calc → atomic RPC → XP grant → feed event → achievement check → notification. Replace: score inputs, remove GitHub-specific fields |
| `src/app/api/checkin/route.ts` | `frontend/src/app/api/heartbeat/route.ts` | Replace daily GitHub activity check with on-chain activity check (any tx in last 24h). Keep streak mechanics and reward grants |
| `src/lib/items.ts` | `frontend/src/lib/items.ts` | Keep `autoEquipIfSolo()`, loadout JSONB pattern. Change `FREE_CLAIM_ITEM` and achievement unlock triggers |
| `src/lib/skyAds.ts` + `skyAdPlans.ts` | `frontend/src/lib/billboards.ts` | Keep ad vehicle types (plane/blimp/billboard/rooftop_sign/led_wrap). Replace Stripe billing with on-chain MNT escrow |
| All remaining migrations (001-092) | Adapted subset | Cherry-pick schema patterns. Drop: GitHub OAuth tables, job board, arcade, Stripe-specific fields |

**DELETE** (not needed for Sprawl):

- `src/app/jobs/`, `src/app/hire/`, `src/app/for-companies/` — job board
- `src/lib/jobs/` — job board logic
- `src/app/arcade/`, `src/lib/arcade/` — pixel arcade mini-game
- `packages/vscode-extension/` — VS Code extension
- `src/lib/github-api.ts` — replaced entirely
- `src/app/api/auth/github/` — replaced with SIWE
- `src/lib/geo.ts` — IP geolocation (not needed)

---

### From `inspiration/signatory/` — OUR OWN PROJECT (patterns we know work)

| Source File | What we take | Where it goes |
|-------------|-------------|---------------|
| `frontend/src/lib/ethers-provider.ts` | `StaticJsonRpcProvider` factory with `skipFetchSetup: true` + explicit network params | `frontend/src/lib/src/providers/mantle.ts` — critical for Next.js server environments |
| `frontend/src/lib/openai.ts` | DeepSeek v4 streaming + tool call execution + SSE parsing via `api.deepseek.com/v1/chat/completions` | `frontend/src/lib/src/llm/deepseek.ts` — our proven DeepSeek integration |
| `frontend/src/lib/goat.ts` | Manual ABI encoding for swap functions (`exactInputSingle` pattern) | `frontend/src/lib/src/execution/swap.ts` — adapt for SprawlDEX instead of Uniswap V3 |
| `frontend/src/app/layout.tsx` | RainbowKit v2 + Wagmi v2 + SIWE adapter configuration | `frontend/src/app/layout.tsx` — wallet connection + auth |
| `frontend/src/app/api/auth/verify/route.ts` | SIWE verification + base64 session cookie creation | `frontend/src/app/api/auth/verify/route.ts` — copy, change chain to Mantle |
| `frontend/src/hooks/useChat.ts` | `CONFIRM_ACTION:` protocol pattern (server streams token → frontend regex → confirmation card) | `frontend/src/hooks/useAgentActions.ts` — adapt for trade/raid confirmations |
| `frontend/src/lib/agent-actions.ts` | `executeAgentSwap()` flow: ownership check → balance check → build tx → sign → broadcast → wait receipt | `frontend/src/lib/src/execution/executor.ts` — simplify (no Lit Protocol, direct EOA signing) |
| `frontend/src/lib/config.ts` | Chain definition pattern with viem | `frontend/src/lib/chains.ts` — define `mantleSepolia` chain config |
| `contract/contracts/AgentCredits.sol` | Dual-ledger credit system (general + session credits) with authorized spender | Reference for our credits/billing if we add premium features |

---

### From `inspiration/ai-town/` (MIT) — SIMULATION ARCHITECTURE

| Source File | Pattern we port to TypeScript | Where it goes |
|-------------|------------------------------|---------------|
| `convex/engine/abstractGame.ts` | `AbstractGame` class: `tick()`, `handleInput()`, `saveStep()` methods. The `runStep` loop that processes for ENGINE_ACTION_DURATION then reschedules itself | `frontend/src/lib/src/engine/game-loop.ts` — our SprawlEngine subclass |
| `convex/aiTown/agent.ts:238-256` | `startOperation` pattern: record intent in game state synchronously → schedule async action → async action completes and submits finish input | `frontend/src/lib/src/engine/operation-bridge.ts` — bridges sync tick → async DeepSeek calls |
| `convex/aiTown/insertInput.ts` + `inputHandler.ts` | Input queue with monotonic number + received timestamp + typed dispatch. Type-safe `inputHandler` factory | `frontend/src/lib/src/engine/input-queue.ts` |
| `convex/agent/memory.ts` | 3-factor retrieval scoring (`relevance + importance + recency`), 10x overfetch → re-rank, reflection trigger at `importance_sum > 500`, `touchMemories` for access timestamp | `frontend/src/lib/src/memory/retrieval.ts` |
| `convex/agent/embeddingsCache.ts` | SHA-256 keyed embedding cache, batch fetch with miss fill | `frontend/src/lib/src/memory/embeddings-cache.ts` |
| `convex/agent/conversation.ts` | Prompt construction: ISS + memories + context → LLM call with stop words | Reference for our agent prompt assembly |
| `convex/aiTown/world.ts` + `game.ts:216-248` | `GameStateDiff` pattern: always write full hot state, only write descriptions when `descriptionsModified` flag is set | `frontend/src/lib/src/engine/state-diff.ts` |
| `convex/crons.ts` | World heartbeat + idle shutdown + dead engine restart cron patterns | `frontend/src/lib/src/engine/lifecycle.ts` |
| `convex/constants.ts` | All timing constants (tick duration, step duration, timeouts, cooldowns) | `frontend/src/lib/src/engine/constants.ts` |

---

### From `inspiration/generative_agents/` (Apache-2.0) — COGNITIVE ARCHITECTURE

| Source File | Pattern we port to TypeScript | Where it goes |
|-------------|------------------------------|---------------|
| `persona/memory_structures/associative_memory.py` | `ConceptNode` schema: SPO triple + poignancy(1-10) + keywords + depth + evidence chain. Three typed lists (events/thoughts/trades). Keyword inverted index | `frontend/src/lib/src/memory/memory-stream.ts` |
| `persona/cognitive_modules/retrieve.py:199-271` | `new_retrieve()`: collect all memories → score each by `0.5*recency + 3*relevance + 2*importance` → normalize to [0,1] → return top-k → update lastAccessed | `frontend/src/lib/src/memory/retrieval.ts` |
| `persona/cognitive_modules/reflect.py` | Reflection trigger: cumulative poignancy budget (150), depletes with each event. When empty: generate 3 focal-point questions → retrieve 30 memories per point → generate 5 insights with evidence citations → store as thought nodes with `depth = max(evidence_depths) + 1` | `frontend/src/lib/src/memory/reflection.ts` |
| `persona/cognitive_modules/plan.py` | 3-level planning: `daily_req` (4-6 broad goals) → `f_daily_schedule` (hourly) → 5-min decomposed subtasks (lazy, 1-2 hours ahead). `revise_identity()` day-boundary self-update | `frontend/src/lib/src/planning/planner.ts` |
| `persona/memory_structures/scratch.py:382-414` | `get_str_iss()` — Identity Stable Set: name, traits, background, current status, lifestyle, daily plan, date. Injected as system prompt header in every LLM call | `frontend/src/lib/src/agents/persona.ts` |
| `persona/prompt_template/v2/insight_and_evidence_v1.txt` | Reflection prompt: numbered statements → "What high-level insights can you infer? (because of 1, 5, 3)" | `frontend/src/lib/src/prompts/reflection.ts` |
| `persona/prompt_template/v3_ChatGPT/iterative_convo_v1.txt` | Per-utterance conversation prompt with ISS + memory + context + full history + JSON output with `did_conversation_end` boolean | Reference for agent-to-agent communication |

---

### From `inspiration/Voyager/` (MIT) — SKILL LIBRARY

| Source File | Pattern we port | Where it goes |
|-------------|----------------|---------------|
| `voyager/agents/skill.py:61-127` | `add_new_skill()`: LLM generates description → embed description (NOT code) → store in vectordb + JSON dict + code file. Versioning on overwrite (V2/V3 archive). Invariant: vectordb count == dict count, enforced at startup | `frontend/src/lib/src/skills/skill-manager.ts` |
| `voyager/agents/skill.py:114-127` | `retrieve_skills()`: query = current market context string → cosine similarity against description embeddings → return top-k CODE (not descriptions) | `frontend/src/lib/src/skills/skill-retrieval.ts` |
| `voyager/agents/critic.py` | Critic JSON output: `{success: bool, critique: string}`. Only add skill on verified success. Critique string flows into next iteration's prompt | `frontend/src/lib/src/skills/critic.ts` |
| `voyager/voyager.py:295-368` | Outer `learn()` loop: propose task → execute → verify → store skill → update curriculum → repeat | Pattern for our agent self-improvement loop |
| `voyager/prompts/skill.txt` | One-shot description generation prompt: function → 6-sentence summary. "No function name, no mention of bot.chat" | `frontend/src/lib/src/prompts/skill-description.ts` |

---

### From `inspiration/erc-8004-contracts/` + `erc-8004-tee-agent/` — ON-CHAIN IDENTITY

| Source | What we use | How |
|--------|-------------|-----|
| ERC-8004 contracts at `0x8004A818...` (Mantle Sepolia) | IdentityRegistry — already deployed, just interact | Call `register(agentURI)` to mint agent NFT. Read `ownerOf(agentId)`, `tokenURI(agentId)` |
| ERC-8004 contracts at `0x8004B663...` (Mantle Sepolia) | ReputationRegistry — already deployed, just interact | CityReferee calls `giveFeedback(agentId, score, decimals, tag1, tag2, ...)` |
| `erc-8004-tee-agent/src/agent/registry.py:327-406` | Registration flow: fund wallet → `register(tokenURI)` → parse `Transfer` event from receipt `topics[3]` for token ID → subgraph fallback | Port to TypeScript in `frontend/src/lib/src/identity/register.ts` |
| `erc-8004-tee-agent/src/agent/agent_card.py:422-610` | `build_erc8004_registration()`: spec-compliant JSON with `type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1"`, CAIP-10 wallet addresses, services array | Port to TypeScript in `frontend/src/lib/src/identity/agent-card.ts` |
| `erc-8004-tee-agent/src/agent/registry.py:467-595` | Reputation read/write: `giveFeedback()` with `int128 value + uint8 valueDecimals` encoding, `getSummary()` for aggregated scores | Port to TypeScript in `frontend/src/lib/src/identity/reputation.ts` |
| `erc-8004-tee-agent/src/agent/subgraph_client.py` | Subgraph queries with 30s TTL cache, `get_agent_by_owner(address)` | Port to TypeScript in `frontend/src/lib/src/identity/subgraph.ts` |
| `erc-8004-contracts/hardhat.config.ts` | Mantle Sepolia (5003) + Mainnet (5000) network configs, RPC URLs, explorer URLs | Copy network config into our Hardhat setup |

---

### From `inspiration/Agent-8004-x402/` — PnL ACCOUNTING

| Source File | What we take | Where it goes |
|-------------|-------------|---------------|
| `contracts/AgentIdentity.sol` | Owner/controller split pattern: `ownerOf` (cold key) vs `controllerOf` (hot operational key), 29 lines | Reference for our AgentRegistry if we add delegation |
| `services/perps-platform/src/lib/engine.js` | `submitOrder()`: weighted average entry price calculation, position flip detection (long→short), partial close PnL = `(exitPrice - entryPrice) * sign(prevSize) * closedSize`, taker fee deduction, margin check | `frontend/src/lib/src/accounting/pnl-tracker.ts` — adapt for spot trades (no leverage) |
| `services/coordinator/src/lib/registry.js` | Iterate `nextId` on IdentityRegistry, batch fetch identity + reputation, sort by score descending | `frontend/src/lib/src/identity/discovery.ts` |

---

### From `inspiration/byreal-agent-skills/` (MIT) — EXECUTION SAFETY PATTERNS

| Source File | Pattern | Where it goes |
|-------------|---------|---------------|
| `src/core/confirm.ts` | Three-mode execution gating: `resolveExecutionMode()` → `'dry-run' \| 'confirm' \| 'unsigned-tx'`. `requireExecutionMode()` exits if none specified | `frontend/src/lib/src/guardrails/execution-mode.ts` |
| `src/core/errors.ts` | Typed error codes + `suggestions[]` array on every error for machine-readable recovery | `frontend/src/lib/src/guardrails/errors.ts` |
| `src/core/types.ts:230-240` | `Result<T, E>` monad: `ok(value)` / `err(error)` — eliminates try/catch scatter | `frontend/src/lib/src/utils/result.ts` |
| `src/cli/commands/catalog.ts` | `CAPABILITIES` array with `{id, name, description, category, auth_required, command, params[]}` — programmatic self-description for agents | `frontend/src/lib/src/tools/capability-registry.ts` |
| `skills/byreal-cli/SKILL.md` | OpenClaw skill format: YAML frontmatter (name, description, requires, install) + markdown body with bootstrap instructions | `frontend/src/lib/skills/sprawl-defi/SKILL.md` — package our city actions as OpenClaw skills for the Byreal/Agentic Economy track |

---

### From `inspiration/ChatDev/` (Apache-2.0) + `MetaGPT/` (MIT) — MULTI-AGENT COORDINATION

| Source | Pattern | Where it goes |
|--------|---------|---------------|
| ChatDev `yaml_instance/GameDev_with_manager.yaml` | Manager fan-out: one director agent outputs keyword-labeled sections, edges route to specialists by keyword match | Design pattern for future multi-agent strategy teams (not Phase 1) |
| ChatDev `runtime/node/executor/loop_counter_executor.py` | Phase gate: absorbs N inputs then releases — clean pattern for "at least 3 review cycles before execution" | Design pattern for risk-review gates |
| MetaGPT `metagpt/actions/action_node.py` | `ActionNode`: typed output schema (field name, type, instruction, example) → prompt compilation → LLM call → parsed Pydantic model | `frontend/src/lib/src/tools/action-schema.ts` — define typed schemas for DeFi tool outputs |
| MetaGPT `metagpt/roles/role.py:399` | `cause_by` routing: agents subscribe to action types, not to other agents. Fully decoupled | Design pattern for our event-driven agent dispatch |

---

### From `inspiration/project-sid/` + `Emergence-World/` — DESIGN REFERENCE ONLY (no code)

| Source | Design pattern | How we use it |
|--------|---------------|---------------|
| project-sid paper | Community goal as economic steering: single string in agent memory determines role distribution | Set district-level goals ("maximize yield throughput") in agent memory to steer emergent behavior |
| project-sid paper | Cognitive Controller bottleneck: one authoritative decision per tick, all modules derive from it | Our `StrategyEngine.decide()` returns ONE decision per tick, execution layer respects it |
| project-sid paper | Action Awareness: compare expected vs actual outcomes every cycle | Post-trade verification: did the swap execute at expected price? Log deviation for reflection |
| Emergence-World `docs/ECONOMY.md` | Survival tax (1 CC/recharge), boost queue (1 CC/extra turn), peer-judged pitch cycle with evidence URLs | Future: agent maintenance cost in credits, extra compute turns purchasable, community competitions |
| Emergence-World `docs/MEMORY.md` | Soul entries: permanent identity anchors that never compress. 6-layer memory stack | Our agent persona fields (in `agents.persona`) are the soul entries — never overwritten by reflection |
| Emergence-World `docs/GOVERNANCE.md` | 70% supermajority with auto-rejection when threshold is mathematically unreachable | Future: city governance proposals for rule changes |

---

## Timeline Summary

| Days | Phase | Deliverable |
|------|-------|-------------|
| 1-3 | Contracts | CityState, CityReferee, RaidContract, SprawlDEX + MarketMaker deployed on Mantle Sepolia |
| 3-7 | Agent Engine | Tick loop + PolicyStrategy + LLMStrategy + GuardrailLayer + memory |
| 6-8 | Indexer | Mantle events → Supabase pipeline running |
| 7-11 | Frontend | git-city fork rendering from Supabase, SIWE auth, decision feed |
| 8-10 | Spawn + Policy | 1-click gasless spawn, preset selector, rule builder UI |
| 9-11 | Game Systems | Raids, XP, achievements wired end-to-end |
| 11-13 | Engagement | Leaderboard, watch mode, share cards |
| 13-16 | Polish | Demo mode, AA onboarding, video, X thread, DoraHacks submission |

**Critical path**: The indexer↔renderer seam (Phase 3→4 junction). If on-chain events don't flow into buildings, nothing works. De-risk this first.

**Vertical slice milestone (Day 7)**: One agent → mints ERC-8004 identity → executes one swap on SprawlDEX → CityState records it → indexer writes to Supabase → building appears and grows in 3D city. This single loop is 80% of the demo's persuasive power.

---

### From `inspiration/clan-world/` — AGENT LOOP ARCHITECTURE (best reference for tick engine)

| Source File | Pattern | Where it goes |
|-------------|---------|---------------|
| `packages/runner/src/tickLoop.ts` | Cycle A (heartbeat) + Cycle B (agent delivery) with `SettleLatch`. Heartbeat only fires after all agents settle. `Promise.allSettled` + 2 retries + advance-anyway-after-max. `raceAbort` clean shutdown | `frontend/src/lib/engine/game-loop.ts` — replaces/supplements ai-town pattern. This is more battle-tested for our "agents trade then chain advances" model |
| `packages/runner/src/composeSituationBlock.ts` | Context window management: 10-tick cycle, warning at tick 9, `/clear` at tick 10, `ack-clear` file flag. Agent must save memory before wipe | `frontend/src/lib/engine/context-manager.ts` — manages DeepSeek v4 context window for long-running agents |
| `packages/agents/src/cli.ts` | Elder CLI: `elder world snapshot`, `elder clan submit-orders`, `elder memory recall/save`, `elder peer whisper/inbox`. JSON stdout, human stderr, exit codes | Design reference for our agent tool interface. Our agents call DeepSeek tools not CLI commands, but the JSON-on-stdout pattern applies to our `DEFI_TOOL_SCHEMAS` output parsing |
| `packages/shared/src/adapters/IChainClient.ts` | Adapter interface: stub impl returns mocks, real impl uses viem. Env var toggle. `readEnv()` works in both Node and Vite | `frontend/src/lib/adapters/` — create `ISprawlDEX`, `IChainReader`, `IMockDEX` interfaces. Dev mode uses stubs, prod uses real chain |
| `packages/runner/src/zeroGMemoryStore.ts` | Write-through cache: write to 0G KV + local JSON disk simultaneously. Reads always from disk (fast). Atomic rename pattern (`tmp → rename`) | `frontend/src/lib/memory/persistent-store.ts` — agent memory persisted to Supabase with local disk cache for engine restarts |
| `apps/server/convex/indexer.ts:64` | `bigintSafe()`: recursive `JSON.stringify` replacer that converts all BigInt to string. Every EVM project needs this | `frontend/src/lib/utils/bigint-safe.ts` — copy the 5-line function verbatim |
| `apps/web/src/pages/Cockpit.tsx` | CSS grid: 3 columns × 2 rows, center span for world map, corners for agent panels. `/cockpit` route bypasses auth for judge view | `frontend/src/app/watch/page.tsx` — our Demo Day watch mode layout |
| `apps/web/src/styles/cockpit-tokens.ts` | Design tokens: `{ bg, text, border, font, space, radius, shadow }` namespace pattern. Dark void + parchment panels | Reference for our theme token system alongside git-city's THEMES array |

---

### From `inspiration/eth-open-agents/` (PetCity) — PRODUCTION AGENT PATTERNS

| Source File | Pattern | Where it goes |
|-------------|---------|---------------|
| `packages/pet-runtime/src/brain.ts` | Two-tier LLM: Haiku for ambient (chat, commentary), Sonnet for consequential (trade decisions) with 5 calls/day cap. `FLAVOUR_NUDGES` array for varied outputs. `sanitizeForLLM` regex | `frontend/src/lib/engine/llm-strategy.ts` — use cheap DeepSeek calls for "should I look at the market?" and full v4 for trade decisions. Copy sanitizer + nudge pattern |
| `packages/deployer-tx-lock/index.ts` | File-based nonce serialization: `lockfile.lock()` → read nonce → send tx → increment → `lockfile.unlock()`. Prevents nonce collisions when multiple processes share a deployer wallet. 59 lines | `frontend/src/lib/execution/tx-lock.ts` — CRITICAL. Our deployer wallet signs MarketMaker + CityReferee + RaidContract txs. Without this, nonce collisions crash everything |
| `packages/pet-runtime/src/worker.ts:127-143` | Speculative pre-warm: when a trigger IPC arrives, start the LLM call immediately before full input is assembled. Result is ready by the time it's needed | `frontend/src/lib/engine/game-loop.ts` — pre-warm DeepSeek market analysis as soon as price tick hits, so by decision time the context is computed |
| `packages/pet-runtime/src/worker.ts:472-548` | 36+ canned fallback responses keyed to context (greeting, farewell, confused, excited). Array of lambdas taking `(name, context)` → string. Picked randomly | `frontend/src/lib/engine/fallbacks.ts` — canned trade rationales when DeepSeek is rate-limited: "Holding — market looks uncertain", "Small buy — momentum detected" |
| `apps/hub/src/PetSupervisor.ts:74-106` | `recordBattleEvent()`: write to SQLite AND emit via socket.io simultaneously. `io.to('world').emit('activity', {...})` for real-time frontend updates | `frontend/src/lib/indexer/index.ts` — write to Supabase AND broadcast via Realtime channel simultaneously |
| `apps/web/src/components/ui/PixelButton.tsx` | Complete pixel-art UI: `PixelButton`, `PixelCard`, `PixelDialog`, `PixelInput`, `StatBar`. CSS vars (`--color-yellow`, `--color-cyan`), dark navy base, 4px borders, 2px press shadow, `animate-blink` on loading | `frontend/src/components/ui/` — copy the whole directory. Restyle with Sprawl palette colors (keep the pixel aesthetic) |
| `apps/web/src/components/CRTOverlay.tsx` | Single component: CSS scanline overlay on entire viewport. Massive visual impact for zero complexity | `frontend/src/components/CRTOverlay.tsx` — copy as-is. Layer over the 3D city canvas |
| `packages/contracts-sdk/index.ts` | ABI + addresses + parse helpers in one package. `ADDRESSES_SEPOLIA` const, typed Abi exports, `parseBattleEscrowBattlesRead` normalizer | `frontend/src/constants/contracts.ts` — same pattern for SprawlDEX/CityState ABIs + Mantle Sepolia addresses |

---

## Hackathon-Specific Scoring Optimizations

| Rubric Dimension | Points | How Sprawl scores |
|------------------|--------|-------------------|
| Technical (architecture, security, completeness) | 15 | End-to-end on Mantle: SprawlDEX + CityState + ERC-8004 all on-chain. Real AMM math, guardrails, signed txs |
| Ecosystem Fit (Mantle stack + assets) | 10 | ERC-8004 at deployed `0x8004...` addresses. Token names mirror Mantle DeFi (sETH≈mETH). Byreal Skills compatibility |
| Business Potential (PMF, tokenomics, GTM) | 10 | $SPRAWL token economy with mint/burn dynamics. City-as-a-platform narrative. Clear mainnet upgrade path |
| Innovation (originality) | 10 | No other project combines 3D city + autonomous agents + on-chain DEX + ERC-8004 identity. This is novel |
| User Experience (UX, AA/gasless) | 5 | 1-click spawn via thirdweb embedded wallets. No MNT needed. Presets for instant start |
| Transparency & Verifiability (Part B) | 7.5 | Every AgentDecision event on-chain with tx hash. Building click → explorer link. Watch mode for livestream |
| Strategy Design & Risk Mgmt (Part B) | 7.5 | Dual-mode (policy vs LLM), GuardrailLayer with dry-run, slippage protection, rate limits. Visible in UI |
| Demo Quality (Part B) | 5 | Pre-seeded demo mode, flythrough camera, real-time decision feed, share cards |

**Additional scoring levers:**
- Apply for the **$110K compute credit pool** (Nansen, Elfa AI, Surf AI, Orbit AI, AltLLM) via the DevHub form — covers DeepSeek inference costs
- Package city actions as **OpenClaw skills** (`SKILL.md` format from byreal-agent-skills) for Agentic Economy track credibility
- **$SPRAWL/sUSDC live price chart** in the UI header — instant visual indicator of city health
- Share cards optimized for X → targets the **$17K community voting prize**
- Mention **mETH/USDY** integration in the X thread even if using mock tokens — signals RWA track awareness

---

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Testnet DEX has no liquidity | SprawlDEX with pre-seeded pools + MarketMaker bot for price movement (Phase 1.5) |
| DeepSeek v4 returns invalid actions | GuardrailLayer rejects + falls back to hold (Phase 2.3) |
| Mantle Sepolia RPC unreliable | Cache indexer data in Supabase, serve from cache (Phase 3) |
| Demo breaks during livestream | Pre-seeded demo mode with deterministic agents (Phase 8.2) |
| LLM agent hallucinates bad trade | Dry-run simulation, position caps, rate limits (Phase 2.3) |
| git-city AGPL-3.0 license | Publish source — required anyway, also a transparency selling point |

---

## Appendix: Implementation Specifics (Gap Resolutions)

This section resolves every concrete "who/what/where/when/how" question left open in the main plan.

### A. Backend Wallet Architecture

A single **deployer/operator wallet** (EOA funded from faucet) acts as the trusted backend for all server-side operations. Its private key lives in `BACKEND_PRIVATE_KEY` env var (same pattern as Signatory).

| Role | Who signs | Gas source |
|------|-----------|------------|
| Deploy contracts | Deployer wallet | Faucet MNT |
| MarketMaker swaps | Deployer wallet | Faucet MNT |
| `SPRAWL.mint()` (daily settlement, raid rewards, achievements) | Deployer wallet (set as `minter` on SprawlToken) | Faucet MNT |
| `CityState.recordDecision()` / `recordOutcome()` | Agent's own embedded wallet (thirdweb server wallet) | Sponsored gas via thirdweb ERC-4337 paymaster |
| `ERC-8004 IdentityRegistry.register()` | Agent's embedded wallet | Sponsored gas via thirdweb |
| `RaidContract.initiateRaid()` | Server-side API route using deployer wallet (agent doesn't need to sign — server validates SIWE session + agent ownership) | Deployer wallet pays gas |
| `SprawlDEX.swap()` (agent trades) | Agent's embedded wallet via thirdweb server SDK | Sponsored gas |

**$SPRAWL mint authority**: Only ONE address — the deployer wallet. `CityReferee` contract calls `SPRAWL.mint()` and is authorized as a secondary minter. No other address can mint.

### B. Agent Wallet Lifecycle

**Creation**: When user clicks "Spawn Agent," the Next.js API route calls thirdweb's **Engine (server-side SDK)** to create a **server wallet** (not a client-side embedded wallet). This gives the backend a signer it can use programmatically every tick.

```
User clicks Spawn →
  POST /api/agent/spawn (SIWE-authed) →
    thirdweb.engine.wallet.create({ type: "local" }) → returns { walletAddress, privateKey }
    Store encrypted private key in Supabase `agent_wallets` table (encrypted with BACKEND_ENCRYPTION_KEY)
    AgentFaucet.fundNewAgent(walletAddress) → mints starting tokens
    ERC-8004 IdentityRegistry.register(agentURI) → mints identity NFT to walletAddress
    CityState.spawnAgent(agentId, walletAddress, strategyType) → emits AgentSpawned
```

**Ongoing use**: The engine decrypts the agent's private key from Supabase, creates an `ethers.Wallet` instance, and uses it for every trade. Keys are AES-256-GCM encrypted at rest.

**Failure during spawn**: If ERC-8004 mint succeeds but CityState.spawnAgent reverts → the API route catches the error, logs it, and returns a retry-able error to the frontend. The ERC-8004 NFT exists but is dormant until CityState registers it. Retry the CityState call.

### C. SprawlDEX Pool Seeding

| Pool | Token A Seed | Token B Seed | Initial Price Ratio | Implied Price |
|------|-------------|-------------|---------------------|---------------|
| sETH/sUSDC | 100 sETH | 250,000 sUSDC | 1:2500 | $2,500/sETH |
| sBTC/sUSDC | 5 sBTC | 350,000 sUSDC | 1:70000 | $70,000/sBTC |
| sPOL/sUSDC | 500,000 sPOL | 225,000 sUSDC | 1:0.45 | $0.45/sPOL |
| sSOL/sUSDC | 1,500 sSOL | 262,500 sUSDC | 1:175 | $175/sSOL |
| SPRAWL/sUSDC | 100,000 SPRAWL | 100,000 sUSDC | 1:1 | $1.00/SPRAWL |

Total seed: ~1,187,500 sUSDC equivalent. All minted by the deployer wallet (it's the `minter` on all SprawlTokens). Pool depth is ~100x a single agent's $10K portfolio, so individual agent trades create realistic but non-catastrophic slippage (~0.1-1%).

### D. MarketMaker Bot

- **Package**: `frontend/src/lib/market-maker/` — standalone Node.js process
- **Entry**: `frontend/src/lib/market-maker/src/index.ts` — runs `setInterval(syncPrices, 30_000)`
- **Process management**: PM2 locally, or a simple `node frontend/src/lib/market-maker/dist/index.js` with a cron restart on failure
- **Wallet**: Uses deployer wallet (`BACKEND_PRIVATE_KEY`). Holds pre-minted tokens (the deployer mints itself surplus tokens at deploy time for MarketMaker use)
- **Gas**: ~20 swaps/cycle × 30s = ~40 swaps/min. At Mantle's sub-$0.01/tx, costs ~$0.40/min = ~$24/day. Deployer wallet needs ~25 MNT/day for MarketMaker gas (faucet gives 1000 MNT/day — plenty)
- **CoinGecko failure**: `try/catch` around the API call. On failure, use last known prices (cached in-memory). If stale >5 minutes, pause arb trades but continue noise trades with random walk
- **Tx revert**: `try/catch` around each swap. Log and skip on revert. Next cycle retries naturally

### E. Agent Engine Process

- **Package**: `frontend/src/lib/`
- **Entry**: `frontend/src/lib/src/index.ts`
- **Runs as**: Standalone Node.js long-running process (same server as Next.js app for hackathon, separate for production)
- **Tick interval**: 60 seconds per agent. With 20 agents, each tick takes ~3-5s (1 DeepSeek call + 1-2 on-chain txs), so 20 agents complete in ~60-100s = fits within the next cycle
- **Crash recovery**: PM2 auto-restarts on exit. Engine reads last processed state from Supabase on startup — no in-memory state is critical (all persisted in Supabase). Missed ticks are simply skipped (agents don't trade for that period)
- **RPC failure during tick**: `try/catch` around RPC reads. On failure, use last cached portfolio from Supabase `agents` table. Log a warning memory: "RPC was down, trading on stale data — reducing position sizes"
- **DeepSeek failure**: `try/catch` around LLM call. On timeout (>10s) or error, fall back to `{ action: 'hold', rationale: 'LLM unavailable' }`. No trade executed, no $SPRAWL lost

### F. DeepSeek v4 Budget

- **Max tokens per call**: 4096 output (DeepSeek default). Context window: ~8K tokens per agent tick (ISS 500 + portfolio 200 + 10 trades 800 + 5 memories 500 + 3 skills 300 + market 500 + tools 1000 + system 500)
- **Rate limit**: DeepSeek API allows 60 RPM on paid tier. 20 agents × 1 call/min = 20 RPM. Plus occasional critic calls (~5/min). Total ~25 RPM — well within limits
- **Cost**: ~$0.14/M input tokens + $0.28/M output tokens (DeepSeek pricing). 20 agents × 8K input + 1K output per tick × 1440 ticks/day = ~230M input tokens/day ≈ ~$32/day. Apply for the $110K credit pool to cover this
- **Circuit breaker**: If 3 consecutive DeepSeek calls fail, disable LLM agents for 5 minutes and switch all to `hold` mode. Alert via Supabase Realtime to the admin dashboard

### G. Daily P&L Settlement

- **Trigger**: The engine tick loop checks `if (currentHourUTC === 0 && !settledToday[agentId])` — runs at midnight UTC
- **Timezone**: **UTC, hardcoded**. Settlement window: 00:00-00:05 UTC daily
- **Who signs mint**: The deployer wallet calls `CityReferee.settleDaily(agentId)` which internally calls `SPRAWL.mint()` (CityReferee is an authorized minter)
- **What if engine is down at midnight?** On next startup, check `agents.last_settlement_date`. If it's not today, run settlement for all agents with stale dates. No $SPRAWL is lost — just delayed

### H. Policy Rule Evaluation

**Available condition fields** (the enumerated set the rule builder offers):

| Field | Source | Example |
|-------|--------|---------|
| `portfolio.totalValueUSD` | Live calculation from chain | `> 10000` |
| `portfolio.holdings.{token}` | Chain balance read | `sETH > 0.5` |
| `portfolio.unrealizedPnl` | Computed | `< -500` |
| `portfolio.sprawlBalance` | Chain balance read | `> 50` |
| `market.price.{token}` | SprawlDEX read | `sETH > 2600` |
| `market.priceChange1h.{token}` | Computed from price history | `sETH > 0.05` (5% up) |
| `market.priceChange24h.{token}` | Computed from price history | `sBTC < -0.03` (3% down) |
| `market.pool.{pair}.apr` | Computed from 24h fees / TVL | `sETH_sUSDC > 15` |
| `market.pool.{pair}.tvl` | SprawlDEX read | `sETH_sUSDC > 100000` |
| `agent.level` | Supabase | `>= 10` |
| `agent.raidWins` | Supabase | `> 5` |
| `agent.profitStreak` | Supabase | `>= 3` |

**Validation**: Rules are validated at save time (Zod schema on the API route). Max 5 rules per agent (20 with premium slot purchase). Malformed rules that throw during evaluation are caught per-rule — the agent skips that rule and continues to the next

### I. Indexer Specifics

- **Package**: `frontend/src/lib/indexer/`
- **Runs as**: Standalone Node.js process alongside the engine
- **Block cursor**: Persisted in Supabase table `indexer_state` with `{ contract, last_block_number }`. On startup, resumes from last processed block
- **Catch-up**: On startup, fetches events from `last_block_number` to `latest` using `contract.queryFilter(event, fromBlock, toBlock)` in 1000-block chunks before switching to live `contract.on()` listener
- **Reorg handling**: Not implemented for hackathon (Mantle Sepolia reorgs are extremely rare). Future: use `ethers.getLogs()` with confirmation depth of 5 blocks before writing to Supabase
- **Deployment**: Same server as engine for hackathon. Production: Railway/Render $5/mo

### J. Building Dimension Calculation

- **When**: Computed **server-side in the `/api/city` route**, not client-side. The route fetches all agents from Supabase, calls `computeBuildingHeight/Width/Glow/Lit/Tint` for each, and returns the computed values in the API response
- **Cached**: The API response is CDN-cached for 30 seconds (`Cache-Control: s-maxage=30, stale-while-revalidate=300`). Buildings update every 30 seconds, not every frame
- **No extra column needed**: Computed on-the-fly from existing `agents` table fields. If performance becomes an issue, add precomputed columns updated by the indexer

### K. ERC-8004 tokenURI Hosting

- **Where**: Next.js API route at `GET /api/agent/[agentId]/registration.json`
- **Returns**: The spec-compliant ERC-8004 registration JSON (built from Supabase agent data)
- **URI format**: `https://sprawl.vercel.app/api/agent/42/registration.json`
- **Gas for mint**: Sponsored via thirdweb ERC-4337 paymaster (the agent's embedded wallet is a smart account, gas is paid by thirdweb)

### L. Billboard Contract

```solidity
contract BillboardContract {
    struct Billboard {
        address advertiser;
        string contentURI;       // IPFS hash or URL to ad image/text
        string vehicleType;      // 'plane', 'blimp', 'billboard', 'rooftop_sign', 'led_wrap'
        uint256 sprawlPaid;      // $SPRAWL burned for this ad
        uint256 expiresAt;       // block.timestamp + duration
    }
    
    mapping(uint256 => Billboard) public billboards;
    uint256 public nextBillboardId;
    
    event BillboardPurchased(uint256 indexed id, address indexed advertiser, string vehicleType, 
                             string contentURI, uint256 sprawlPaid, uint256 expiresAt);
    event BillboardExpired(uint256 indexed id);
    
    function purchaseBillboard(string calldata contentURI, string calldata vehicleType, 
                               uint256 durationDays) external {
        uint256 cost = calculateCost(vehicleType, durationDays);
        SPRAWL.transferFrom(msg.sender, address(0xdead), cost); // burn
        billboards[nextBillboardId] = Billboard(msg.sender, contentURI, vehicleType, cost, 
                                                 block.timestamp + durationDays * 1 days);
        emit BillboardPurchased(nextBillboardId, msg.sender, vehicleType, contentURI, cost, 
                                 block.timestamp + durationDays * 1 days);
        nextBillboardId++;
    }
}
```

Indexer listens to `BillboardPurchased` → writes to Supabase `billboards` table → frontend reads active billboards and renders 3D objects (using git-city's `skyAds.ts` vehicle types).

### M. Activity Feed Schema

```sql
CREATE TABLE activity_feed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,     -- 'trade', 'raid_win', 'raid_loss', 'achievement', 'spawn', 'level_up', 'billboard'
    actor_id INTEGER,             -- agent_id of the actor
    target_id INTEGER,            -- agent_id of the target (for raids)
    metadata JSONB DEFAULT '{}',  -- event-specific data
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_feed_created ON activity_feed(created_at DESC);
```

- **Written by**: indexer (from on-chain events) + API routes (from raid/achievement/spawn flows)
- **Cleanup**: Cron job (daily) deletes rows older than 30 days: `DELETE FROM activity_feed WHERE created_at < NOW() - INTERVAL '30 days'`

### N. Embeddings

- **Model**: DeepSeek's own embedding API (`api.deepseek.com/v1/embeddings`, model `deepseek-embedding`) if available. Fallback: OpenAI `text-embedding-3-small` (1536 dimensions, $0.02/M tokens)
- **When generated**: Asynchronously after `addMemory()` — the memory is inserted immediately (with `embedding_id = null`), then a background job generates the embedding and updates the row. Retrieval skips memories with null embeddings
- **Batching**: Embeddings are generated in batches of 10 every 5 seconds (a background loop in the engine process). Not per-memory inline
- **Cost**: ~50 memories/agent/day × 20 agents × 100 tokens/memory = 100K tokens/day ≈ $0.002/day. Negligible

### O. Skill Library Limits

- **Max skills per agent**: 50. When at cap, the least-used skill (lowest `times_used`) is archived before adding a new one
- **Critic cost**: The critic LLM call uses a short prompt (~2K tokens) and only fires on profitable trades with novel rationale — estimated ~5 critic calls/agent/day. Cost: negligible
- **Critic runs outside the tick loop**: It's a fire-and-forget async call. The trade is already recorded; the critic just decides whether to persist the skill. No tick blocking

### P. Share Card Building Image

- **Approach**: Use git-city's **2D pixel building renderer** (canvas-based, from `share-card/route.tsx`). NOT 3D. The pixel building scales height/width based on agent stats, same as git-city's approach
- **Why not 3D**: Server-side 3D rendering requires headless Chrome/Puppeteer — too heavy for an API route. The 2D pixel art is charming and fast
- **Building visualization**: Height proportional to `sprawl_lifetime_earned`, color based on P&L (green/red), tier badge from XP level

### Q. Demo Mode Seeding

```typescript
// frontend/scripts/seed-demo.ts — run once before demo
async function seedDemo() {
    for (let i = 0; i < 20; i++) {
        // 1. Create agent wallet
        const wallet = ethers.Wallet.createRandom().connect(provider);
        
        // 2. Fund from faucet
        await agentFaucet.fundNewAgent(wallet.address);
        
        // 3. Register ERC-8004 identity
        const agentURI = `https://sprawl.vercel.app/api/agent/${i+1}/registration.json`;
        await identityRegistry.connect(wallet).register(agentURI);
        
        // 4. Register in CityState
        await cityState.connect(deployerWallet).spawnAgent(i+1, wallet.address, i % 3); // rotate strategy types
        
        // 5. Simulate trading history (execute 50-200 random trades)
        for (let t = 0; t < 100 + Math.random() * 100; t++) {
            const pool = POOLS[Math.floor(Math.random() * POOLS.length)];
            await sprawlDex.connect(wallet).swap(pool.tokenA, pool.tokenB, randomAmount(), 0);
        }
        
        // 6. Insert Supabase records (the indexer picks up on-chain events, but we also seed directly for speed)
        await supabase.from('agents').update({ 
            xp_total: Math.floor(Math.random() * 5000),
            xp_level: Math.floor(Math.random() * 15) + 1,
            sprawl_lifetime_earned: Math.floor(Math.random() * 1000),
            raid_wins: Math.floor(Math.random() * 20),
        }).eq('agent_id', i + 1);
    }
}
```

- **Run as**: `npx tsx frontend/scripts/seed-demo.ts` — one-time script before the demo
- **Gas**: 20 agents × (1 faucet + 1 register + 1 spawn + 150 trades) ≈ 3,000 txs × <$0.01 = <$30 in MNT gas. Deployer wallet needs ~30 MNT (faucet gives 1000/day)
- **Deterministic mode flag**: `DEMO_MODE=true` env var makes the MarketMaker use a seeded PRNG instead of CoinGecko, producing the same price trajectory every time

---

## Appendix B: Type Definitions, Missing Contract Functions & 3D Dependency Graph

### B.1 `AgentRecord` TypeScript Interface (canonical, used everywhere)

```typescript
interface AgentRecord {
    // Identity
    agent_id: number;
    wallet_address: string;
    owner_address: string;
    name: string;
    persona: string;                     // LLM personality prompt (soul entry — never overwritten)
    strategy_type: 0 | 1 | 2;           // 0=preset, 1=rules, 2=llm
    policy_config: AgentPolicy;          // JSON: rules, risk tolerance, limits
    
    // $SPRAWL economy
    sprawl_balance: number;
    sprawl_lifetime_earned: number;      // drives building height
    sprawl_lifetime_spent: number;
    last_portfolio_value: number;        // sUSDC, for daily P&L settlement
    last_settlement_date: string;        // ISO date, for settlement catch-up
    
    // Building dimensions (computed server-side, not stored)
    // These are derived fields returned by /api/city, not DB columns
    
    // Game state
    total_volume: number;
    strategy_count: number;
    recent_actions: number;              // actions in last 24h
    reputation_score: number;            // ERC-8004 (0-100)
    xp_total: number;
    xp_level: number;
    xp_daily: number;
    xp_daily_date: string;
    raid_xp: number;
    raid_wins: number;
    raid_losses: number;
    app_streak: number;
    
    // Rolling weekly stats (reset weekly by engine cron)
    weekly_volume: number;
    weekly_start_date: string;
    profit_streak: number;               // consecutive profitable days
    reputation_given: number;            // feedback given to other agents this week
    
    // Memory engine state
    poignancy_accumulator: number;       // cumulative importance, resets at 150 on reflection
    
    // District
    district: string;                    // 'dex' | 'lending' | 'yield' | 'bridge' | 'general'
    
    // Timestamps
    created_at: string;
    last_action_at: string;
}
```

### B.2 `CityBuilding` Interface (renderer input — what /api/city returns per agent)

```typescript
interface CityBuilding {
    // Identity
    agent_id: number;
    name: string;
    strategy_type: 0 | 1 | 2;
    district: string;
    
    // Computed building dimensions (server-side in /api/city route)
    position: [number, number, number];  // from city-layout.ts spiral algorithm
    height: number;                      // computeBuildingHeight() → 35-600
    width: number;                       // computeBuildingWidth() → 14-38
    depth: number;                       // computeBuildingDepth() → 12-32
    floors: number;                      // Math.floor(height / FLOOR_HEIGHT)
    windowsPerFloor: number;             // Math.max(2, Math.floor(width / WINDOW_SPACING))
    sideWindowsPerFloor: number;         // Math.max(2, Math.floor(depth / WINDOW_SPACING))
    litPercentage: number;               // computeLitPercentage() → 0.05-0.95
    
    // Visual modifiers
    tint: [number, number, number, number]; // RGBA — green=profitable, red=losing, gold=top
    glow: number;                        // reputation_score / 100 → 0.0-1.0
    
    // Game state (for UI overlays)
    xp_level: number;
    xp_total: number;
    sprawl_lifetime_earned: number;
    net_pnl: number;                     // for tint + inspector panel
    raid_wins: number;
    raid_losses: number;
    reputation_score: number;
    
    // Cosmetics
    loadout: { crown: string | null; roof: string | null; aura: string | null };
    active_raid_tag: { attacker_name: string; tag_style: string; expires_at: string } | null;
    
    // For live presence dots
    is_active: boolean;                  // had an action in last 5 minutes
}
```

### B.3 `computeBuildingDepth()` (was missing)

```typescript
function computeBuildingDepth(agent: AgentRecord): number {
    // Reference: inspiration/git-city/src/lib/github.ts line 253
    // Original uses repos_contributed_to, organizations, PRs, follower ratio
    // Sprawl: uses strategy_count (breadth), LP positions, protocol diversity
    const strategyNorm = Math.min(agent.strategy_count / 10, 1);
    const levelNorm = agent.xp_level / 25;
    const score = Math.pow(strategyNorm, 0.5) * 0.60 + Math.pow(levelNorm, 0.5) * 0.40;
    const jitter = seededRandom(agent.agent_id) * 4 - 2; // ±2 deterministic
    return Math.round(12 + score * 20 + jitter);
}

// floors, windowsPerFloor, sideWindowsPerFloor derivation:
const FLOOR_HEIGHT = 6;
const WINDOW_SPACING = 6;
building.floors = Math.max(1, Math.floor(building.height / FLOOR_HEIGHT));
building.windowsPerFloor = Math.max(2, Math.floor(building.width / WINDOW_SPACING));
building.sideWindowsPerFloor = Math.max(2, Math.floor(building.depth / WINDOW_SPACING));
```

### B.4 `CityState.updateAgent()` Contract Function (was missing)

```solidity
// Called by CityReferee after trade outcomes or daily settlement
function updateAgent(uint256 agentId, int256 pnlDelta, uint256 newVolume) external onlyReferee {
    AgentStats storage stats = agents[agentId];
    stats.totalVolume = newVolume;
    stats.netPnl += pnlDelta;
    
    // Level up check (mirrors XP leveling — every 1000 SPRAWL earned = 1 level)
    uint256 newLevel = stats.totalVolume / LEVEL_THRESHOLD;
    if (newLevel > stats.level) {
        stats.level = newLevel;
        emit BuildingGrew(agentId, newLevel, stats.totalVolume);
    }
    
    emit AgentOutcome(agentId, pnlDelta, newVolume, stats.level);
}

// Called by engine for daily settlement
function settleDaily(uint256 agentId, int256 dailyPnl, uint256 sprawlReward) external onlyReferee {
    if (dailyPnl > 0 && sprawlReward > 0) {
        sprawlToken.mint(agents[agentId].wallet, sprawlReward);
    }
    emit AgentOutcome(agentId, dailyPnl, agents[agentId].totalVolume, agents[agentId].level);
}
```

### B.5 `DEFI_TOOL_SCHEMAS` (DeepSeek v4 tool definitions)

```typescript
const DEFI_TOOL_SCHEMAS = [
    {
        type: 'function',
        function: {
            name: 'swap',
            description: 'Swap one token for another on SprawlDEX',
            parameters: {
                type: 'object',
                properties: {
                    tokenIn:  { type: 'string', enum: ['sETH', 'sBTC', 'sPOL', 'sSOL', 'sUSDC', 'SPRAWL'] },
                    tokenOut: { type: 'string', enum: ['sETH', 'sBTC', 'sPOL', 'sSOL', 'sUSDC', 'SPRAWL'] },
                    amountPercent: { type: 'number', description: 'Percentage of held tokenIn to swap (1-100)' },
                },
                required: ['tokenIn', 'tokenOut', 'amountPercent'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'provideLiquidity',
            description: 'Add liquidity to a SprawlDEX pool to earn swap fees',
            parameters: {
                type: 'object',
                properties: {
                    tokenA: { type: 'string', enum: ['sETH', 'sBTC', 'sPOL', 'sSOL', 'sUSDC', 'SPRAWL'] },
                    tokenB: { type: 'string', enum: ['sETH', 'sBTC', 'sPOL', 'sSOL', 'sUSDC', 'SPRAWL'] },
                    amountPercent: { type: 'number', description: 'Percentage of portfolio to allocate (1-50)' },
                },
                required: ['tokenA', 'tokenB', 'amountPercent'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'removeLiquidity',
            description: 'Remove liquidity from a SprawlDEX pool',
            parameters: {
                type: 'object',
                properties: {
                    tokenA: { type: 'string' },
                    tokenB: { type: 'string' },
                    percentToRemove: { type: 'number', description: '1-100' },
                },
                required: ['tokenA', 'tokenB', 'percentToRemove'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'hold',
            description: 'Do nothing this tick. Use when market conditions are unclear or no good opportunity exists.',
            parameters: { type: 'object', properties: {} },
        },
    },
    {
        type: 'function',
        function: {
            name: 'raid',
            description: 'Initiate a raid against another agent. Costs 5 $SPRAWL. Winner gets XP and building dominance.',
            parameters: {
                type: 'object',
                properties: {
                    targetAgentId: { type: 'number', description: 'The agent_id to raid' },
                },
                required: ['targetAgentId'],
            },
        },
    },
];
```

### B.6 `agent_wallets` Table Schema (was missing)

```sql
CREATE TABLE agent_wallets (
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
```

### B.7 Supabase RLS Policies

```sql
-- agents: public read (leaderboard), write only via service role (indexer/engine)
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON agents FOR SELECT USING (true);
-- No INSERT/UPDATE/DELETE policy = only service role can write

-- trade_history: public read (transparency), write only via service role
ALTER TABLE trade_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON trade_history FOR SELECT USING (true);

-- agent_memories: read only by agent owner, write only via service role
ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner read" ON agent_memories FOR SELECT 
    USING (agent_id IN (SELECT agent_id FROM agents WHERE owner_address = auth.jwt()->>'address'));

-- agent_wallets: NO policies = zero browser access. Service role only.
ALTER TABLE agent_wallets ENABLE ROW LEVEL SECURITY;

-- activity_feed: public read
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON activity_feed FOR SELECT USING (true);

-- agent_skills: public read (other agents can learn from visible strategies)
ALTER TABLE agent_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON agent_skills FOR SELECT USING (true);
```

### B.8 Missing `agents` Table Columns (add to Section 3.2 schema)

```sql
-- These columns are referenced throughout the plan but were missing from the original schema:
ALTER TABLE agents ADD COLUMN weekly_volume BIGINT DEFAULT 0;
ALTER TABLE agents ADD COLUMN weekly_start_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE agents ADD COLUMN profit_streak INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN reputation_given INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN poignancy_accumulator INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN last_settlement_date DATE;
ALTER TABLE agents ADD COLUMN net_pnl BIGINT DEFAULT 0;

-- Weekly volume reset cron (runs every Monday at 00:00 UTC)
-- Called by engine: UPDATE agents SET weekly_volume = 0, weekly_start_date = CURRENT_DATE 
--                   WHERE weekly_start_date < date_trunc('week', CURRENT_DATE);
```

### B.9 Complete 3D File Copy List from git-city

The plan's original copy list had 3 renderer files. The actual minimum to compile is **12 files**:

| File | Why needed | What to change for Sprawl |
|------|-----------|---------------------------|
| `src/components/InstancedBuildings.tsx` | Core GPU renderer, GLSL shaders, atlas UV mapping, rise animation, raycasting | Replace `DeveloperRecord` → `CityBuilding`. Remove line 430 hardcoded `"srizzon"` glow override |
| `src/components/CityCanvas.tsx` | Scene root: themes, sky dome, bloom, fog, OrbitControls, PerformanceMonitor, intro flyover | Remove imports: `FounderSpire`, `EArcadeLandmark`, `SponsoredLandmark`, `WhiteRabbit`, `RaidSequence3D`, `RemotePilots`, `ProjectileSwarm`, `ComparePath`, `CompareCinematic`, `CompareSplitScreen`, `CelebrationEffect`, `LocalizedFireworks`, `WallpaperParallax`, `ThemeSkyFX`, `SkyAds`, `BuildingAds`. Replace intro flyover target with city center (0,0,0). Wire `SkyAds` → `billboards` Supabase table later |
| `src/components/CityScene.tsx` | Bridge: atlas creation, spatial grid, focus state, wires all sub-components | Adapt types. Replace `useCodingPresence` → Supabase Realtime subscription on `activity_feed` for live presence |
| `src/components/Building3D.tsx` | `createWindowAtlas()` (called by CityScene line 105), `FocusBeacon` (rendered in CityScene lines 210-229), `ClaimedGlow`, `BuildingItemEffects` | Keep atlas creation + FocusBeacon. Remove `ClaimedGlow` (GitHub-specific). Adapt `BuildingItemEffects` to Sprawl zone items |
| `src/components/InstancedLabels.tsx` | Second GPU draw call: instanced billboarded text labels (agent names) | Replace `login` → `agent.name` |
| `src/components/EffectsLayer.tsx` | Spatial-LOD per-building effects: cosmetic items + raid tags + aura | Keep structure. Adapt to Sprawl zone items and raid tag format |
| `src/components/BuildingEffects.tsx` | ~20 Three.js visual effects: NeonOutline, ParticleAura, StreakFlame, Spire, HologramRing, etc. | Copy all effects as-is — they are generic Three.js geometry, not GitHub-specific |
| `src/components/RaidTag3D.tsx` | 3D graffiti tag rendered on raided buildings (3-day visual) | Keep as-is, just feed from Sprawl `raid_tags` table |
| `src/components/LiveDots.tsx` | Pulsing presence dots above active buildings | Keep as-is. Feed from `is_active` field on `CityBuilding` |
| `src/components/DropBeacon.tsx` | Pillar-of-light effect | Keep as-is or repurpose for "$SPRAWL earned" celebration |
| `src/components/LoadingScreen.tsx` | Gates `holdRise` timing — buildings wait for this before rising | Copy as-is |
| `src/lib/perfMode.ts` | `usePerfMode()` hook: adaptive DPR, bloom gate, low-perf detection | Copy as-is |

**DELETE from CityCanvas.tsx** (git-city specific features):
- `FounderSpire` + `EArcadeLandmark` + `SponsoredLandmark` → replace with a simple central `SprawlMonument` (a tall glowing pillar at 0,0,0 whose height = total city $SPRAWL earned)
- `WhiteRabbit` → easter egg, delete
- `RaidSequence3D` + `RemotePilots` + `ProjectileSwarm` → the full raid animation system. **KEEP** if time permits (it's the visual wow factor for raids). Otherwise, simplify to a flash effect
- `ComparePath/Cinematic/SplitScreen` → compare mode, keep but adapt to agent comparison
- `SkyAds` + `BuildingAds` → keep, wire to `billboards` Supabase table
- `CelebrationEffect` + `LocalizedFireworks` → keep for achievement unlocks
- `WallpaperParallax` + `ThemeSkyFX` → keep, they're theme eye candy

**Replace `useCodingPresence` hook:**
```typescript
// git-city: tracks VS Code live coders via PartyKit
// Sprawl: tracks recently active agents via Supabase Realtime
function useAgentPresence(): Set<number> {
    const [activeAgents, setActiveAgents] = useState<Set<number>>(new Set());
    useEffect(() => {
        const channel = supabase.channel('presence')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'agents', 
                 filter: 'last_action_at=gt.' + fiveMinutesAgo() },
                (payload) => setActiveAgents(prev => new Set([...prev, payload.new.agent_id])))
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, []);
    return activeAgents;
}
```
