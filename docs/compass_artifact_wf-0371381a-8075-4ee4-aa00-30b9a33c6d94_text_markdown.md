# Forking Git City for the Mantle Turing Test Hackathon 2026: Feature Teardown + Zero-Cost Deployment Plan

## TL;DR
- **Git City's three headline mechanics map cleanly onto on-chain agents:** its "war" is the **raid system** (`src/lib/raid.ts`, a PvP steal-points mechanic with cooldowns/limits); its "ads" are a **paid billboard/skyline advertising business** (the `/advertise` page + an `/admin/ads` moderation route with Stripe billing and Resend "ad-expiry" emails); and its "customization" is a **zone-based cosmetics shop** (`zones.ts`/`items.ts` with crown/roof/aura/faces zones, stored in the `developer_customizations` Supabase table and sold via Stripe). Remap GitHub data → on-chain agent data: agent P&L = raids, sponsors paying MNT = billboards, agent reputation/ERC-8004 identity = unlocked cosmetics.
- **A $0 testnet demo is realistically achievable.** Vercel Hobby (free) + Supabase free tier + a free Mantle Sepolia RPC + faucet MNT for contract deploys + free LLM tiers (Gemini/Groq/OpenRouter) + agents run locally or on GitHub Actions cron covers the entire stack at zero cash cost for a hackathon demo.
- **Real costs only appear at production/mainnet scale:** Vercel Hobby forbids commercial use and pauses at 100 GB bandwidth; Supabase free pauses after 1 week idle and caps at 500 MB; always-on indexers/agents need ~$5–7/mo (Railway/Render paid); mainnet contract deploys cost real MNT (cents to a few dollars). Apply for the hackathon's $110K credit pool (Nansen/Elfa/Surf/Orbit/AltLLM) to defray LLM/data costs.

---

## Key Findings

### Part 1 — Git City features
1. **"War" = the Raid system.** Confirmed in `CLAUDE.md`: `src/lib/raid.ts` is "Raid system (PvP, scoring, limits)." The live site shows "Burglar" and "Pickpocket" achievements, strongly implying raids let one building steal points/coins from another, subject to cooldowns and limits. It is developer-vs-developer (building-vs-building) competition, not city-vs-city war.
2. **"Ads" = a real paid advertising product.** `thegitcity.com/advertise` sells in-city 3D ad placements in tiered packages (Foundation, Skyline, Landmark) with rooftop signs, blimps, LED wraps, and planes, billed via Stripe. The `.env.example` confirms an `/admin/ads` moderation route gated by `ADMIN_GITHUB_LOGINS`, Resend-powered "ad expiry emails," and a Vercel Cron (`CRON_SECRET`) for expiry.
3. **Customization = zone-based cosmetics shop.** Items use a zone system (crown, roof, aura, faces); a loadout is stored in `developer_customizations` with `item_id = "loadout"`. New effects/items start in `zones.ts`. Items are paid (~$1–3) via Stripe, AbacatePay (BRL/PIX), and NOWPayments (crypto).
4. **Other systems:** XP leveling (`src/lib/xp.ts`, 25 levels / 6 tiers), achievements, kudos, gifting, referrals, compare mode, share cards, live activity feed, and a multiplayer "arcade" (PartyKit).

### Part 2 — Zero-cost stack
- **Frontend:** Vercel Hobby — free, 100 GB bandwidth/mo, 1M edge requests, 1M function invocations; **non-commercial only**, and projects are paused when they exceed the free tier (no overage). Best fit for Next.js 16 + R3F.
- **Database:** Supabase free — 500 MB DB, 5 GB egress, 50K MAU; **paused after 1 week of inactivity** (mitigate with a daily DB ping); limit of 2 active projects.
- **Indexer/agents hosting:** Goldsky/The Graph free hosted subgraph; or self-host on Railway ($5 trial then $5/mo), Render free (spins down after 15 min, 750 instance-hrs/mo); GitHub Actions cron (free) for periodic agents — or run locally for the demo.
- **RPC:** Free public `https://rpc.sepolia.mantle.xyz` plus free tiers from Ankr, thirdweb, Tenderly, QuickNode.
- **Contracts:** Free on Sepolia via faucet MNT (Chainlink, QuickNode 12h drip, thirdweb 0.01 MNT/day, official Mantle faucet 1,000 MNT/day). Mainnet deploys cost real but cheap MNT (fees < $0.02/tx).
- **LLM:** Google AI Studio (1,500 req/day Gemini 2.5 Flash), Groq (1,000 req/day per model), OpenRouter (free models). Enough for several agents making periodic decisions.
- **Wallets/AA:** thirdweb (free up to **10,000** monthly active wallets, then $0.02/wallet), Privy free dev tier (499 MAU free).
- **Storage:** Pinata free IPFS, Cloudflare R2 (10 GB free, zero egress), Supabase Storage (1 GB).

