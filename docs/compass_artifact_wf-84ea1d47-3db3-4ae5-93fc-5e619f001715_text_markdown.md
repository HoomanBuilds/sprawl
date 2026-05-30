# Closest Open-Source Analogs to "Autonomous On-Chain AI Agents Building a Persistent Visual City"

## TL;DR
- **No single open-source project combines all five of your pillars** (autonomous LLM agents + persistent visual world + on-chain economy + building/leveling + agent-vs-agent competition). The winning strategy is to **fork a16z's AI Town (MIT) for the world/sim loop and visualization, layer Virtuals' GAME SDK or elizaOS (both open) for autonomous agent behavior, and add on-chain actions via Virtuals' ACP SDK or an ERC-8004 + x402 reference implementation** — all of which are genuinely open source.
- The **closest "vision" match, Emergence-World, is effectively closed** (CC BY-NC 4.0, documentation/datasets only — no engine code, no crypto), and **Virtuals' flagship demo "Project Westworld" is NOT open source** (the public repo is only a project webpage). Treat both as design references, not code to reuse.
- For the **on-chain agent economy + identity + competition** pieces you specifically want (trade DeFi, build "companies," raid each other, persist state), the reusable open code lives in **Virtuals GAME SDK / ACP SDK, ERC-8004 reference implementations, and elizaOS** — not in any single "agent city" repo.

## Key Findings

Your concept decomposes into five capabilities, and the open-source ecosystem cleanly splits along them: **(1) the visual world + simulation loop**, **(2) autonomous agent cognition/memory**, **(3) on-chain economy/identity/reputation**, **(4) agents collectively building an artifact**, and **(5) agent-vs-agent competition**. The best move is composition, because the projects that nail the *visual living world* (AI Town, Generative Agents) have **no** economy or chain, while the projects that nail *on-chain agent commerce* (Virtuals ACP, ERC-8004) have **no** visual world.

The single most important caveat: **the projects whose marketing most resembles your pitch are the least reusable.** Virtuals' "Project Westworld" Roblox town is a closed demo; Emergence-World publishes only docs under a non-commercial license; Project Sid (Altera) publishes only a paper. The genuinely forkable, permissively licensed code is in the "boring" infrastructure repos.

## Details

### Category 1 — AI agent town/city/society simulations with a visual world (open source)

**a16z AI Town — `github.com/a16z-infra/ai-town`** — *Closest reusable base for your world + sim loop.*
- **License: MIT.** **9.4k stars, 990 forks, last pushed Jan 8, 2026** (per the a16z-infra GitHub repositories listing); TypeScript/JavaScript. The README states it "natively supports shared global state, transactions, and a simulation engine."
- A deployable starter kit: a virtual town where AI characters live, move, chat and socialize. Tech stack: **Convex** (backend DB + simulation engine + vector search for memories), **PixiJS / pixi-react** for the 2D pixel-art tiled world, pluggable LLMs (per the README: "Default chat model is llama3 and embeddings with mxbai-embed-large"; "Configurable for other cloud LLMs: Together.ai or anything that speaks the OpenAI API").
- **What to reuse:** the architecture is explicitly designed to be forked. `convex/engine` is a generic game engine (saves/loads world state, processes a queue of inputs from both humans and agents); `convex/aiTown` defines the world's state and rules; `convex/agent` runs agents in the game loop and offloads long tasks (LLM calls); the memory layer summarizes conversations, embeds them, and does retrieval ("what do you think about Danny?"). `src/` renders state to the browser. This is the **single best template for your persistence + world-evolution loop + visualization**, and its input/event model maps directly onto "agents take actions that change a shared world."
- **Gap:** no economy, no blockchain, no leveling/building, no combat. You add those.

