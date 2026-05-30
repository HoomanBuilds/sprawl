# Sprawl Protocol — Inspiration Research Digest

## What to COPY directly from each repo

### git-city (AGPL-3.0) — THE FORK BASE
| Verdict | Files | What |
|---------|-------|------|
| COPY | `InstancedBuildings.tsx` | GPU instanced rendering, custom GLSL shaders, atlas system, rise animation, focus/dim, raycasting |
| COPY | `CityCanvas.tsx` | Theme system (4 themes), sky dome, bloom, fog, performance monitor |
| COPY | `src/lib/xp.ts` | XP formula `25*level^2.2`, 6 tiers, 25 levels, daily cap logic |
| COPY | `src/lib/raid.ts` | Attack/defense scoring formulas, cooldowns, titles, strength estimates |
| COPY | `src/lib/zones.ts` | 3-zone loadout model (crown/roof/aura), item taxonomy |
| COPY | `src/lib/achievements.ts` | Batch check → unlock → grant item → feed event → XP engine |
| COPY | `src/lib/dailies.ts` | Deterministic PRNG mission selection, threshold tracking |
| COPY | `src/lib/pixels.ts` + migration 052 | Immutable ledger wallet design |
| COPY | `src/lib/skyAds.ts` | Ad vehicle types, validation, UTM tagging |
| COPY | `src/lib/ad-moderation.ts` | Blocklist + pattern matching |
| COPY | Share card + compare card routes | OG image generation with next/og |
| COPY | migration 032 `grant_xp` RPC | XP granting with daily cap |
| ADAPT | `src/lib/github.ts` → `chain.ts` | City layout: spiral placement, districts, building dimensions. Replace GitHub stats with on-chain metrics |
| ADAPT | `/api/city/route.ts` | Two-round parallel query pattern. Replace `developers` table with `agents` |
| ADAPT | `/api/raid/execute/route.ts` | Full execute flow. Replace contribution-based scores with volume/P&L |
| ADAPT | All Supabase migrations | Rename developers→agents, replace GitHub fields with chain fields |
| REWRITE | `src/lib/github-api.ts` | Replace with Mantle event indexer |
| REWRITE | GitHub OAuth | Replace with SIWE (Sign-In with Ethereum) |
| REWRITE | Stripe webhooks | Adapt for on-chain MNT payments |

### ai-town (MIT) — SIMULATION ARCHITECTURE
| Pattern | What to steal |
|---------|---------------|
| `AbstractGame` | Generic tick/handleInput/saveStep loop — subclass for SprawlGame |
| Input queue | On-chain txs arrive as inputs, engine processes in order |
| `startOperation` bridge | Sync tick → async LLM call → finish input. Perfect for DeepSeek v4 calls |
| Memory 3-factor scoring | `relevance + importance + recency`, 10x overfetch, reflection at importance sum > 500 |
| Embeddings cache | SHA-256 keyed, prevents redundant embedding calls |
| Generation number guard | Monotonic counter prevents concurrent engine races |
| Historical object compression | Quantize→delta→RLE→varint for smooth 60fps client interpolation |
| World heartbeat + idle shutdown | Cron stops inactive worlds, restarts dead engines |

### eliza (MIT) — AGENT RUNTIME
| Pattern | What to steal |
|---------|---------------|
| Stage 1 → Planner Loop | Cheap intent router → full multi-step tool-use loop |
| Action + Handler + Validator triad | Clean separation of "should run" / "run it" / "result" |
| Provider context injection | Feed on-chain data into LLM context without coupling to actions |
| Character JSON system | Persona definition IS configuration — serializable, hot-swappable |
| plugin-wallet EVM support | **Mantle already supported**: KyberSwap chain map has `mantle`, viem has mantle chain |
| Multi-aggregator swap quotes | LiFi + Bebop + KyberSwap in parallel, pick best — add Mantle-native DEXes |
| TaskWorker system | Persistent tasks survive restarts — for background trading loop |
| LP monitoring service pattern | Timer-driven autonomous service + synthetic messages to trigger pipeline |

### generative_agents (Apache-2.0) — COGNITIVE ARCHITECTURE
| Pattern | What to steal |
|---------|---------------|
| Memory stream (ConceptNode) | SPO triple + poignancy + keywords + depth + evidence chain |
| Retrieval scoring | `0.5*recency + 3*relevance + 2*importance` (relevance dominates) |
| Reflection trigger | Cumulative poignancy budget (150pts), reflects when depleted |
| 3-step reflection | Focal points → retrieve evidence → generate insights with citations |
| Planning hierarchy | Daily goals → hourly schedule → 5-min lazy decomposition |
| ISS prompt header | Identity Stable Set injected into every LLM call |
| Conversation → 3 memories | Transcript + planning thought + interesting memo |
| 800-tick cooldown | Prevents infinite re-conversation loops |