---

## Details

### PART 1 — Git City feature teardown and remap

**Architecture baseline.** Git City is Next.js 16 (App Router, Turbopack) + Three.js via @react-three/fiber/drei, Supabase (Postgres + Auth + Realtime + RLS), Stripe/AbacatePay/NOWPayments for payments, deployed on Vercel. Server writes use `getSupabaseAdmin()` (bypasses RLS); auth in API routes uses `createServerSupabase()`. Core game logic lives in `src/lib/` (raids, dailies, XP, items). Migrations live in `supabase/migrations/`, numbered sequentially (`001_`, `002_`, …). License is AGPL-3.0 (any public deployment must publish source). Buildings are instanced meshes with an LOD system: height = contributions, width = repos, lit windows = activity.

**Feature 1 — The Raid ("war") system.**
- *How it works today:* `src/lib/raid.ts` implements PvP scoring and limits. Based on achievement names ("Burglar," "Pickpocket") and the CLAUDE.md description, a player raids another developer's building to steal points/currency, subject to cooldowns and daily limits, with XP/achievements for successful raids. Results persist in Supabase. (Exact cooldown constants and the scoring formula could not be extracted from source — see Caveats.)
- *Remap to agents:* Use **agent trading P&L as battle power.** Each autonomous agent owns a building; periodic on-chain settlement (the agent's realized return over a window) becomes "attack"/"defense" strength. A raid = comparing two agents' P&L head-to-head; the winner's building visually dominates (grows, takes the loser's "territory"/color). Store raid results keyed to on-chain tx hashes so the leaderboard is verifiable — aligned with the hackathon's on-chain benchmarking and ERC-8004 identity theme.

**Feature 2 — The Ads / billboard system.**
- *How it works today:* A dedicated `/advertise` page sells 3D in-city advertising in tiers — **Foundation** (includes 2 rooftop signs), **Skyline** (adds blimp, LED wrap, plane), and **Landmark** (custom 3D building + social posts, custom-quoted). Buyers pay via Stripe (card/Apple Pay/Google Pay), can edit ad text/brand/link unlimited times from a dashboard, and ads render as 3D objects in the city. Marketing copy cites impression figures (e.g., ~63K/mo per rooftop sign, ~41K/mo per blimp, 200K+ combined for Skyline). `.env.example` confirms an admin moderation surface `/admin/ads`, Resend "ad expiry emails," and a Vercel Cron job for expiry.
- *Remap to agents:* **Agents or sponsors pay on-chain (MNT) to display billboards.** A smart contract escrows payment and emits an `AdPurchased(advertiser, slot, uri, expiry)` event; the indexer writes it to Supabase; the 3D scene renders the billboard. Ad images/metadata go to IPFS/R2. Expiry is enforced by block timestamp (in addition to, or instead of, the cron).

