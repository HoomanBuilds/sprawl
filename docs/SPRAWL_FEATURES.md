# Sprawl Protocol — Complete Feature & Architecture Map

> "A verifiable on-chain civilization built by autonomous agents."
> Every building is an ERC-8004 citizen. Every floor was earned by a recorded,
> auditable DeFi decision on Mantle. Humans and LLMs compete to grow the same skyline.

## Target
- **Hackathon:** Mantle Turing Test 2026, Phase II — AI Awakening
- **Track:** Consumer & Viral DApps (primary), Agentic Economy + AI × RWA (secondary)
- **Deadline:** 2026-06-15 15:59 | Demo Day: July 2–3 | Winners: July 10
- **Chain:** Mantle Sepolia (5003) for demo, Mantle mainnet (5000) as roadmap

---

## The Core Loop

```
User spawns agent (1-click, gasless)
  → Agent mints ERC-8004 identity NFT on Mantle
    → Agent analyzes market via DeepSeek v4 (or rule-based config)
      → Agent executes DeFi action (swap, LP, yield) via Byreal Skills / GOAT SDK
        → CityState contract records decision + outcome as events
          → Indexer picks up events → writes to Supabase
            → 3D city renderer updates: building grows/glows/animates
              → Repeat (autonomous loop)
```

---

## Layer 1 — Smart Contracts (Solidity, Foundry/Hardhat, Mantle Sepolia 5003)

### AgentRegistry (extends ERC-8004 Identity Registry)
- Mints ERC-721 identity NFT per agent at spawn
- tokenURI → JSON registration file: name, strategy type (RULE/LLM), wallet address, city endpoint
- Stores: strategy type flag, building seed (for deterministic visual generation)
- Owner can transfer/delegate agent NFT

### CityState (the source of truth)
- Tracks per-agent: level, building height, footprint, companies/strategies, district, cumulative P&L
- `recordDecision(agentId, action, protocol, params)` → emits `AgentDecision` event
- `recordOutcome(agentId, pnl, newLevel)` → emits `BuildingGrew`, `CompanyBuilt` events
- Design: minimal SSTORE, rich events (~8 gas/byte vs 20K gas for storage)
- P&L → height mapping: log-scaled to keep skyline readable
- New strategy crossing threshold → adds "company" (increases footprint)
- Level promotion from cumulative milestones

### CityReferee (Reputation hook)
- Trusted contract that calls ERC-8004 `giveFeedback()` on the Reputation Registry
- Translates verified outcomes (wins, P&L, streaks) into portable reputation scores (0–100)
- EIP-191/ERC-1271 feedbackAuth signatures prevent spam
- Agent owner cannot rate itself

### Billboard/Ads Contract
- `purchaseAd(slot, uri, duration)` → escrows MNT, emits `AdPurchased(advertiser, slot, uri, expiry)`
- Expiry enforced by block timestamp
- Indexer mirrors to Supabase → 3D scene renders billboard objects
- Ad metadata/images on IPFS (Pinata) or Cloudflare R2

### Raid Contract
- `initiateRaid(attackerId, defenderId)` → compares P&L over a settlement window
- Winner's building grows, takes territory/color from loser
- Results keyed to on-chain tx hashes → verifiable leaderboard
- Cooldowns + daily limits (anti-spam)
- Emits `RaidResult(winnerId, loserId, spoils)`

---

## Layer 2 — Agent Engine (TypeScript/Node)

### Strategy Engine Interface
```typescript
interface StrategyEngine {
  decide(ctx: MarketContext & AgentState): AgentDecision
  // Returns: { action, protocol, params, rationale }
}
```

### RuleBasedStrategy
- Deterministic policy from user-supplied config
- Example: "if mETH/USDC APR > X and drawdown < Y → LP; rebalance when out of range"
- No LLM — cheap, safe, auditable
- Users configure via spawn UI

### LLMStrategy (DeepSeek v4)
- Same `decide()` interface, backed by DeepSeek v4 API call
- Prompt: market context + agent persona/goal + available tools schema
- Constrained to emit tool calls from fixed schema (Byreal Skills / GOAT tools)
- DeepSeek v4 replaces the doc's suggested Gemini/Groq stack — single provider, no tier-juggling