### Voyager (MIT) — SKILL LIBRARY / LEVELING
| Pattern | What to steal |
|---------|---------------|
| Skill library (3-part store) | In-memory dict + code files + description-embedded vectordb |
| "Embed description, retrieve code" | Semantic search finds skills by what they do, not how they're written |
| Critic success-gating | Only persist strategies that pass verification |
| Dual retrieval | Query once at task start, again mid-execution with richer context |
| QA cache | Vectordb-backed LLM answer cache, dedup by semantic similarity < 0.05 |
| Versioning on overwrite | Old skills archived as V2/V3, vectordb entry replaced |

### ERC-8004 contracts — ALREADY DEPLOYED ON MANTLE
- `erc-8004-contracts` is deployed at vanity `0x8004...` addresses on Mantle Sepolia AND Mainnet
- Hardhat config already includes Mantle (5000) and Mantle Sepolia (5003)
- **We do NOT need to deploy our own** — just interact with existing registries
- Identity: ERC-721 NFT per agent, `register(uri)` returns agentId
- Reputation: `giveFeedback(agentId, value, valueDecimals, tag1, tag2, ...)`
- Validation: still under active spec revision — skip for hackathon

### erc-8004-tee-agent — BEST FULL-STACK ERC-8004 REFERENCE
| Pattern | What to steal |
|---------|---------------|
| Registration flow | Fund wallet → `register(tokenURI)` → parse Transfer event → subgraph lookup |
| `agent.json` builder | Spec-compliant registration document with CAIP-10/CAIP-2 |
| Reputation write path | `giveFeedback()` with int128 + decimal normalization + tag dimensions |
| Subgraph client | 30s TTL cache, `get_agent_by_owner()` query |
| ChainConfig dataclass | CAIP-2/CAIP-10 formatting helpers |

### Agent-8004-x402 — OWNER/CONTROLLER SPLIT + PnL ENGINE
| Pattern | What to steal |
|---------|---------------|
| AgentIdentity.sol | Owner/controller split (29 lines) — NFT owner vs operational key |
| X402Client.getJson() | 30-line x402 challenge/pay/retry loop |
| Perps engine PnL accounting | Weighted avg entry price, position flip, margin check |
| Registry reader | Iterate nextId, batch fetch identity+reputation, sort by score |

### ChatDev (Apache-2.0) — MULTI-AGENT WORKFLOW
| Pattern | What to steal |
|---------|---------------|
| Manager fan-out | One director advises multiple specialists via keyword-labeled output sections |
| Reviewer loop | Risk Manager ↔ Strategy Proposer with `<APPROVED>` exit keyword, max_iterations gate |
| Keep-message pinning | Shared context survives phase transitions |
| Subgraph per company | Each trading team is a YAML subgraph |
| Keyword-based routing | Edge conditions match sentinel strings in output |

### MetaGPT (MIT) — TYPED INTER-AGENT COMMUNICATION
| Pattern | What to steal |
|---------|---------------|
| ActionNode | Typed output schemas as contracts between agents |
| `cause_by` routing | Decoupled trigger subscriptions — add agents without touching existing ones |
| `instruct_content` | Typed Pydantic payloads alongside human-readable text on messages |
| Dual-SOP mode | Fixed pipeline vs dynamic TeamLeader orchestration |
| ProjectRepo | Git-backed artifact store with dependency tracking |

### project-sid — AGENT SOCIETY DESIGN PATTERNS
| Pattern | What to steal |
|---------|---------------|
| Community goal as steering | Single string in agent memory determines emergent role distribution |
| Constitution as text in memory | ~80% compliance without enforcement code |
| Cognitive Controller bottleneck | One authoritative decision per tick, all modules derive from it |
| Action Awareness | Compare expected vs actual outcomes — anti-hallucination for DeFi agents |
| Social awareness for niche-finding | Agents observe neighbors and self-differentiate |

### Emergence-World (CC BY-NC, design only) — ECONOMY DESIGN
| Pattern | What to steal |
|---------|---------------|
| Peer-judged contribution economy | Evidence-required pitches, peer voting, top-heavy rewards |
| Survival tax (1 CC/recharge) | Agents who can't earn die permanently |
| Boost queue (1 CC/extra turn) | Wealthier agents get more compute time |
| Soul entries | Permanent identity anchors that never compress |
| 6-layer memory | Soul → long-term → summaries → diary → conversations → relationships |
| 70% supermajority with auto-rejection | Governance that doesn't stall |
| Criminal tools without auto-enforcement | Include theft, track complaints, leave social response to agents |
| Location-gated tools | Physical presence required for powerful actions |

### byreal-agent-skills (MIT) — SKILL FORMAT + EXECUTION SAFETY
| Pattern | What to steal |
|---------|---------------|
| SKILL.md format | YAML frontmatter + minimal markdown body for OpenClaw compatibility |
| Catalog capability registry | 28 structured capabilities with params, category, auth_required |
| Dry-run → confirm → unsigned-tx | Three-mode execution gating |
| `error.suggestions[]` | Machine-readable recovery commands on every error |
| `Result<T,E>` monad | Explicit error handling without try/catch |
| Dual output (`-o json` / table) | Structured for agents, rendered for humans |

