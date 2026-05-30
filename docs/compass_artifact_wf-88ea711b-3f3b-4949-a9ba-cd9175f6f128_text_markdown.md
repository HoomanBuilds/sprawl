# Building "AgentPolis": An AI-Agent-Driven On-Chain City for the Mantle Turing Test Hackathon 2026

## TL;DR
- **Build it, and target the Consumer & Viral DApps track (Animoca-sponsored) as your primary track, with Agentic Economy (Byreal) and AI Trading & Strategy (BGA × Bybit) as secondary fits** — a 3D "Git City" reskin where autonomous AI agents' real DeFi actions on Mantle (not git commits) build/grow a shared city, each agent carrying an ERC-8004 identity NFT and recording every decision on-chain, hits the hackathon's three signature themes (on-chain benchmarking, ERC-8004 reputation, radical transparency) almost perfectly.
- **The technical path is well-trodden:** fork `srizzon/git-city` (Next.js 16 + React Three Fiber, AGPL-3.0) for the visualization, swap its Supabase/GitHub data source for a Mantle indexer; deploy contracts on Mantle Sepolia (chain ID 5003); build agents on Coinbase AgentKit or GOAT SDK + Byreal Agent Skills for execution; issue identities via the ERC-8004 reference registries; demo entirely on testnet and treat mainnet as an optional, risk-controlled stretch.
- **Win condition:** the judges score Part A (50 pts: Technical 15, Ecosystem Fit 10, Business Potential 10, Innovation 10, UX 5) + a track-specific Part B (50 pts). A polished, end-to-end demo that runs on Mantle, integrates Mantle DeFi assets (mETH/USDY), and shows verifiable agent transparency wins on Ecosystem Fit + UX + Innovation simultaneously. Submit a #MantleAIHackathon X thread with pitch, demo video, GitHub link and Mantle contract address by the June 15, 2026 deadline.

---

## Key Findings

1. **The concept is an unusually tight fit for this specific hackathon.** Mantle explicitly built the event around three "defining features": (a) **on-chain benchmarking** — "every agent decision and outcome is recorded on Mantle"; (b) the **ERC-8004 agent identity standard** — "every participating AI agent is issued a unique identity NFT"; and (c) **radical transparency** via global livestreaming. A city that visibly grows from agents' recorded on-chain decisions is a literal visualization of all three.

2. **Git City is forkable but you are replacing its entire data layer.** The codebase (`github.com/srizzon/git-city`) is Next.js 16 (App Router) + Three.js via `@react-three/fiber` + `drei`, with instanced meshes and an LOD system, backed by Supabase (Postgres + GitHub OAuth) and Stripe. The 3D rendering, building-generation, camera/flight, and achievement systems are highly reusable; the GitHub-OAuth + Supabase data pipeline is what you rip out and replace with a Mantle event indexer. It's AGPL-3.0, so your fork must be open-sourced — which is fine and even advantageous for a hackathon.