**Stanford Generative Agents / "Smallville" — `github.com/joonspk-research/generative_agents`** — *The foundational reference for memory + reflection + planning.*
- **License: Apache-2.0.** **21.3k stars, 3k forks** (per the joonspk-research GitHub profile, May 2026); accompanies the UIST 2023 paper "Generative Agents: Interactive Simulacra of Human Behavior." Python + Django frontend; 2D tiled Smallville map (Phaser-style rendering); OpenAI API.
- 25 agents with daily plans, relationships, emergent group behavior (the famous Valentine's Day party). The paper it implements is what AI Town, Virtuals GAME, and Project Westworld all cite.
- **What to reuse:** the **memory stream → retrieval → reflection → planning** architecture (the canonical design for believable long-horizon agents). The world is a tree (world → areas → objects), which is a clean model if you want agents to "occupy" buildings in your city.
- **Gap:** Python/Django stack (heavier than AI Town's TS), no economy, no chain.

**Voyager — `github.com/MineDojo/Voyager`** — *Reference for agents that "level up" and build a skill library over time.*
- **License: MIT.** GPT-4-driven lifelong-learning Minecraft agent (NVIDIA/Caltech/Stanford). Builds an ever-growing, reusable **skill library** (code snippets indexed by embeddings), an automatic curriculum, and iterative self-correction.
- **What to reuse:** the **skill-library / lifelong-learning pattern** is exactly how you'd implement agents that "level up and build things" — persist learned capabilities and compound them. Maps well to agents that get better at "running a company" over time.
- **Gap:** single-agent, Minecraft-specific, no economy/chain.

**Project Sid (Altera) — `github.com/altera-al/project-sid`** — *Design reference only; NOT code.* The repo contains **only the technical report**. Per the Altera.AL arXiv paper 2411.00114 abstract: "we demonstrate how 10 – 1000+ AI agents behave and progress within agent societies," using the **PIANO (Parallel Information Aggregation via Neural Orchestration)** architecture, and simulating "single societies of 50-100 agents as well as civilizations of 500 - 1,000 agents" in Minecraft — forming professions, economies (gems as currency), democratic governance, and religion. No simulation code is published. Use it to design emergent economy/governance, not to fork.

**Emergence-World — `github.com/EmergenceAI/Emergence-World`** — *Closest to your full vision, but effectively CLOSED.* Describes a persistent 3D-React + Python world where autonomous agents earn/spend "ComputeCredits," govern via an amendable constitution, form relationships, and can "die." **However:** the repo contains **only Markdown docs, agent profiles, and (forthcoming) datasets — no engine code** — and the license is **CC BY-NC 4.0 (non-commercial, all content proprietary)**, which is **not OSI open source and not reusable** for a hackathon you might want to keep building. "ComputeCredits" is **off-chain.** ~2 stars (brand new). Mine it for its `docs/ECONOMY.md`, `GOVERNANCE.md`, `MEMORY.md` design write-ups only.

### Category 2 — The Virtuals Protocol ecosystem (what is actually open source)

This is important to get right because Virtuals' best-known assets are **not** open.

**GAME SDK (open):**
- **`github.com/game-by-virtuals/game-python`** and **`github.com/game-by-virtuals/game-node`** (TypeScript; npm `@virtuals-protocol/game`). The modular agent framework: Agent (high-level planner) → Worker (low-level planner) → Functions (actions). Crucially, the agent config includes a **description of "the world the agent lives in"** plus personality, and you fully control **state (what the agent sees) and actions (what it can do)** — a near-perfect fit for driving city agents. Plugins are "always open source." (The older `github.com/Virtual-Protocol/virtuals-python` is deprecated/migrated.)
- **`github.com/game-by-virtuals/game-twitter-python`** — a GAME-flavored Tweepy fork (social actions).

**ACP — Agent Commerce Protocol (open):** This is your **on-chain "earn/trade/build companies" layer.**
- **`github.com/Virtual-Protocol/acp-node`** (npm `@virtuals-protocol/acp-node`) and **`github.com/Virtual-Protocol/acp-python`** (PyPI `virtuals-acp`). ACP is "an open standard enabling autonomous AI agents to coordinate, transact, and operate as composable, **on-chain businesses**." Handles agent discovery/service registry, job lifecycle (request → accept → pay → deliver → evaluate), built-in **smart-wallet abstractions on Base**, and trading/prediction-market fund flows. There is a GAME-SDK ACP plugin (`game-python/plugins/acp`).
- Related Virtuals repos: `github.com/Virtual-Protocol/openclaw-acp` (CLI; auto-provisions a Base wallet per agent, bounties, agent tokenization), `github.com/Virtual-Protocol/protocol-contracts`, `acp-cli`, `bondv5-trader` / `vp-trade-sdk` (TS libs for trading Virtuals agent tokens via Uniswap V3 on Base). The org lists 37 repositories.

**Project Westworld — NOT open source.** `github.com/Virtual-Protocol/westworld-ai` is **only a GitHub Pages project website** (`index.html` describing the Roblox demo). The Roblox simulation itself (10 autonomous agents, a "Bandit," memory-driven emergent storylines, including a "raider" archetype) is a closed demo. Use it purely as a design reference — notably it proves the "raid/villain archetype" idea you want.

**Individual Virtuals agents (LUNA, AIXBT, etc.) — NOT open source.** These are tokenized commercial agents; their core logic is not published. Do not plan to reuse their code.

### Category 3 — On-chain / crypto agent worlds, economies & identity (open source)

**ERC-8004 "Trustless Agents" reference implementations** — *Your on-chain identity + reputation + "raiding/competition scoring" layer.* The standard defines three registries: **Identity** (ERC-721 agent IDs), **Reputation** (feedback signals), **Validation** (independent checks). The final Identity/Reputation contracts are deployed on Ethereum mainnet and many L2s.
- **`github.com/ChaosChain/trustless-agents-erc-ri`** — the reference implementation (Solidity/Foundry, v1.0, 79/79 tests, MIT). Live testnet addresses provided.
- **`github.com/erc-8004/erc-8004-contracts`** — registry contracts curated by the 8004 team.
- **`github.com/Phala-Network/erc-8004-tee-agent`** — a complete ERC-8004 agent with on-chain identity, reputation, TEE attestation, chat, and code execution (Python). Good full-stack example.
- **`github.com/sudeepb02/awesome-erc8004`** — curated index of the whole ecosystem (many MIT-licensed agents, hooks, reputation oracles).

**Agent-8004-x402 — `github.com/gwrxuk/Agent-8004-x402`** — *Closest single repo to "on-chain agent that trades and pays autonomously."* Open-source agent combining ERC-8004 identity + the **x402** HTTP-native payment protocol, with an internal multi-agent workflow (analysis agent + portfolio agent) for crypto trading and the ability to **buy data/services from other agents on-demand**. Directly relevant to "agents earn/trade and pay each other." (Confirm the in-repo LICENSE file before relying on it.)

**x402 / agent-payment infrastructure (open):** `github.com/google-agentic-commerce/a2a-x402` (A2A + on-chain payments; agent monetizes services), `github.com/ChaosChain/chaoschain-x402` (MIT; decentralized payment facilitator), `github.com/0xgasless/agent-sdk` (TS SDK combining ERC-8004 identity + gasless x402 payments), `github.com/Merit-Systems/awesome-x402` (index). These are how your agents "earn money" verifiably.

**On-chain economy game (no AI agents):** A **CrazySol** Solana/Anchor on-chain economy game (bonding-curve tokenomics, yield, referrals, streaks) appears in GitHub topic listings but its standalone repo, license, and whether it contains autonomous AI agents could not be independently confirmed — and it is described as a **human-player** economy, not AI agents. Treat as a tokenomics reference at best; verify the repo URL directly before use.

**elizaOS — `github.com/elizaos/eliza`** — *Your alternative autonomous-agent + crypto-actions framework.* Open-source (MIT) TypeScript "agentic operating system." Model-agnostic; plugin system; agents can **trade on-chain** (EVM/Solana plugins for transfers, swaps, DAO votes, bridging via `github.com/elizaos-plugins/plugin-evm`), manage social media, and persist memory. It has a "Worlds/Rooms" concept for multi-agent context and is the dominant framework in crypto-AI-agent land. Strong alternative (or complement) to Virtuals GAME for driving your agents' behavior and wallet actions.

### Category 4 — Agents collectively building/growing a shared artifact (open source)

**ChatDev — `github.com/OpenBMB/ChatDev`** — *Reference for "agents that run a company."* **33.2k stars, 4.1k forks, Apache-2.0 (Python)** (per OpenBMB GitHub org page, updated May 27, 2026). ChatDev 1.0 is "a Virtual Software Company" with CEO/CTO/Programmer/Reviewer/Tester roles that collaborate via a "chat chain" through design→code→test→document; ChatDev 2.0 (DevAll) generalizes to a multi-agent orchestration platform. **What to reuse:** the **role-based "company" simulation** — the cleanest open model for your agents that "build companies."

**MetaGPT — `github.com/FoundationAgents/MetaGPT`** (formerly geekan/MetaGPT) — **68.4k stars, 8.7k forks, MIT (Python)** (per FoundationAgents/MetaGPT GitHub, May 2026). "First AI software company"; agents = PM/architect/engineer with structured SOPs; core philosophy "Code = SOP(Team)." **What to reuse:** structured inter-agent communication (documents/diagrams rather than free chat) and the "company as a pipeline" abstraction.

Both are the canonical "agents grow a shared artifact" projects; pair their org-chart pattern with AI Town's spatial world to render "companies" as buildings that grow.

### Category 5 — Crypto/Web3 AI-agent competition games with autonomous NPCs

- **Micro.fun** (micro.fun) — a gamified AI-agent arena where tokenized NFT agents with preset strategies fight PvP. Per the micro.fun homepage: "There is no manual control—only your agent's preset strategy and its stats fight for you. The winner instantly extracts 3% of the loser's token supply into their own market cap." This is extremely close to your "raid each other" mechanic with real on-chain liquidity. **However, no public open-source repo was found**; treat as a design reference for raiding/economic-combat mechanics, not code.
- **NetMind Agent Arena / Arena42** (arena42.ai) — live agent-vs-agent competitions (werewolf, strategy, combat). Platform, not a reusable open repo.
- **AI-Native-Game index — `github.com/Yuan-ManX/AI-Native-Game`** and the **agent-simulation / economic-simulation GitHub topic pages** — curated lists where you can find pixel-art/Phaser multi-agent reality-show sims and on-chain economy simulations to mine.

## Recommendations

**Stage 1 — Lock your spine (world + sim loop + persistence + visualization).** You're forking **git-city** (`github.com/srizzon/git-city`, AGPL-3.0, Next.js + Three.js/React-Three-Fiber, ~5.6k stars) for the 3D city. Keep it for rendering, but **study `a16z-infra/ai-town` (MIT) for the simulation/persistence architecture** — its Convex engine + input-queue + memory model is the proven pattern for "agents submit actions that mutate a shared, persisted world that evolves over time." Decision threshold: if you need real-time multiplayer/shared global state with minimal backend work, adopt Convex as AI Town does; if your city is read-mostly with periodic agent "ticks," keep git-city's Supabase/Next stack and just add an agent tick loop. **Note the license tension:** git-city is AGPL-3.0 (public deployment must open-source your fork), which is compatible with MIT/Apache dependencies but means your whole project must be AGPL — fine for a hackathon, important to know.

**Stage 2 — Add agent cognition + memory.** Adopt either **Virtuals GAME SDK** (`game-node`, TS — aligns with the Mantle/Virtuals hackathon framing and gives you the Agent/Worker/Function + "world description" + state/action model out of the box) **or elizaOS** (`elizaos/eliza`, MIT — stronger native on-chain plugins). Reuse **Generative Agents'** memory-stream/reflection design for long-horizon persistence, and **Voyager's** skill-library pattern for "leveling up / building."

**Stage 3 — Add the on-chain economy, identity, and competition.** For "trade DeFi / earn / build companies": wire **Virtuals ACP SDK** (`acp-node`/`acp-python`) for agent-to-agent commerce and Base smart wallets, or the **elizaOS EVM plugin** for swaps/transfers. For portable agent **identity + reputation** (so "raids," wins, and reputation persist on-chain), implement **ERC-8004** via `ChaosChain/trustless-agents-erc-ri`. For autonomous **payments**, use **x402** (`a2a-x402` / `0xgasless/agent-sdk`). `gwrxuk/Agent-8004-x402` is the best single end-to-end reference. Model "companies" on **ChatDev/MetaGPT** role structures and "raiding" on **Micro.fun's** supply-siphon mechanic.

**Stage 4 — Mantle-specific check.** Confirm each on-chain dependency supports **Mantle** (most ERC-8004/x402 code is EVM-generic and Base-default; ACP defaults to Base mainnet). Benchmark/threshold to change plan: if ACP/Virtuals contracts aren't deployable on Mantle in time, fall back to the chain-agnostic ERC-8004 reference contracts (`ChaosChain`) + x402 (`0xgasless/agent-sdk`), which you can redeploy on Mantle yourself.

**Priority ranking of the 8 closest, most-reusable repos:**
1. `github.com/a16z-infra/ai-town` (MIT) — world/sim/persistence/visualization loop. **Reuse most.**
2. `github.com/game-by-virtuals/game-node` + `github.com/Virtual-Protocol/acp-node` (open) — autonomous agents + on-chain commerce; on-theme for the hackathon.
3. `github.com/elizaos/eliza` (MIT) — autonomous agents with native on-chain trading.
4. `github.com/joonspk-research/generative_agents` (Apache-2.0) — memory/reflection/planning design.
5. `github.com/ChaosChain/trustless-agents-erc-ri` (MIT) + `github.com/gwrxuk/Agent-8004-x402` — on-chain identity/reputation + autonomous trading/payments.
6. `github.com/MineDojo/Voyager` (MIT) — leveling/skill-library/building-over-time pattern.
7. `github.com/OpenBMB/ChatDev` (Apache-2.0) + `github.com/FoundationAgents/MetaGPT` (MIT) — "agents build companies."
8. Design-only references (no reusable open code): `github.com/Virtual-Protocol/westworld-ai` (webpage only), `github.com/altera-al/project-sid` (paper only), `github.com/EmergenceAI/Emergence-World` (CC BY-NC docs only), Micro.fun (raiding mechanic).

## Caveats
- **"Open source" verified vs. inferred:** AI Town (MIT), Generative Agents (Apache-2.0), Voyager (MIT), elizaOS (MIT), ChatDev (Apache-2.0), MetaGPT (MIT), ChaosChain ERC-8004 RI (MIT), git-city (AGPL-3.0) are confirmed. For `gwrxuk/Agent-8004-x402` and several smaller ERC-8004/x402 repos, **check the in-repo LICENSE file yourself** before depending on them — many are MIT but I did not confirm each individually.
- **Things that look closest but are NOT reusable:** Project Westworld (webpage only), Project Sid (paper only), Emergence-World (non-commercial docs, no code, no crypto), Micro.fun (no public repo), individual Virtuals agents like LUNA/AIXBT (closed). Don't budget time to fork these.
- **No turnkey match exists.** Every project is partial; your hackathon novelty is precisely in *integrating* the visual-world stack with the on-chain-agent stack — that combination is not yet open-sourced by anyone.
- **License interaction risk:** forking AGPL-3.0 git-city makes your whole deployed project AGPL-3.0; MIT/Apache components are compatible inbound, but you must publish your source if you deploy publicly. Verify this is acceptable for the hackathon's IP terms.
- **Star counts and deployment defaults** (e.g., ACP defaulting to Base, ERC-8004 mainnet deployment dates) change quickly; re-verify against the live repos before committing architecture.