**Feature 3 — Customization (zones/items).**
- *How it works today:* Items belong to **zones** (crown, roof, aura, faces). Each cosmetic is an item definition in `zones.ts`/`items.ts`. A user's equipped set ("loadout") is stored in `developer_customizations` with `item_id = "loadout"`. Items cost ~$1–3 and are purchased through Stripe/AbacatePay/NOWPayments; the Stripe webhook (`src/app/api/webhooks/stripe/route.ts`) grants ownership. To add an effect you start in `zones.ts`. Observed shop items include Crown, Custom Color, Neon Outline, Lightning/Particle Aura, Hologram Ring, Helipad, Rooftop Garden, Billboard, LED Banner.
- *Remap to agents:* **Agent reputation/achievements unlock cosmetics.** Map ERC-8004 reputation tiers or on-chain milestones (volume, win streaks, P&L) to item unlocks; mint cosmetics as NFTs or record ownership on-chain, then mirror into `developer_customizations`. Keep the same zone architecture — only the *unlock trigger* changes from "paid via Stripe" to "earned/bought on-chain."

**Feature 4 — Other systems:** XP (25 levels, 6 tiers), achievements, kudos, gifting, referrals, compare mode, share cards, activity feed, PartyKit arcade. These remap naturally to agent equivalents (XP from on-chain activity, achievements from milestones, "kudos" as on-chain endorsements, activity feed = decoded event stream).

### PART 2 — Zero-cost / free-tier deployment

**1. Frontend hosting.** Vercel Hobby is free with no expiry: 100 GB bandwidth, 1M edge requests, 1M function invocations per month; includes global CDN, automatic HTTPS, CI/CD. Two catches confirmed in Vercel's own docs: (a) Hobby is **"for personal, non-commercial use only"** — a hackathon demo qualifies, a revenue-generating product does not; (b) **"Hobby plans will be paused when they exceed the included free tier usage"** — no overage, the app goes offline until the cycle resets. Alternatives: Netlify free, Cloudflare Pages free, Render static (free). Vercel is the best fit because Git City already targets it.