### GuardrailLayer (wraps both strategies)
- Hard caps on position size
- Protocol/token allowlists
- Slippage limits
- Max transactions per hour
- Dry-run simulation before signing (Byreal `--dry-run`)
- Deterministic rule-based fallback if LLM output is invalid
- Every decision logged as AgentDecision event regardless of source

### DeFi Execution
- **Byreal Agent Skills CLI** (`@byreal-io/byreal-cli`): pools, tokens, swap, positions, wallet
- **GOAT SDK** (`@goat-sdk`): 200+ onchain tools, viem wallet client
- Protocols: Merchant Moe, Agni Finance, Fluxion
- Assets: mETH, cmETH, USDY, fBTC, USDe, MNT

### Wallet / Key Management
- ERC-4337 smart-contract wallets with session keys
- Session keys scoped to: specific protocols, spend limits, expiry
- thirdweb embedded wallets (10K free MAW) for gasless onboarding
- Demo: agent EOAs with small testnet amounts + guardrail contract
- Mainnet: audited smart wallets + kill switch

---

## Layer 3 — Indexer (Node service or Goldsky subgraph)

### Event Indexer
- Listens to CityState, AgentRegistry, Billboard, Raid contract events on Mantle Sepolia
- Decodes events → writes to Supabase Postgres (same schema the frontend expects)
- Replaces git-city's GitHub API ingestion — this is the critical-path rewrite
- Options: Goldsky subgraph (free forever), local Node listener, or GitHub Actions cron

### Data Flow
```
Mantle Events → Indexer → Supabase Postgres → Next.js API routes → R3F renderer
```

---

## Layer 4 — 3D Visualization (Next.js 16 + React Three Fiber)

### City Renderer (from git-city fork)
- Instanced meshes for buildings (GPU-efficient for large cities)
- LOD system: near = full detail + animated windows, far = simplified geometry
- Camera: flight controls, orbit, free-fly

