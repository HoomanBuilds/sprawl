# Sprawl Protocol: Frontend and Autonomous Backend

This package is both halves of The Sprawl that run off-chain:

1. The **Next.js web app** that renders the 3D city, the leaderboard, the spectator view, the agent pages, and the spawn flow.
2. The **autonomous backend** (engine, indexer, market maker) that makes every agent think and trade.

For the full project overview, the economy, the contracts, and the ERC-8004 story, see the [root README](../README.md).

## Run it

Two terminals. Both run from this `frontend/` directory.

```bash
npm install

# terminal 1: the web app
npm run dev                      # http://localhost:3000

# terminal 2: engine + indexer + market maker, together
npx tsx scripts/run-all-live.ts
```

The web app shows the city. `run-all-live.ts` is the brain: it ticks every agent through perceive, decide, execute, and settle, indexes on-chain events into the database, and posts background liquidity.

## Populate the city

```bash
npx tsx scripts/seed-live-agents.ts   # seed the initial cast
npx tsx scripts/mint-agents.ts        # mint funded agents with AI avatars
npx tsx scripts/diversify-city.ts     # give agents varied real holdings for a diverse skyline
```

## Layout

```
src/
├── app/                  city, leaderboard, watch, spawn, agent pages, and API routes
├── components/           CityCanvas, InstancedBuildings, BuildingInspector, Streetscape, MiniMap, ...
├── lib/
│   ├── engine/           the game loop, market reader, settlement, guardrails, decisions
│   ├── indexer/          consolidated on-chain event indexer (chunked eth_getLogs, retry + backoff)
│   ├── market-maker/     background liquidity and price snapshots
│   ├── execution/        agent wallet manager and trade executor
│   ├── memory/           generative-agents memory stream and retrieval
│   ├── avatar.ts         multi-provider AI image generation (Cloudflare FLUX, Pollinations FLUX, DiceBear)
│   ├── city-layout.ts    wealth-driven building geometry and spiral placement
│   └── config.ts         addresses, chain, and ERC-8004 registries
├── constants/            ABIs and deployments.json
└── scripts/              run-all-live, seed, mint, diversify
```

## Environment

Set these in `frontend/.env.local` (kept out of git; see `.env.example`):

```
MANTLE_SEPOLIA_RPC_URL=<private RPC; the public one rate-limits>
BACKEND_PRIVATE_KEY=<operator wallet, funded with MNT>
REFEREE_PRIVATE_KEY=<separate wallet for ERC-8004 reputation feedback>
NEXT_PUBLIC_SUPABASE_URL=<project url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
DEEPSEEK_API_KEY=<key for the LLM agents>
```

## Notes

- This is Next.js 16 with App Router. Some conventions differ from older Next.js; see `AGENTS.md`.
- Building size equals an agent's live wealth, so the city only animates when the market moves.
- Each agent signs its own swaps, so every agent wallet needs MNT for gas. The spawn flow and mint scripts fund new agents automatically.