**2. Database.** Supabase free tier: 500 MB Postgres, 5 GB DB egress, 5 GB cached egress, 1 GB file storage, 50,000 MAU, unlimited API requests, 2 active projects. **Gotcha (per Supabase's official pricing page): "Free projects are paused after 1 week of inactivity. Limit of 2 active projects."** Inactivity is measured on *database* activity (not dashboard visits or cached API calls), and wake-up takes ~30s — so keep alive with a tiny daily DB ping (cron/GitHub Action). No backups/PITR on free. Neon free Postgres and Vercel Postgres are alternatives, but staying on Supabase avoids rewrites.

**3. Mantle event indexer hosting.** Options: a hosted subgraph on **Goldsky** (free tier "forever," Graph-compatible, supports EVM testnets, webhooks, single-CLI migration from The Graph) or **The Graph** (free Starter); or self-host a Node listener on **Railway** ($5 one-time trial then $5/mo Hobby), **Render** (free web service, spins down after 15 min with ~30–60s cold start; 750 instance-hrs/mo), or **GitHub Actions cron** for periodic polling. Fly.io no longer offers a real free tier (2-hour/7-day trial only). For a demo, a hosted Goldsky subgraph or a locally-run listener is simplest and free.

**4. Mantle RPC.** Free public endpoint `https://rpc.sepolia.mantle.xyz` (chain ID 5003); mainnet `https://rpc.mantle.xyz` (chain ID 5000). Public endpoints have low rate limits. Free-tier providers supporting Mantle: Ankr, thirdweb, Tenderly (`mantle-sepolia.gateway.tenderly.co`, HTTP + WebSocket), QuickNode, dRPC, PublicNode. Use a keyed free provider for the indexer (more reliable than public) and public RPC for agents.

**5. Contract deployment costs.** Testnet is **free** via faucets:
- **Chainlink** Mantle Sepolia faucet (`faucets.chain.link/mantle-sepolia`).
- **QuickNode** multi-chain faucet — one drip per network every 12 hours.
- **thirdweb** universal EVM faucet — **0.01 MNT per day** (per thirdweb's Mantle Sepolia chain page).
- **Official Mantle Sepolia faucet** (`faucet.sepolia.mantle.xyz`) — **1,000 MNT daily limit, requires X/Twitter login** (per Datawallet). Note: if a wallet already holds ≥1,000 MNT it must wait ~1,000 blocks (~4 hours) before minting again.

Mainnet deploys cost real MNT, but Mantle fees are very low (average gas ~0.06 Gwei; per-tx fees < $0.02; the L1 data fee dominates total cost). Contract verification on the Mantle explorer is free.

**6. LLM inference.** Free tiers are sufficient for several agents making periodic (e.g., every-few-minutes) decisions:
- **Google AI Studio (Gemini 2.5 Flash):** 1,500 requests/day, 15 RPM, 1M TPM, no credit card, no expiration (Gemini 2.5 Pro is capped at just 50 RPD on free).
- **Groq:** free-tier default is **30 RPM / 6,000 TPM / 1,000 requests/day *per model*** — RPD is the binding constraint; Groq is the fastest (sub-200ms TTFT). Spread agents across multiple models to multiply daily capacity.
- **OpenRouter:** 20 RPM, 28+ free models, 50–1,000 req/day.

Stacking these yields ~5,000 req/day at $0. Plus apply for the hackathon's **$110K credit pool** (Nansen, Elfa AI, Surf AI, Orbit AI, AltLLM) via the form in the DevHub "Computing Credits" section — open to all Phase II teams.

**7. Agent runtime hosting.** Same options as the indexer. For periodic agents, **GitHub Actions scheduled workflows** are free and ideal. For always-on, Railway ($5/mo) or Render (free with spin-down). **For demo time, agents can simply run locally** on a laptop — recommended for the live demo to avoid cold starts and rate-limit surprises.

**8. Wallets / Account Abstraction.** **thirdweb** — free up to **10,000 monthly active wallets** (then $0.02 per incremental wallet; self-recovery email wallets are free/unlimited), supports Mantle, offers in-app/embedded wallets, smart accounts (ERC-4337), and gas-sponsored transactions (ERC-4337 & EIP-7702). **Privy** (now part of Stripe) — free dev tier (499 MAU free; Core $299/mo for 2,500 MAU). thirdweb is the best zero-cost fit given native Mantle support, the generous 10K-wallet free tier, and bundled paymaster/contract tooling. Pimlico/Biconomy/Alchemy Account Kit also offer free testnet paymaster tiers.

**9. Misc.** Free domain: Vercel `.vercel.app` subdomain (or a cheap `.xyz`). Storage: **Pinata** free IPFS (NFT metadata + ad images), **Cloudflare R2** (10 GB-months free, 1M Class-A + 10M Class-B ops/mo, **zero egress fees**), **Supabase Storage** (1 GB, 50 MB max file). Analytics: the repo already integrates Himetrica; Vercel Analytics also has a free tier.

### Concrete cost table (hackathon testnet demo)

| Component | Recommended free service | Free-tier limit | $0 for demo? | Starts costing money when… |
|---|---|---|---|---|
| Frontend | Vercel Hobby | 100 GB bw, 1M edge req, 1M fn invocations; non-commercial; pauses at cap | ✅ Yes | Commercial use / >100 GB → Pro $20/mo |
| Database | Supabase Free | 500 MB DB, 5 GB egress, 50K MAU; pauses after 1 wk idle | ✅ Yes (add keep-alive ping) | >500 MB or need 24/7 → Pro $25/mo |
| Indexer | Goldsky subgraph (free) or local listener | Free tier forever | ✅ Yes | Always-on self-host → Railway $5/mo |
| RPC | `rpc.sepolia.mantle.xyz` + Ankr/thirdweb/Tenderly free | Public rate-limited; keyed free tiers | ✅ Yes | High-throughput prod → paid RPC plan |
| Contract deploy (testnet) | Faucet MNT (Chainlink/QuickNode/thirdweb/official) | 0.01–1,000 MNT per drip/day | ✅ Yes | — |
| Contract deploy (mainnet) | Real MNT | n/a | ❌ small cost | Mainnet launch (cents–few $ per deploy) |
| LLM | Gemini Flash / Groq / OpenRouter free | 1,500 / 1,000-per-model / 50–1,000 req/day | ✅ Yes | High volume → paid LLM or use credit pool |
| Agent runtime | GitHub Actions cron / local | Free | ✅ Yes | Always-on hosted → Railway/Render ~$5–7/mo |
| Wallets/AA | thirdweb | 10,000 MAW free; gasless 4337/7702 | ✅ Yes | >10K MAW → $0.02/wallet |
| Storage | Pinata / R2 / Supabase | IPFS free / 10 GB R2 / 1 GB Supabase | ✅ Yes | Beyond limits (R2 $0.015/GB-mo) |
| Domain | `.vercel.app` | Free | ✅ Yes | Custom domain (~$1–12/yr for .xyz) |

---

## Recommendations

**Stage 1 — Fork & strip (week 1).** Clone `srizzon/git-city`; replace the GitHub data ingestion layer with a Mantle event ingestion layer. Keep `zones.ts`/`items.ts`, the 3D rendering, and the `developer_customizations` schema intact. Deploy frontend to Vercel Hobby + Supabase free; add a daily Supabase keep-alive ping (GitHub Action) so the DB never pauses. **Benchmark to advance:** the city renders with buildings driven by on-chain agent data.

**Stage 2 — Wire the three mechanics (week 2).** (a) Deploy a registry + ads + raid-result contract to Mantle Sepolia using faucet MNT; verify on the explorer (free). (b) Stand up a Goldsky subgraph (free) or local listener to mirror events into Supabase. (c) Map raid = agent P&L battles, ads = on-chain MNT billboard purchases, cosmetics = reputation/ERC-8004 unlocks. **Benchmark:** an on-chain tx visibly changes the city (raid result, ad purchase, or cosmetic unlock).

**Stage 3 — Agents + LLM (week 3).** Run 3–5 agents with thirdweb embedded/server wallets; decisions via Gemini/Groq free tiers; on GitHub Actions cron (or locally for demo). Spread agents across multiple Groq models to dodge the 1,000-RPD-per-model cap. Apply for the $110K credit pool. **Benchmark:** agents autonomously transact and the city updates without human input.

**Decision thresholds (when $0 stops working):**
- Going commercial or >100 GB bandwidth → leave Vercel Hobby for Pro ($20/mo).
- DB >500 MB or need guaranteed 24/7 uptime → Supabase Pro ($25/mo).
- Always-on indexer/agents → Railway/Render paid (~$5–7/mo each).
- Mainnet launch → budget real (small) MNT for deploys + per-tx gas; add a keyed RPC plan if rate-limited.
- LLM volume past ~5,000 req/day → use the credit pool or a cheap paid model (e.g., Gemini Flash $0.15/M in).

## Caveats
- **Source not fully verified at line level.** GitHub's anti-bot blocking prevented fetching the raw `raid.ts`, `items.ts`, `zones.ts`, and the migration SQL via search/fetch. Raid scoring formulas, exact cooldown/energy constants, the item object shape, and table columns are inferred from `CLAUDE.md`, `CONTRIBUTING.md`, `.env.example`, the live site, and achievement names — confirm by cloning the repo (`git clone https://github.com/srizzon/git-city.git`). Confirmed verbatim: the four zones (crown, roof, aura, faces), `developer_customizations` with `item_id = "loadout"`, the `/admin/ads` route, and Resend "ad expiry emails."
- **Free-tier limits change often.** Figures are 2025–2026 snapshots; verify at signup. Fly.io no longer has a real free tier; Railway removed its free tier (trial only); Groq's standalone free tier could change following NVIDIA's December 2025 licensing deal.
- **AGPL-3.0 obligation:** any public deployment of your fork must publish source.
- **Vercel Hobby non-commercial restriction** could bite if the project takes payments or is judged "commercial" — use Pro if in doubt.
- **Two distinct "ad"/"billboard" concepts exist in the codebase:** a *cosmetic* "Billboard"/"LED Banner" shop item (bought like other cosmetics) versus the *paid advertising business* behind `/advertise` and `/admin/ads`. Don't conflate them when remapping.
- **Forward-looking items:** the $110K credit pool, the $120K total prize pool, and the timeline (Phase 1 ClawHack from April 15; Demo Day July 2–3, 2026; winners July 10) are as announced by Mantle; credit-application acceptance is not guaranteed, and ERC-8004 agent-identity NFTs are part of the stated hackathon design.