3. **Mantle gives you the full agentic stack out of the box.** RealClaw (Byreal's AI trading platform on Mantle), the open-source **Byreal Agent Skills** CLI, and the **OpenClaw** agent framework are first-party tooling. Combined with ERC-8004 reference contracts, Coinbase AgentKit/GOAT SDK for EVM execution, and Mantle's EVM-equivalent L2 (Hardhat/Foundry compatible), every layer you need already exists.

4. **Both agent modes are straightforward to support** with a "strategy engine" abstraction: a rule-based agent is a deterministic policy function; an LLM agent is the same interface backed by a model call. Both emit the same `AgentDecision` events, so the city and the on-chain benchmark treat them identically — which directly demonstrates the "Human vs. AI" framing.

5. **Testnet is sufficient for a winning demo.** The judging rubric rewards "testnet-functional" as "Average" but "production-ready with clear business logic loop" as "Excellent." You should demo fully on Mantle Sepolia with real (testnet) DeFi interactions and present mainnet as a roadmap with concrete risk controls — do not put real capital at risk during a hackathon.

---

## Details

### 1. The Git City codebase — what to reuse, what to rewrite

**Tech stack (from the repo's README/CLAUDE.md):**
- **Framework:** Next.js 16, App Router, Turbopack, TypeScript.
- **3D:** Three.js via `@react-three/fiber` + `drei`; **instanced meshes** for the repeated building geometry and a **Level-of-Detail (LOD)** system (near buildings get full pixel detail and animated windows; distant ones drop to simplified geometry). This is the key to rendering a large city without melting the GPU.
- **Backend/data:** Supabase (Postgres, GitHub OAuth, Row-Level Security). **Stripe** for cosmetic purchases. Hosting on Vercel. Pixel font Silkscreen, Tailwind CSS v4.
- **License:** AGPL-3.0 (any public deployment must share source).
- **Repo structure:** `src/app/` (Next routes + API), `src/components/` (UI + 3D), `src/lib/` (Supabase clients, helpers), `src/types/`, `supabase/` (migrations). The file `zones.ts` is the documented starting point for adding a new building effect or item.

**Data → building mapping in the original:** height = contributions, width (base) = repos, lit/animated windows = recent activity, brightness/glow = stars/popularity. There's an Achievement System (contributions, stars, repos, referrals), building customization (crowns, auras, roof effects), and a "compare two buildings" mode.

**Adaptation for agent-driven growth (the remap):**
| Git City (original) | AgentPolis (your fork) |
|---|---|
| GitHub user → building | ERC-8004 agent → building |
| Contributions → height | Cumulative realized DeFi P&L (or AUM) → height / floors |
| Repos → base width | Number of distinct strategies/positions ("companies") → footprint |
| Lit windows → recent commits | Recent on-chain actions (swaps, LP, yield claims) → window animation |
| Stars/glow → popularity | ERC-8004 reputation score → glow/aura |
| Achievements | On-chain achievements (level-ups, "first profitable trade," "built a district") |
| Districts | "Companies"/strategy guilds — agents pursuing the same protocol cluster geographically |

**Reusable as-is:** the React Three Fiber scene graph, instanced-mesh renderer, LOD logic, camera/flight controls, building-customization/`zones.ts` system, achievement UI, compare/share-card features.

**Rewrite/replace:** the Supabase GitHub-OAuth ingestion and the `GITHUB_TOKEN` GitHub API calls. Replace with a **Mantle event indexer** (a small Node service or a subgraph) that reads your `CityState`/`AgentRegistry` contract events and writes them into the same Postgres schema the front-end already expects. Keep Supabase as your read cache/store — you only swap *what fills it*. This is the single biggest engineering task and the reason the data layer, not the renderer, is your critical path.

### 2. The hackathon specifics (sourced from devhub.mantle.xyz, DoraHacks, and the official "Criteria to Win" sheet)

**Structure & prizes.** Mantle's official April 22, 2026 announcement (PR Newswire/Chainwire) states a **$120,000 total prize pool** — "$20,000 for ClawHack and $100,000 for AI Awakening." Mantle's DevHub headlines "$223K+ total value," which adds ~$103–110K in separate compute/API credits on top of the cash prizes.
- **Phase I — ClawHack:** Apr 15–30, 2026, $20,000. Deploy AI agents trading Mantle DeFi (Merchant Moe, Agni Finance, Fluxion) via RealClaw; scored on trading volume and ROI. (This phase is over as of late May 2026.)
- **Phase II — AI Awakening:** May 1 – Jun 15, 2026, **$100,000**. Submission deadline **2026/06/15 15:59**. Demo Day **July 2–3, 2026** (livestreamed). Winners announced **July 10**.
- **Phase II prize breakdown:** Grand Champion $9,000 ("Top Overall Business Potential, Completion & Mantle Ecosystem Fit"); Track First Prize 6 × $8,500 = $51,000; Community Voting 2 × $8,500 = $17,000 ("Highest Engagement on X"); Best UI/UX $3,000 ("Best UX & Smoothest Web2 Onboarding"); Finalist & Deployment 20 × $1,000 = $20,000 (top 20 deployed on Mantle).
- **Compute credits:** ~$103–110K in API credits (Nansen, Elfa AI, Surf AI, Orbit AI, AltLLM) — apply via the Phase II form; covers inference + on-chain data costs.

**The six Phase II tracks (and sponsors):**
1. **AI Trading & Strategy** (BGA × Bybit) — quant bots, macro-driven smart contracts; Python/Solidity templates, Bybit API.
2. **AI Alpha & Data** (Mirana Ventures) — smart-money tracking, anomaly bots via Telegram/Discord.
3. **AI × RWA** (Mantle) — dynamic yield/automated risk for USDY, mETH.
4. **Consumer & Viral DApps** (Animoca Minds/Brands + OpenCheck) — gamified trading UIs, shareable consumer AI apps.
5. **AI DevTools** (Tencent Cloud) — gas optimization, audit assistants.
6. **Agentic Economy** (Byreal) — agentic wallet economies built using the Byreal Skills CLI.

**Best-fit track strategy:** Submit primarily to **Consumer & Viral DApps** — a flythrough 3D city is the most "viral/shareable consumer" artifact in the field, and Animoca/OpenCheck judges reward gamified UX. Engineer the project so it *also* qualifies as **Agentic Economy** (agents have wallets + Byreal Skills) and **AI × RWA** (agents farm mETH/USDY). You submit to one track on DoraHacks but build for cross-track resonance; the Grand Champion is judged across all.

**Exact judging rubric (from the official "Judging Criteria of AI Awakening" sheet — 100 pts, 50/50 split):**
- **Part A — Mantle General (50 pts, all tracks):** Technical 15 (architecture, security, code quality, completeness — *"core functionality must run end-to-end on the Mantle network"*); Ecosystem Fit 10 (Mantle stack + asset integration); Business Potential 10 (PMF, tokenomics, GTM); Innovation 10 (originality, *"not simple forks or clones"*); User Experience 5 (UI/UX, onboarding, **AA/gasless integration**).
- **Part B — track-specific (50 pts).** For the AI Trading & Strategy track (BGA), Part B weights: Alignment with BGA ethos 10, Innovation & technical depth 10, Strategy design & risk management 7.5, **Transparency & verifiability 7.5**, Real-world impact 5 (*"bonus consideration for applicability to RWAs, ESG assets, or underserved markets"*), User accessibility & UX 5, Execution & demo quality 5. Other tracks have their own sponsor Part B.

**Submission requirements:** Register on DoraHacks (or HackQuest) and **post an X thread tagged #MantleAIHackathon containing your pitch, demo video, GitHub link, and Mantle contract address.** Note the $17K community-voting prize is pure X engagement — the thread is both a requirement and a prize lever.

**What earns implicit "bonus":** There is no separate bonus-points line beyond the RWA/ESG note. But the three defining features — recording every agent decision on Mantle, ERC-8004 identity, and live-streamable transparency — map directly onto scored dimensions (Technical "end-to-end on Mantle," Ecosystem Fit, Transparency & Verifiability, Execution & Demo Quality). Leaning into them is the highest-leverage way to score.

**Judging panel (Demo Day):** Mantle (Joshua, Whisker Yu), DoraHacks (Jonathan Breton), Byreal (James, Stanley), BGA (Glenn Tan, Tiffany Wang), Elfa.ai (Tristan Teo, CEO), Virtuals (KK, COO), Nansen (Hurcan Polat), Animoca Brands (David Ching), Mirana (Issac), Tencent Cloud (Vizta Tsang), Surf AI (Ryan), Allora (Difeng Jiang), Hashed (Dan Park), Caladan (Arun Kumar), HKU (Prof. Jack Poon).

### 3. ERC-8004 agent identity standard

ERC-8004 ("Trustless Agents") is an Ethereum standard authored by Marco De Rossi (MetaMask), Davide Crapis (Ethereum Foundation), Jordan Ellis (Google), and Erik Reppel (Coinbase). Per the EIP and Ethereum Foundation timeline: EIP-8004 was first proposed **Aug 13, 2025**; the finalized v1 spec went live **Oct 9, 2025**; and it deployed to **Ethereum mainnet on Jan 29, 2026** (reference implementations also live on Ethereum/Base/Linea Sepolia and Hedera testnets). It specifies **three lightweight on-chain registries**, deployable as **per-chain singletons** on any L2 (including Mantle):
- **Identity Registry** — an **ERC-721 with URIStorage** handle. Each agent is an NFT whose `tokenURI` resolves to a JSON "registration file" (`type`, `name`, `description`, `image`, `services[]` with endpoints like web/A2A/MCP, and agent wallet addresses). Register via `register(uri)` returning an `agentId`; update via `setAgentURI(agentId, uri)`. The NFT owner owns the agent and can transfer/delegate.
- **Reputation Registry** — standardized feedback. `giveFeedback(agentId, value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash)`; an authorized client posts a score (the reference impl uses 0–100) with optional tags/URI; an EIP-191/ERC-1271 `feedbackAuth` signature prevents spam (and the agent owner cannot rate itself). Reads via `getSummary(...)`, `readFeedback(...)`, `readAllFeedback(...)`; emits `NewFeedback` events.
- **Validation Registry** — hooks for independent verification (`validationRequest`/`validationResponse`), e.g. stakers, zkML, or TEE oracles. This section is still under active spec revision.

**Reference implementations to fork:** the canonical `erc-8004/erc-8004-contracts` (curated by the 8004 team; deterministic `0x8004…` addresses); `nuwa-protocol/nuwa-8004` (100% v1.0-compliant, Foundry, security-hardened with ReentrancyGuard, signature schemes); `vistara-apps/erc-8004-example` (Identity+Reputation+Validation + CrewAI agents); and `Phala-Network/erc-8004-tee-agent` (adds Intel TDX TEE attestation — relevant if you want "verifiable" agents).

**How you use it for AgentPolis:** Each city-building agent mints an Identity NFT at spawn; its registration JSON describes its strategy type (rule-based vs LLM), wallet, and a city endpoint. The building in the 3D city is keyed to `agentId`. Achievements (level, companies built, cumulative profit) can be (a) recorded as your own `CityState` events for cheap indexing, and (b) surfaced into the Reputation Registry via `giveFeedback` from a trusted "city referee" contract/validator so reputation is portable and standards-compliant. The agent NFT's `image`/metadata can even point to a render of its building.

### 4. Byreal / RealClaw / OpenClaw

- **Byreal** is a DEX incubated by Bybit, built "AI-agent-native" (originally on Solana as a CLMM/concentrated-liquidity DEX). Founder: Emily Bao (also a Bybit Spot executive and Mantle advisor).
- **RealClaw** is Byreal's AI agent trading platform; on Mantle it powers the ClawHack competition (`openclaw.mantle.xyz` — "create your AI Agent, trade on DeFi, climb the leaderboard"). It uses **Privy** non-custodial wallets (users keep keys), runs strategies continuously, and is operated conversationally (e.g., via Telegram). Initial access is whitelist-only.
- **Byreal Agent Skills / "Byreal Skills CLI"** is open-source: `github.com/byreal-git/byreal-agent-skills`, installed via `npm i -g @byreal-io/byreal-cli`. It exposes structured-JSON commands an LLM can call: `pools` (list/analyze CLMM pools, APR, TVL), `tokens`, `swap` (preview/execute with slippage), `positions` (open/close/claim, copy top farmers), `wallet`. There's also a perps variant (`@byreal-io/byreal-perps-cli`) built on Hyperliquid. This is the **required substrate for the Agentic Economy track.**
- **OpenClaw** is the agent framework layer — it uses **AgentSkills-compatible `SKILL.md` folders** (YAML frontmatter + instructions) that any OpenClaw-compatible agent can install with one command. "OpenClaw gave AI agents hands; Mantle gave them a home" (Emily Bao). Byreal Agent Skills is published as an OpenClaw skill. Docs: `docs.openclaw.ai`.

**How to build on top:** Package your city actions ("build company," "level up," "claim district") as OpenClaw skills, and use Byreal Agent Skills as the DeFi execution layer for the trading/yield portion. This makes your agents native citizens of the Byreal/OpenClaw ecosystem the sponsors care about.

### 5. Mantle blockchain tech stack & tooling

**Networks:**
| | Chain ID | RPC | Explorer | Gas token |
|---|---|---|---|---|
| **Mantle mainnet** | **5000** (0x1388) | `https://rpc.mantle.xyz` | `https://explorer.mantle.xyz` | MNT |
| **Mantle Sepolia testnet** | **5003** | `https://rpc.sepolia.mantle.xyz` | `https://explorer.sepolia.mantle.xyz` | MNT (test) |

(There is an older "Mantle Testnet" at chain ID 5001 / `rpc.testnet.mantle.xyz` — **do not use it; build on Sepolia 5003.**) Testnet MNT faucets: Chainlink (`faucets.chain.link/mantle-sepolia`) and QuickNode (`faucet.quicknode.com/mantle`).

**Architecture:** EVM-equivalent Ethereum L2 (OP-Stack lineage, originally modular data availability via EigenDA). Per Messari, Mantle announced a strategic migration on **January 22, 2026** to use **Ethereum blobs as its primary DA layer, moving toward a full ZK-rollup architecture**, leveraging Ethereum's Fusaka upgrade (activated Dec 2025). ~2-second blocks, sub-$0.01 transfers, hundreds of TPS. Full Solidity tooling: **Remix, Hardhat, Foundry**. Mantle's own tutorials deploy ERC-721s with Hardhat + OpenZeppelin + ethers.js (`npx hardhat run scripts/deploy.js --network mantle-...`).

**Account abstraction:** Mantle supports **ERC-4337 (and 7702-style) gas-sponsored transactions, embedded wallets, and session keys** (per thirdweb's Mantle pages). This is the foundation for agentic wallets — crucial because the rubric explicitly rewards "AA/gasless integration" under UX.

**DeFi protocols agents interact with:**
- **Merchant Moe** — cornerstone AMM DEX (Trader Joe team), Liquidity Book + classic pools, MOE/veMOE governance.
- **Agni Finance** — Uniswap V3-fork concentrated-liquidity DEX. Per Messari's State of Mantle Q3 2025, "AGNI and Merchant Moe accounted for 66.2% of Mantle's DeFi TVL in Q3, holding $87.9 million (36.1% share) and $73.3 million (30.1%), respectively" — AGNI grew 129.9% QoQ to overtake Merchant Moe — of a total $242.3M DeFi TVL.
- **Fluxion** — DEX named in the ClawHack DeFi set.
- **RWA / yield assets:** **mETH** (Mantle liquid-staked ETH) and **cmETH** (restaked) — per Messari, as of late 2025 mETH held **$791.7M in ETH** and cmETH **$277M**, a combined **~$1.07B** in underlying assets; **fBTC/FBTC** (1:1 omnichain Bitcoin, TSS custody); **USDY** (Ondo's tokenized US-Treasury yield note, which "reached ~$29M tokenized on Mantle" via Mantle's Tokenization-as-a-Service platform, per Messari); **USDe** (Ethena synthetic dollar, uses mETH as collateral). These are exactly the assets the AI × RWA track names.

### 6. AI agent architecture for on-chain actions

**Framework options (all EVM/Mantle-compatible):**
- **Coinbase AgentKit (CDP):** framework- and wallet-agnostic; Python and TypeScript; `CdpEvmWalletProvider` (or Privy/viem providers), 30–50+ prebuilt action providers, LangChain/Vercel AI SDK/MCP extensions, **Smart Wallet for gasless tx**, built-in faucet. Custom actions via the `@create_action` decorator. Strong default choice for the wallet + action layer.
- **GOAT SDK (`@goat-sdk`, MIT, Crossmint-sponsored):** lightweight, 200+ onchain tools/plugins (erc20, uniswap, etc.), works with a viem wallet client on any EVM chain, and plugs into LangChain, Vercel AI SDK, and ElizaOS. Easiest way to give an LLM agent typed onchain tools.
- **ElizaOS (`@elizaos/core`):** TypeScript "agent OS" — runtime agent loop, character files, actions/providers/evaluators, memory; `@elizaos/plugin-evm` and `@elizaos/plugin-goat` give it onchain hands. Good if you want persistent personalities per agent (great for the "city of characters" narrative).
- **Virtuals GAME SDK:** Goal-Action-Mind-Engine cognitive framework + Agent Commerce Protocol; a Virtuals judge is on the panel, so an ACP/GAME nod is strategically smart, though heavier to adopt.

**Recommended architecture — a "Strategy Engine" with a single interface:**
```
interface StrategyEngine {
  decide(ctx: MarketContext & AgentState): AgentDecision  // {action, protocol, params, rationale}
}
```
- **RuleBasedStrategy** implements `decide()` as a deterministic policy from a user-supplied config (e.g., "if mETH/USDC APR > X and drawdown < Y → LP; rebalance when out of range"). No LLM in the loop → cheap, safe, auditable.
- **LLMStrategy** implements the same `decide()` by prompting an LLM (using the Elfa/Surf/Orbit credits) with market context + the agent's persona/goal, constrained to emit a tool call from a fixed schema (Byreal Skills / GOAT tools).
- A **GuardrailLayer** wraps both: hard caps on position size, allowlisted protocols/tokens, slippage limits, max tx/hour, and a simulation/dry-run (Byreal `--dry-run`) before any signed tx. Every `decide()` output is logged as an `AgentDecision` event regardless of source — this *is* the on-chain benchmark.

**Key management:** never hold raw user keys for autonomous trading. Use **ERC-4337 smart-contract wallets with session keys** scoped to (a) specific protocols, (b) spend limits, and (c) expiry — so an agent's signer can only do city/DeFi actions within bounds, mirroring how RealClaw uses Privy non-custodial wallets + confirmation flows. For the hackathon demo, agent EOAs funded with small testnet amounts + a guardrail contract is acceptable; smart-wallet session keys are the mainnet story.

### 7. Smart contract design for the city

Minimal contract set (Solidity, deploy with Hardhat/Foundry on Sepolia 5003):
- **`AgentRegistry`** — wraps/extends the ERC-8004 **Identity Registry** (ERC-721). Mints each agent's identity NFT; stores strategy type flag (RULE/LLM) and city building seed.
- **`CityState`** — the source of truth the indexer reads. Tracks per-agent: level, building height/footprint, "companies" (strategies), district/plot assignment, cumulative realized P&L. Exposes `recordDecision(...)` and `recordOutcome(...)` that **emit events** (e.g., `AgentDecision(agentId, action, protocol, params, ts)`, `BuildingGrew(agentId, newLevel)`, `CompanyBuilt(agentId, districtId)`).
- **`Treasury`/`Vault`** — per-agent capital accounting; or, for safety, agents trade from their own AA wallets and the vault only tracks attributed P&L.
- **Reputation hook** — a trusted "CityReferee" that calls ERC-8004 `giveFeedback` to translate verified outcomes into portable reputation.

**Gas-cost / "record every decision" design — events over storage.** Solidity events (logs) cost ~8 gas/byte of data and are *not* in contract storage, so they are dramatically cheaper than `SSTORE` (~20,000 gas for a new non-zero slot). The pattern: **store only the minimal mutable city state on-chain (level, plot, cumulative P&L) and emit rich `AgentDecision`/`Outcome` events for everything else.** Your indexer reconstructs full history from logs; the chain keeps an immutable, queryable benchmark trail at minimal cost — perfectly aligned with Mantle's sub-cent fees and the "permanent decentralised record" framing. For very high-frequency agents, batch multiple decisions into one tx (AA batching) and/or post a Merkle root of a decision batch with the batch detail on the event/IPFS.

**P&L → city growth mapping (on-chain):** when `recordOutcome` posts realized profit for an agent, `CityState` increments height by `f(profit)` (e.g., log-scaled to keep the skyline readable), adds a "company" when a new strategy crosses a threshold, and promotes the agent's level — all as events the renderer animates.

### 8. End-to-end build plan — testnet first, then mainnet

**Phase A — Testnet MVP (the demo you actually submit):**
1. **Day 1–2 — Chain & contracts.** Hardhat/Foundry project; add Mantle Sepolia (5003) to config; fund from faucet. Deploy ERC-8004 reference registries (or fork `erc-8004/erc-8004-contracts`/`nuwa-8004`) + your `CityState`/`AgentRegistry`. Verify on `explorer.sepolia.mantle.xyz`.
2. **Day 3–5 — Agent layer.** Stand up the Strategy Engine with both RuleBased and LLM strategies; wire DeFi execution via GOAT SDK / AgentKit and Byreal Agent Skills (use testnet pools or mock adapters where testnet liquidity is thin). Each agent mints an ERC-8004 identity and emits `AgentDecision` events through `CityState`.
3. **Day 6–8 — Indexer + data layer.** Build the Mantle event indexer (Node listener or subgraph) that fills the Supabase schema the front-end reads. This replaces git-city's GitHub ingestion.
4. **Day 8–11 — Visualization.** Fork git-city; point the city at your indexer; remap height/width/glow to P&L/strategies/reputation; relabel achievements; add a "decision feed" overlay and a per-building inspector showing the agent's last on-chain decisions + ERC-8004 reputation + Mantle explorer links.
5. **Day 11–13 — The "Human vs. AI" + transparency layer.** A control panel to spawn rule-based agents (user-defined config) alongside LLM agents; a live leaderboard; a "watch mode" that streams decisions in real time (this is your livestream-ready feature).
6. **Day 13–15 — Polish & submission.** AA/gasless onboarding so a judge can spawn an agent with no MNT; record the demo video; write the #MantleAIHackathon X thread (pitch + video + GitHub + contract address); deploy a public instance (Vercel) for the Finalist/Deployment prize.

**Phase B — Mainnet (roadmap, not hackathon-critical):** swap RPC/chain to 5000; integrate live Merchant Moe/Agni/USDY/mETH; replace agent EOAs with audited ERC-4337 smart wallets + session keys + spend caps; add circuit breakers and a kill switch; commission a security review before any real capital. Demo *capability* on testnet; reserve mainnet for a tiny, capped showcase wallet if at all.

### 9. Technical risks & mitigations

- **Key management for autonomous agents** → ERC-4337 smart wallets with scoped **session keys**, spend limits, protocol allowlists, expiry; never expose raw user keys; mirror RealClaw's Privy non-custodial + confirmation-flow model.
- **Smart-contract security** → use audited OpenZeppelin bases and the security-hardened `nuwa-8004` ERC-8004 impl (ReentrancyGuard); keep `CityState` logic minimal; testnet-only funds for the demo.
- **LLM hallucination / bad trades** → the GuardrailLayer: schema-constrained tool outputs, dry-run/simulation before signing, hard position/slippage caps, and a deterministic rule-based fallback. Show this explicitly — it scores on Part B "Strategy design & risk management."
- **Gas of frequent writes** → events-not-storage, AA batching, optional Merkle-root batching; Mantle's sub-cent fees make per-decision logging viable.
- **Oracle/price data** → use DEX pool prices (Byreal/Agni) plus a sanity oracle; reject trades when price sources diverge beyond a threshold.
- **Demo reliability** → seed a deterministic "demo mode" with pre-funded agents and a scripted market scenario so the livestream can't be derailed by testnet flakiness; cache the indexer.
- **Transparency/livestream feature** → the real-time decision feed + per-building explorer links + the immutable event log *is* the transparency story; make it the centerpiece of the Demo Day presentation.

### 10. Differentiation & winning strategy

**The narrative:** *"AgentPolis — a verifiable on-chain civilization built by autonomous agents."* Every building is an ERC-8004 citizen; every floor was earned by a recorded, auditable DeFi decision on Mantle; humans and LLMs compete to grow the same skyline. This is the most literal possible embodiment of Mantle's own thesis ("not just humans trading assets, but autonomous agents creating verifiable, on-chain value") and its three defining features.

**Why it resonates with *this* panel:** ERC-8004 reputation (the whole panel cares), on-chain benchmarking/transparency (Allora, Nansen, BGA), agentic economy (Byreal, Virtuals), consumer virality + gamification (Animoca, DoraHacks), and RWA yield (Mantle, Ondo/Ethena assets). One project touches every judge's mandate.

**Concrete differentiators to build:**
1. **Dual-mode agents in one arena** — rule-based vs LLM, same interface, same skyline → directly dramatizes "Human vs. AI."
2. **The skyline IS the benchmark** — height/level = verifiable cumulative P&L; clicking a building shows the on-chain decision trail + Mantle explorer links + ERC-8004 reputation.
3. **Radical transparency by construction** — a livestream "watch mode" of agents acting in real time, backed by immutable event logs.
4. **Frictionless onboarding** — AA/gasless spawn-an-agent so any viewer (or judge) becomes a city founder in one click (targets the Best UI/UX prize and the UX rubric line).
5. **Shareable artifacts** — reuse git-city's share-card/compare features for "my agent's building" posts to farm the $17K community-voting (X engagement) prize.

---

## Recommendations

**Stage 0 (now → first 48h): de-risk the critical path.** Fork `srizzon/git-city`, get it running locally, and stub the data layer behind an interface so the renderer reads from *your* schema, not GitHub. In parallel, deploy a "hello world" `CityState` contract on Mantle Sepolia (5003) and confirm your indexer can turn its events into a building. If both work, the project is feasible; if the indexer↔renderer seam is shaky, fix it before anything else — it's the riskiest joint.

**Stage 1: vertical slice.** One rule-based agent → mints ERC-8004 identity → does one testnet swap → emits `AgentDecision` → a building grows in the city. Ship this end-to-end before adding breadth. This single loop is 80% of the demo's persuasive power.

**Stage 2: breadth.** Add the LLM strategy, guardrails, the spawn-an-agent UI, the live decision feed, AA/gasless onboarding, and Byreal Skills integration.

**Stage 3: polish & submit.** Public Vercel deployment, demo video, and the #MantleAIHackathon X thread (pitch + video + GitHub + Mantle contract address) before **June 15, 2026 15:59**. Prep a deterministic "demo mode" for the July 2–3 livestream.

**Track choice:** submit to **Consumer & Viral DApps**; explicitly call out Agentic Economy (Byreal Skills) and AI × RWA (mETH/USDY) integrations in the write-up to make Grand Champion judges see cross-track value.

**Thresholds that change the plan:**
- *If testnet DeFi liquidity is unusable* → ship clean mock protocol adapters with the same interface and label them "testnet simulation"; the rubric accepts "meaningful simulation." Do **not** burn time fighting thin testnet pools.
- *If the LLM agent is unreliable by Stage 2* → demo rule-based as the hero and present LLM mode as live-but-guardrailed; never let a hallucinating agent headline the livestream.
- *If you have spare time after Stage 3* → add a tiny capped mainnet showcase wallet for one real on-chain build, purely for the "production-ready" scoring band — only with strict spend limits.

---

## Caveats

- **Phase I (ClawHack) is closed** (ended Apr 30, 2026); this plan targets **Phase II / AI Awakening**, deadline **June 15, 2026**, Demo Day **July 2–3**, results **July 10** — all of which are upcoming as of the May 30, 2026 research date and subject to change ("All timelines subject to change," per Mantle).
- **ERC-8004's Validation Registry is still under active spec revision**; pin to a specific reference-implementation commit (`erc-8004/erc-8004-contracts` or `nuwa-8004`) and expect interface churn.
- **Byreal/RealClaw originated on Solana** and RealClaw mainnet access is whitelist-gated; the Mantle/EVM execution path you rely on is the open-source **Byreal Agent Skills CLI** plus standard EVM frameworks (AgentKit/GOAT) — verify current Mantle support before committing to RealClaw's hosted product specifically.
- **The detailed Part B rubric cited verbatim is the AI Trading & Strategy (BGA) tab** of the official sheet; other tracks have their own sponsor Part B that wasn't visible in the fetched content. Part A (50 pts) is confirmed universal. Confirm your chosen track's Part B before finalizing.
- **AGPL-3.0**: your git-city fork's public deployment must open-source its modifications — plan for that (it's also a transparency selling point).
- **Ecosystem figures are point-in-time and moving:** the $242.3M Q3 2025 DeFi TVL had grown to $332.7M by end-Q4 2025 (a 37.3% QoQ increase, driven by treasury deployment into MI4, per Messari's State of Mantle Q4 2025). Treat all TVL/asset sizes as order-of-magnitude context, not live numbers.