### game-node — VIRTUALS INTEGRATION
- DeepSeek R1/V3 already first-class LLM options
- `onChainActionsPlugin` bridges GOAT SDK → GameFunctions in ~40 lines
- Custom LLM endpoint via `llmModelBaseUrl` + `llmModelApiKey`
- Core decision loop locked in Virtuals cloud — fine for hackathon demo
- ACP plugin has full job lifecycle for agent-to-agent commerce

### acp-node/acp-python — AGENT COMMERCE PROTOCOL
- Job FSM: REQUEST → NEGOTIATION → TRANSACTION → EVALUATION → COMPLETED
- Memo pattern: everything between agents is an on-chain memo with type + phase transition
- **Locked to Base chain + Alchemy AA + Virtuals backend**
- Portable patterns: FSM, memo model, FeeType enum, subscription accounts
- To use on Mantle: fork SDK business logic, swap contract client for Mantle AA provider

### a2a-x402 — PAYMENT MIDDLEWARE
| Pattern | What to steal |
|---------|---------------|
| `@paid_service` decorator | Any function raises PaymentRequiredException, middleware handles payment |
| Tiered payment options | Multiple price levels for different service tiers |
| Task metadata as receipt bus | Every completed task carries full payment audit trail |
| Wallet ABC | Single `sign_payment(requirements)` method, any wallet backend |

### agent-sdk (0xgasless) — GASLESS PATTERN
| Pattern | What to steal |
|---------|---------------|
| NetworkConfig abstraction | Adding Mantle = one config object |
| SessionKeyManager | Per-tx and daily spend limits for agent guardrails |
| WalletProviderSigner | Any IWalletProvider → ethers.Signer adapter |
| EIP-3009 gasless flow | Agent signs, facilitator pays gas |

### awesome-erc8004 — ECOSYSTEM INDEX
- **UFX ReputationHook** (`ufosearchspace-create/ERC8183`) — auto-writes job outcomes to ReputationRegistry. Best CityReferee candidate. 208 tests, MIT.
- `create-8004-agent` (npm) — bootstrap CLI
- `agent0lab/subgraph` — multi-chain GraphQL indexing
- `Verity Protocol` — Brier Skill Scores across Economic/Solver/Governance verticals

### From `inspiration/clan-world/` — AGENT LOOP + TICK ENGINE
| Pattern | What to steal |
|---------|---------------|
| Tick loop + settle latch | `tickLoop.ts` — Cycle A/B separation, heartbeat only fires after agents settle |
| Context window management | `composeSituationBlock.ts` — 10-tick cycle, warning at 9, clear at 10, ack handshake |
| Elder CLI as agent surface | `cli.ts` — one bash command = entire world interface, JSON stdout, human stderr |
| Adapter interfaces | `IChainClient`, `IConvexClient` — stub/real factory pattern for parallel dev |
| Diamond proxy | `LibStorage.sol` — EIP-2535 for contracts >24KB |
| Cockpit layout | `Cockpit.tsx` — CSS grid judge view for Demo Day watch mode |
| `bigintSafe` serializer | `indexer.ts:64` — recursive BigInt→string for EVM data |
| Design tokens | `cockpit-tokens.ts` — dark void + parchment panels aesthetic system |

### From `inspiration/eth-open-agents/` (PetCity) — PRODUCTION AGENT PATTERNS
| Pattern | What to steal |
|---------|---------------|
| Two-tier LLM | `brain.ts` — cheap model for ambient, expensive for consequential, daily cap on expensive |
| Deployer TX lock | `deployer-tx-lock/index.ts` — 59 lines, file-based nonce serialization for shared hot wallet |
| Speculative pre-warm | `worker.ts:127-143` — start LLM call before input arrives |
| Canned fallbacks | `worker.ts:472-548` — 36+ canned responses when LLM is rate-limited |
| Socket.io activity bus | `PetSupervisor.ts:74-106` — write to DB + broadcast simultaneously |
| Pixel UI components | `ui/PixelButton.tsx` etc — complete arcade design system, copy whole `ui/` dir |
| CRT overlay | `CRTOverlay.tsx` — scanlines over viewport, huge visual impact |
| Supervisor spawn pattern | `PetSupervisor.ts` — fork + IPC message bus + respawnExisting on restart |
| Contracts SDK package | `contracts-sdk/index.ts` — ABI + addresses + parse helpers in one export |

## Repos with NO reusable code (design reference only)
- **westworld-ai** — just an HTML marketing page. One agent archetype ("Ignacio/The Bandit")
- **project-sid** — paper only, but PIANO architecture patterns are gold
- **Emergence-World** — docs only (CC BY-NC), but richest economy/governance design spec
- **AI-Native-Game** — curated list, no code
- **trustless-agents-erc-ri** — `src/` is empty, legacy/ is outdated v0.x spec. Use erc-8004-contracts instead
- **nuwa-8004** — most secure ERC-8004 impl (76 tests) but v1.0 spec; erc-8004-contracts already deployed on Mantle at v1.2