### Building-to-Agent Mapping
| Visual Property | Data Source |
|---|---|
| Height / floors | Cumulative realized DeFi P&L (log-scaled) |
| Base width / footprint | Number of distinct strategies ("companies") |
| Lit/animated windows | Recent on-chain actions (swaps, LP, yield claims) |
| Glow / aura intensity | ERC-8004 reputation score |
| Color / territory | Raid results (winner takes loser's color) |
| Crown / roof effects | Achievement cosmetics (unlocked by milestones) |

### Building Customization (Zone System)
- Zones: crown, roof, aura, faces — kept from git-city
- Items: Crown, Neon Outline, Lightning Aura, Hologram Ring, Helipad, Rooftop Garden, etc.
- Unlock trigger: on-chain milestones / ERC-8004 reputation tiers (replaces Stripe purchase)
- Loadout stored in `developer_customizations` table, mirrored from on-chain state

### Decision Feed Overlay
- Real-time stream of agent decisions displayed in-city
- Per-building inspector panel: last N decisions, P&L chart, reputation score, Mantle explorer links
- Clickable → opens tx on explorer.sepolia.mantle.xyz

### Activity Feed
- Decoded event stream: trades, raids, level-ups, company formations, ad purchases
- Filterable by agent, protocol, event type

---

## Layer 5 — User-Facing Features

### Spawn-an-Agent (1-click, gasless)
- AA/gasless onboarding — judge or viewer becomes city founder instantly
- Choose: rule-based (configure params) or LLM-powered (DeepSeek v4 with persona)
- thirdweb embedded wallet created automatically
- Agent mints ERC-8004 identity, appears as building in city

### Human vs. AI Arena
- Rule-based agents (human-configured) compete alongside LLM agents (DeepSeek v4)
- Same interface, same skyline, same scoring — directly dramatizes "Human vs. AI"
- Strategy type flag visible on each building

### Live Leaderboard
- Ranked by: cumulative P&L, level, raid wins, reputation score
- Filterable: all agents, rule-based only, LLM only
- Real-time updates from indexer

### Raid System (PvP)
- Agent-vs-agent P&L battles
- Winner's building grows, takes territory
- Achievements: "Burglar," "Pickpocket," streak-based unlocks
- Cooldowns prevent spam
- Results on-chain, verifiable

### Billboard Advertising
- On-chain MNT payments for 3D in-city ad placements
- Tiers: rooftop signs, blimps, LED wraps
- Smart contract escrow + expiry
- Ad content on IPFS

### XP & Leveling System
- 25 levels, 6 tiers (from git-city)
- XP earned from: on-chain activity, profitable trades, raid wins, milestones
- Level → building visual upgrades + cosmetic unlocks

### Achievements
- On-chain milestones: "First Profitable Trade," "Built a District," "100 Transactions"
- Raid achievements: "Burglar," "Pickpocket," streak-based
- Unlock cosmetics in zone system

### Compare Mode
- Side-by-side building comparison (from git-city)
- Show: P&L, strategies, reputation, level, raid record

### Share Cards
- Shareable image of agent's building + stats
- Optimized for X/Twitter posting → farms $17K community voting prize
- Deep link back to city view

### Watch Mode (Livestream-ready)
- Real-time stream of all agent decisions
- Designed for Demo Day July 2–3 livestream
- Full transparency: every decision traceable to on-chain tx

### Demo Mode
- Pre-funded agents with scripted market scenario
- Deterministic fallback so livestream can't be derailed by testnet flakiness
- Cached indexer data as backup

---

## LLM Layer — DeepSeek v4

We have API access to DeepSeek v4. This replaces the doc's multi-provider free-tier juggling (Gemini/Groq/OpenRouter). Benefits:

- **Single provider** — no routing logic, no tier management
- **LLMStrategy** calls DeepSeek v4 with structured output (tool-call schema)
- **Agent persona prompts** — each LLM agent gets a unique persona/goal fed as system prompt
- **Market analysis** — DeepSeek v4 processes: pool data, price feeds, agent state, P&L history
- **Decision output** — constrained to emit actions from Byreal Skills / GOAT SDK tool schemas
- **Rationale logging** — every decision includes a `rationale` field logged on-chain (transparency)

### Where DeepSeek v4 is used:
1. **Agent decision-making** — the core `LLMStrategy.decide()` loop
2. **Market analysis** — interpreting pool APRs, price movements, risk signals
3. **Raid strategy** — choosing when/who to raid based on opponent analysis
4. **Persona behavior** — agents with different personalities make different choices (narrative value)

---

## Tech Stack Summary

| Layer | Tech |
|---|---|
| Chain | Mantle Sepolia (5003) / Mainnet (5000) |
| Contracts | Solidity, Foundry or Hardhat, OpenZeppelin, ERC-8004 |
| Agent Engine | TypeScript/Node, GOAT SDK, Byreal Agent Skills CLI |
| LLM | DeepSeek v4 API |
| Indexer | Goldsky subgraph or Node event listener |
| Database | Supabase (Postgres + Realtime + RLS) |
| Frontend | Next.js 16 (App Router), React Three Fiber, drei, Tailwind CSS v4 |
| Wallets/AA | thirdweb (embedded wallets, ERC-4337, gas sponsorship) |
| Storage | Pinata (IPFS), Cloudflare R2 |
| Hosting | Vercel |

---

## What Makes Sprawl Win

1. **The skyline IS the benchmark** — not a dashboard with numbers, a living 3D city where height = verified P&L
2. **Dual-mode agents** — rule-based vs DeepSeek v4, same arena, "Human vs. AI" dramatized
3. **Radical transparency** — every decision on-chain, every building click → explorer link
4. **1-click gasless onboarding** — AA/embedded wallets, judge spawns agent instantly
5. **Shareable artifacts** — building cards for X, targeting $17K community prize
6. **Cross-track resonance** — Consumer DApp + Agentic Economy + AI × RWA in one project
7. **ERC-8004 native** — agent identity + reputation on-chain, portable, standards-compliant
