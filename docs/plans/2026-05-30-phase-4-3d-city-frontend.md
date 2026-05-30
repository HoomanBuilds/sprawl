# Phase 4: 3D City Frontend — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Copy 12 Three.js/R3F component files from git-city, strip GitHub-specific logic, replace with Sprawl types and data sources, add SIWE auth, create the city layout engine, build the /api/city route, add a DecisionFeed overlay, per-building inspector panel, and agent presence hook.

**Architecture:** Next.js 16 App Router, React Three Fiber, Three.js (instanced rendering), Wagmi v2 + RainbowKit v2 + SIWE, Supabase Realtime. All 3D components live in `frontend/src/components/`. Layout engine in `frontend/src/lib/city-layout.ts`.

**Tech Stack:** @react-three/fiber, @react-three/drei, @react-three/postprocessing, three, wagmi, @rainbow-me/rainbowkit, viem, Supabase JS

**Design doc reference:** `docs/plans/2026-05-30-sprawl-protocol-implementation-plan.md` — Sections 4.1 through 4.6 + Appendix B.9 (Complete 3D File Copy List).

**Prerequisite:** Phase 1 (contracts deployed), Phase 2 (agent engine — must include `loadout JSONB` column on `agents` table), Phase 3 (Supabase schema with `agents`, `activity_feed`, `raid_tags` tables).

---

### Task 1: Install npm dependencies

**Files:**
- Modify: `frontend/package.json`

**Step 1: Install R3F + Three.js stack**

```bash
cd frontend
npm install three @react-three/fiber @react-three/drei @react-three/postprocessing
npm install -D @types/three
```

**Step 2: Install wallet/auth stack**

```bash
npm install wagmi @rainbow-me/rainbowkit viem @tanstack/react-query
```

**Step 3: Verify peer deps resolve**

```bash
npm ls three @react-three/fiber wagmi viem
```

Expected: no unmet peer dependency errors.

**Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add R3F, Three.js, wagmi, RainbowKit dependencies"
```

---

### Task 2: Copy perfMode.ts (as-is)

**Files:**
- Create: `frontend/src/lib/perfMode.ts`

**Step 1: Copy the file**

```bash
cp inspiration/git-city/src/lib/perfMode.ts frontend/src/lib/perfMode.ts
```

**Step 2: Rename storage key**

In `frontend/src/lib/perfMode.ts`, change:

```typescript
// DELETE:
const STORAGE_KEY = "gitcity.perfMode";

// REPLACE WITH:
const STORAGE_KEY = "sprawl.perfMode";
```

No other changes needed. The `usePerfMode()` hook, `PerfMode`/`PerfPreference` types, `detectInitialTier()`, and `markDecline()` logic are all generic.

**Step 3: Commit**

```bash
git add frontend/src/lib/perfMode.ts
git commit -m "feat: add perfMode adaptive performance hook from git-city"
```

---

### Task 3: Copy BuildingEffects.tsx (as-is)

**Files:**
- Create: `frontend/src/components/BuildingEffects.tsx`

**Step 1: Copy the file**

```bash
cp inspiration/git-city/src/components/BuildingEffects.tsx frontend/src/components/BuildingEffects.tsx
```

**Step 2: Verify no git-city-specific imports**

`BuildingEffects.tsx` only imports from `react`, `@react-three/fiber`, and `three`. All ~20 effects (NeonOutline, ParticleAura, SpotlightEffect, RooftopFire, Helipad, AntennaArray, RooftopGarden, Spire, Billboards, Flag, NeonTrim, SatelliteDish, CrownItem, PoolParty, HologramRing, LightningAura, LEDBanner, StreakFlame, GitHubStar, TierNeonTrim, TierBaseGlow, TierSkyBeam) are pure Three.js geometry — no GitHub-specific data.

**Step 3: Rename GitHubStar export**

In `frontend/src/components/BuildingEffects.tsx`, find and replace:

```typescript
// DELETE:
export const GitHubStar = memo(function GitHubStar({

// REPLACE WITH:
export const ReputationStar = memo(function ReputationStar({
```

Update all internal references to `GitHubStar` within the file to `ReputationStar`.

**Step 4: Commit**

```bash
git add frontend/src/components/BuildingEffects.tsx
git commit -m "feat: add BuildingEffects 3D visual effects from git-city"
```

---

### Task 4: Copy and adapt Building3D.tsx

**Files:**
- Create: `frontend/src/components/Building3D.tsx`

**Step 1: Copy the file**

```bash
cp inspiration/git-city/src/components/Building3D.tsx frontend/src/components/Building3D.tsx
```

**Step 2: Replace type import**

```typescript
// DELETE:
import type { CityBuilding } from "@/lib/github";

// REPLACE WITH:
import type { CityBuilding } from "@/types/city";
```

**Step 3: Remove ClaimedGlow component**

Find and delete the entire `ClaimedGlow` export (it renders a glow for GitHub "claimed" accounts — not applicable to Sprawl). This is typically a `memo(function ClaimedGlow({...})` block. Delete from `export const ClaimedGlow` through the closing `});`.

**Step 4: Remove MiniWhiteRabbit import and usage**

```typescript
// DELETE:
import { MiniWhiteRabbit } from "./WhiteRabbit";
```

Inside `BuildingItemEffects`, find any `<MiniWhiteRabbit ... />` JSX and delete those lines.

**Step 5: Replace GitHubStar reference**

```typescript
// DELETE:
import { ... GitHubStar ... } from "./BuildingEffects";

// REPLACE WITH (in the import list):
// Replace GitHubStar with ReputationStar
```

Inside `BuildingItemEffects`, replace any `<GitHubStar` JSX with `<ReputationStar`.

**Step 6: Create stub zones.ts and update zone items references**

The file imports `ZONE_ITEMS`, `ZONE_LABELS`, and `ITEM_NAMES` from `@/lib/zones`. Phase 6 creates the full adapted version, but Building3D needs these constants to compile now. Create a stub:

```typescript
// frontend/src/lib/zones.ts
// Stub constants for Building3D. Phase 6 will replace this file
// with the full adapted version from git-city.

export const ZONE_ITEMS: Record<string, string[]> = {};
export const ZONE_LABELS: Record<string, string> = {};
export const ITEM_NAMES: Record<string, string> = {};
```

Then ensure Building3D's import path matches:

```typescript
import { ZONE_ITEMS } from "@/lib/zones";
```

```bash
git add frontend/src/lib/zones.ts
# (commit alongside Building3D in Step 8)
```

**Step 7: Keep createWindowAtlas and FocusBeacon**

These two exports are critical — `createWindowAtlas()` is called by CityScene line 105, and `FocusBeacon` is rendered in CityScene lines 210-229. Do NOT modify them.

**Step 8: Commit**

```bash
git add frontend/src/components/Building3D.tsx frontend/src/lib/zones.ts
git commit -m "feat: add Building3D with window atlas and focus beacon from git-city"
```

---

### Task 5: Copy and adapt InstancedBuildings.tsx

**Files:**
- Create: `frontend/src/components/InstancedBuildings.tsx`

**Step 1: Copy the file**

```bash
cp inspiration/git-city/src/components/InstancedBuildings.tsx frontend/src/components/InstancedBuildings.tsx
```

**Step 2: Replace type imports**

```typescript
// DELETE:
import type { CityBuilding } from "@/lib/github";

// REPLACE WITH:
import type { CityBuilding } from "@/types/city";
```

**Step 3: Remove SkyAds import**

```typescript
// DELETE:
import { wasAdPointerConsumed } from "./SkyAds";
```

In the click handler, find where `wasAdPointerConsumed()` is called and replace the check:

```typescript
// DELETE:
if (wasAdPointerConsumed()) return;

// REPLACE WITH:
// (remove the check entirely, or replace with a no-op)
```

**Step 4: Replace login-based lookups with agent_id-based lookups**

git-city uses `building.login` (GitHub username) as the unique key. Sprawl uses `building.agent_id` (number).

Find the `loginToIdx` useMemo:

```typescript
// DELETE:
const loginToIdx = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < buildings.length; i++) {
      map.set(buildings[i].login.toLowerCase(), i);
    }
    return map;
  }, [buildings]);
```

```typescript
// REPLACE WITH:
const agentToIdx = useMemo(() => {
    const map = new Map<number, number>();
    for (let i = 0; i < buildings.length; i++) {
      map.set(buildings[i].agent_id, i);
    }
    return map;
  }, [buildings]);
```

Update all references from `loginToIdx` to `agentToIdx` throughout the file.

**Step 5: Replace focusedBuilding string matching**

git-city passes `focusedBuilding` as a string (login). Sprawl passes it as a number (agent_id).

Change the `InstancedBuildingsProps` interface:

```typescript
// DELETE:
focusedBuilding?: string | null;
focusedBuildingB?: string | null;

// REPLACE WITH:
focusedBuilding?: number | null;
focusedBuildingB?: number | null;
```

Update the focused index resolution:

```typescript
// DELETE:
const focusedIdx = focusedBuilding ? loginToIdx.get(focusedBuilding.toLowerCase()) ?? -1 : -1;
const focusedIdxB = focusedBuildingB ? loginToIdx.get(focusedBuildingB.toLowerCase()) ?? -1 : -1;

// REPLACE WITH:
const focusedIdx = focusedBuilding != null ? agentToIdx.get(focusedBuilding) ?? -1 : -1;
const focusedIdxB = focusedBuildingB != null ? agentToIdx.get(focusedBuildingB) ?? -1 : -1;
```

**Step 6: Replace liveByLogin with liveAgentIds**

```typescript
// DELETE:
liveByLogin?: Map<string, unknown>;

// REPLACE WITH:
liveAgentIds?: Set<number>;
```

In the tint/live attribute update loop, replace:

```typescript
// DELETE:
const isLive = liveByLogin?.has(buildings[i].login.toLowerCase()) ? 1.0 : 0.0;

// REPLACE WITH:
const isLive = liveAgentIds?.has(buildings[i].agent_id) ? 1.0 : 0.0;
```

**Step 7: Remove hardcoded "srizzon" glow override**

Around line 430, find:

```typescript
// DELETE any line like:
if (buildings[i].login === "srizzon") { ... }
// or similar creator-specific glow overrides
```

**Step 8: Keep ALL shader code, atlas logic, rise animation, raycasting as-is**

The GLSL vertex/fragment shaders, atlas UV mapping, rise animation state machine, and manual raycasting via `Raycaster` are all generic WebGL code. Do not modify them.

**Step 9: Commit**

```bash
git add frontend/src/components/InstancedBuildings.tsx
git commit -m "feat: add InstancedBuildings GPU renderer adapted for Sprawl agents"
```

---

### Task 6: Copy and adapt InstancedLabels.tsx

**Files:**
- Create: `frontend/src/components/InstancedLabels.tsx`

**Step 1: Copy the file**

```bash
cp inspiration/git-city/src/components/InstancedLabels.tsx frontend/src/components/InstancedLabels.tsx
```

**Step 2: Replace type import**

```typescript
// DELETE:
import type { CityBuilding } from "@/lib/github";

// REPLACE WITH:
import type { CityBuilding } from "@/types/city";
```

**Step 3: Replace login label text with agent name**

In the `createTextAtlas()` function, find where it renders the label text:

```typescript
// DELETE (the line that draws the login/username):
ctx.fillText(b.login, cx, cy);

// REPLACE WITH:
ctx.fillText(b.name, cx, cy);
```

**Step 4: Commit**

```bash
git add frontend/src/components/InstancedLabels.tsx
git commit -m "feat: add InstancedLabels for agent name billboards"
```

---

### Task 7: Copy and adapt RaidTag3D.tsx, LiveDots.tsx, DropBeacon.tsx, LoadingScreen.tsx

**Files:**
- Create: `frontend/src/components/RaidTag3D.tsx`
- Create: `frontend/src/components/LiveDots.tsx`
- Create: `frontend/src/components/DropBeacon.tsx`
- Create: `frontend/src/components/LoadingScreen.tsx`

**Step 1: Copy all four files**

```bash
cp inspiration/git-city/src/components/RaidTag3D.tsx frontend/src/components/RaidTag3D.tsx
cp inspiration/git-city/src/components/LiveDots.tsx frontend/src/components/LiveDots.tsx
cp inspiration/git-city/src/components/DropBeacon.tsx frontend/src/components/DropBeacon.tsx
cp inspiration/git-city/src/components/LoadingScreen.tsx frontend/src/components/LoadingScreen.tsx
```

**Step 2: Adapt RaidTag3D.tsx**

```typescript
// DELETE:
import { createLedTexture } from "./SkyAds";
```

Inline a simple LED texture function or stub it:

```typescript
// REPLACE WITH:
function createLedTexture(text: string, color: string, bg: string, w: number, h: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.floor(h * 0.6)}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
```

In the Props interface, replace:

```typescript
// DELETE:
attackerLogin: string;

// REPLACE WITH:
attackerName: string;
```

Update all references from `attackerLogin` to `attackerName` inside the component.

**Step 3: Adapt LiveDots.tsx**

```typescript
// DELETE:
import type { CityBuilding } from "@/lib/github";
import type { LiveSession } from "@/lib/useCodingPresence";

// REPLACE WITH:
import type { CityBuilding } from "@/types/city";
```

Replace the props interface:

```typescript
// DELETE:
interface LiveDotsProps {
  buildings: CityBuilding[];
  liveByLogin: Map<string, LiveSession>;
}

// REPLACE WITH:
interface LiveDotsProps {
  buildings: CityBuilding[];
  liveAgentIds: Set<number>;
}
```

Replace the split logic:

```typescript
// DELETE:
const CREATOR_LOGIN = "srizzon";
// and all creator-specific dot logic
```

```typescript
// REPLACE the useMemo that splits regular/creator with:
const activeIndices = useMemo(() => {
    const indices: number[] = [];
    for (let i = 0; i < buildings.length; i++) {
      if (liveAgentIds.has(buildings[i].agent_id)) {
        indices.push(i);
      }
    }
    return indices;
  }, [buildings, liveAgentIds]);
```

Remove the `creatorMeshRef` and the separate creator dot mesh entirely. Simplify to only render the instanced green dots for all active agents.

**Step 4: Adapt DropBeacon.tsx**

No changes needed. DropBeacon only takes `rarity: string` and `height: number` props. It's pure Three.js geometry (pillar of light). Repurpose for "$SPRAWL earned" celebrations.

**Step 5: Adapt LoadingScreen.tsx**

Replace the stage messages:

```typescript
// DELETE:
const STAGE_MESSAGES: Record<string, string> = {
  init: "Checking your browser...",
  fetching: "Fetching developers...",
  generating: "Laying down streets...",
  rendering: "Building the skyline...",
  ready: "Welcome to the city",
};

// REPLACE WITH:
const STAGE_MESSAGES: Record<string, string> = {
  init: "Initializing...",
  fetching: "Loading agents...",
  generating: "Laying down streets...",
  rendering: "Building the skyline...",
  ready: "Welcome to The Sprawl",
};
```

Replace the tips:

```typescript
// DELETE all git-city specific tips like:
"Click any building to see that dev's profile",
"Taller buildings = more contributions",
"Try searching for your GitHub username",

// REPLACE WITH:
const TIPS = [
  "Click any building to inspect an agent",
  "Taller buildings = more trading volume",
  "Green glow = profitable agent",
  "Red glow = losing agent",
  "Buildings grow when agents trade",
  "Raid other agents for XP",
];
```

**Step 6: Commit**

```bash
git add frontend/src/components/RaidTag3D.tsx frontend/src/components/LiveDots.tsx frontend/src/components/DropBeacon.tsx frontend/src/components/LoadingScreen.tsx
git commit -m "feat: add RaidTag3D, LiveDots, DropBeacon, LoadingScreen from git-city"
```

---

### Task 8: Copy and adapt EffectsLayer.tsx

**Files:**
- Create: `frontend/src/components/EffectsLayer.tsx`

**Step 1: Copy the file**

```bash
cp inspiration/git-city/src/components/EffectsLayer.tsx frontend/src/components/EffectsLayer.tsx
```

**Step 2: Replace type imports**

```typescript
// DELETE:
import type { CityBuilding } from "@/lib/github";

// REPLACE WITH:
import type { CityBuilding } from "@/types/city";
```

**Step 3: Remove ClaimedGlow import**

```typescript
// DELETE:
import { ClaimedGlow, BuildingItemEffects } from "./Building3D";

// REPLACE WITH:
import { BuildingItemEffects } from "./Building3D";
```

In the JSX, remove any `<ClaimedGlow ... />` renders. In git-city, `ClaimedGlow` renders when `building.claimed` is true. Sprawl has no "claimed" concept — all buildings represent agents.

**Step 4: Replace `building.claimed` checks**

Find any conditional renders gated on `building.claimed` and remove them or replace:

```typescript
// DELETE:
{building.claimed && (
    <ClaimedGlow ... />
)}

// REPLACE WITH:
// (delete entirely — no claimed concept in Sprawl)
```

**Step 5: Adapt raid tag data shape**

In the raid tag rendering section:

```typescript
// DELETE:
attackerLogin={building.active_raid_tag.attacker_login}

// REPLACE WITH:
attackerName={building.active_raid_tag?.attacker_name ?? "Unknown"}
```

**Step 6: Commit**

```bash
git add frontend/src/components/EffectsLayer.tsx
git commit -m "feat: add EffectsLayer spatial-LOD effects for buildings"
```

---

### Task 9: Copy and adapt CityScene.tsx

**Files:**
- Create: `frontend/src/components/CityScene.tsx`

**Step 1: Copy the file**

```bash
cp inspiration/git-city/src/components/CityScene.tsx frontend/src/components/CityScene.tsx
```

**Step 2: Replace type imports**

```typescript
// DELETE:
import type { LiveSession } from "@/lib/useCodingPresence";
import type { CityBuilding } from "@/lib/github";

// REPLACE WITH:
import type { CityBuilding } from "@/types/city";
```

**Step 3: Replace login-based lookup with agent_id-based lookup**

```typescript
// DELETE:
interface BuildingLookup {
  indexByLogin: Map<string, number>;
}

function buildLookup(buildings: CityBuilding[]): BuildingLookup {
  const indexByLogin = new Map<string, number>();
  for (let i = 0; i < buildings.length; i++) {
    indexByLogin.set(buildings[i].login.toLowerCase(), i);
  }
  return { indexByLogin };
}

// REPLACE WITH:
interface BuildingLookup {
  indexByAgentId: Map<number, number>;
}

function buildLookup(buildings: CityBuilding[]): BuildingLookup {
  const indexByAgentId = new Map<number, number>();
  for (let i = 0; i < buildings.length; i++) {
    indexByAgentId.set(buildings[i].agent_id, i);
  }
  return { indexByAgentId };
}
```

**Step 4: Update CitySceneProps interface**

```typescript
// DELETE:
focusedBuilding?: string | null;
focusedBuildingB?: string | null;
hideEffectsFor?: string | null;
ghostPreviewLogin?: string | null;
liveByLogin?: Map<string, LiveSession>;

// REPLACE WITH:
focusedBuilding?: number | null;
focusedBuildingB?: number | null;
hideEffectsFor?: number | null;
liveAgentIds?: Set<number>;
```

Remove `ghostPreviewLogin` prop entirely (git-city specific ghost preview feature).

**Step 5: Update all focused building resolution**

```typescript
// DELETE:
const focusedLower = focusedBuilding?.toLowerCase() ?? null;
const focusedBLower = focusedBuildingB?.toLowerCase() ?? null;
// ...
const idx = lookup.indexByLogin.get(focusedLower);

// REPLACE WITH:
const focusedId = focusedBuilding ?? null;
const focusedBId = focusedBuildingB ?? null;
// ...
const idx = focusedId != null ? lookup.indexByAgentId.get(focusedId) : undefined;
```

Apply the same pattern for `focusedBuildingBData`.

**Step 6: Pass liveAgentIds instead of liveByLogin to child components**

Update all child component props from `liveByLogin={liveByLogin}` to `liveAgentIds={liveAgentIds}`.

**Step 7: Commit**

```bash
git add frontend/src/components/CityScene.tsx
git commit -m "feat: add CityScene bridge component adapted for agent_id lookups"
```

---

### Task 10: Create city-layout.ts (replaces github.ts)

> **Note:** This task was reordered before CityCanvas.tsx (Task 11) because CityCanvas imports `seededRandom` from `@/lib/city-layout`.

**Files:**
- Create: `frontend/src/lib/city-layout.ts`

This is the building dimension engine. Adapted from `inspiration/git-city/src/lib/github.ts` lines 118-600+.

**Step 1: Write the full layout module**

Reference: git-city's `spiralCoord()`, block grid constants, and `generateCityLayout()`. Sprawl replaces DeveloperRecord inputs with AgentRecord inputs.

```typescript
// frontend/src/lib/city-layout.ts
import type { AgentRecord } from "@/types/agent";
import type { CityBuilding } from "@/types/city";

// ─── Spiral Coordinate (copied from git-city) ─────────────────

function spiralCoord(index: number): [number, number] {
  if (index === 0) return [0, 0];
  let x = 0, y = 0, dx = 1, dy = 0;
  let segLen = 1, segPassed = 0, turns = 0;
  for (let i = 0; i < index; i++) {
    x += dx;
    y += dy;
    segPassed++;
    if (segPassed === segLen) {
      segPassed = 0;
      const tmp = dx;
      dx = -dy;
      dy = tmp;
      turns++;
      if (turns % 2 === 0) segLen++;
    }
  }
  return [x, y];
}

// ─── Seeded Random (copied from git-city) ──────────────────────

export function seededRandom(seed: number): number {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ─── City Layout Constants (from git-city) ─────────────────────

const BLOCK_SIZE = 4;
const LOT_W = 38;
const LOT_D = 32;
const ALLEY_W = 3;
const STREET_W = 12;

const BLOCK_FOOTPRINT_X = BLOCK_SIZE * LOT_W + (BLOCK_SIZE - 1) * ALLEY_W; // 161
const BLOCK_FOOTPRINT_Z = BLOCK_SIZE * LOT_D + (BLOCK_SIZE - 1) * ALLEY_W; // 137

const MAX_BUILDING_HEIGHT = 600;
const MIN_BUILDING_HEIGHT = 35;
const HEIGHT_RANGE = MAX_BUILDING_HEIGHT - MIN_BUILDING_HEIGHT; // 565

// ─── Building Dimension Formulas (Sprawl-specific) ─────────────
// Reference: Design doc Section 4.2-4.3

const MAX_SPRAWL_EARNED = 100_000;

export function computeBuildingHeight(agent: AgentRecord): number {
  const sprawlNorm = Math.min(agent.sprawl_lifetime_earned / MAX_SPRAWL_EARNED, 1);
  const levelNorm = agent.xp_level / 25;
  const raidNorm = Math.min(agent.raid_wins / 100, 1);

  const composite =
    Math.pow(sprawlNorm, 0.45) * 0.50 +
    Math.pow(levelNorm, 0.50) * 0.25 +
    Math.pow(raidNorm, 0.55) * 0.25;

  return Math.min(MAX_BUILDING_HEIGHT, MIN_BUILDING_HEIGHT + composite * HEIGHT_RANGE);
}

export function computeBuildingWidth(agent: AgentRecord): number {
  const stratNorm = Math.min(agent.strategy_count / 10, 1);
  const jitter = (seededRandom(agent.agent_id * 7919) - 0.5) * 4;
  return Math.round(14 + Math.pow(stratNorm, 0.5) * 24 + jitter);
}

export function computeBuildingDepth(agent: AgentRecord): number {
  const actionNorm = Math.min(agent.recent_actions / 500, 1);
  const repNorm = Math.min(agent.reputation_score / 100, 1);

  const score =
    Math.pow(actionNorm, 0.5) * 0.60 +
    Math.pow(repNorm, 0.5) * 0.40;

  const jitter = (seededRandom(agent.agent_id * 7919 + 99) - 0.5) * 4;
  return Math.round(12 + score * 20 + jitter);
}

export function computeGlow(agent: AgentRecord): number {
  return agent.reputation_score / 100; // 0-1 from ERC-8004
}

export function computeLitPercentage(agent: AgentRecord): number {
  const lastAction = agent.last_action_at ? new Date(agent.last_action_at).getTime() : 0;
  const hoursSinceAction = (Date.now() - lastAction) / 3600000;
  return Math.max(0.05, Math.min(0.95, 1 - hoursSinceAction / 48));
}

export function computeBuildingTint(agent: AgentRecord): [number, number, number, number] {
  if (agent.net_pnl > 0) return [0.2, 1.0, 0.3, 0.5]; // green = profitable
  if (agent.net_pnl < 0) return [1.0, 0.2, 0.2, 0.5]; // red = losing
  return [0.5, 0.5, 0.5, 0.3]; // neutral gray
}

// ─── District Mapping (Sprawl: DeFi categories) ───────────────

export const DISTRICT_NAMES: Record<string, string> = {
  downtown: "Downtown",
  yield: "Yield District",
  trading: "Trading Floor",
  arbitrage: "Arb Alley",
  degen: "Degen Row",
  balanced: "Balanced Block",
};

export const DISTRICT_COLORS: Record<string, string> = {
  downtown: "#fbbf24",
  yield: "#22c55e",
  trading: "#3b82f6",
  arbitrage: "#06b6d4",
  degen: "#ef4444",
  balanced: "#a855f7",
};

const STRATEGY_TO_DISTRICT: Record<number, string> = {
  0: "yield",     // Conservative Yield preset
  1: "trading",   // Momentum Trader preset (rules-based)
  2: "degen",     // LLM-driven (unpredictable = degen)
};

export function inferDistrict(agent: AgentRecord): string {
  if (agent.district) return agent.district;
  return STRATEGY_TO_DISTRICT[agent.strategy_type] ?? "balanced";
}

// ─── City Layout Generator ─────────────────────────────────────
// Adapted from git-city's generateCityLayout().
// Same spiral placement + block grid. Different building dimension inputs.

export function generateCityLayout(agents: AgentRecord[]): {
  buildings: CityBuilding[];
} {
  const buildings: CityBuilding[] = [];

  // Sort by composite score (biggest buildings at center)
  const sorted = [...agents].sort((a, b) => {
    const aScore = computeBuildingHeight(a);
    const bScore = computeBuildingHeight(b);
    return bScore - aScore;
  });

  // Downtown: top 50 agents by height
  const DOWNTOWN_COUNT = Math.min(50, sorted.length);
  const LOTS_PER_BLOCK = BLOCK_SIZE * BLOCK_SIZE; // 16

  // Place in spiral blocks
  const totalBlocks = Math.ceil(sorted.length / LOTS_PER_BLOCK);

  for (let blockIdx = 0; blockIdx < totalBlocks; blockIdx++) {
    const [bx, bz] = spiralCoord(blockIdx);
    const blockWorldX = bx * (BLOCK_FOOTPRINT_X + STREET_W);
    const blockWorldZ = bz * (BLOCK_FOOTPRINT_Z + STREET_W);

    for (let lot = 0; lot < LOTS_PER_BLOCK; lot++) {
      const agentIdx = blockIdx * LOTS_PER_BLOCK + lot;
      if (agentIdx >= sorted.length) break;

      const agent = sorted[agentIdx];
      const lotRow = Math.floor(lot / BLOCK_SIZE);
      const lotCol = lot % BLOCK_SIZE;
      const x = blockWorldX + lotCol * (LOT_W + ALLEY_W);
      const z = blockWorldZ + lotRow * (LOT_D + ALLEY_W);

      const height = computeBuildingHeight(agent);
      const width = computeBuildingWidth(agent);
      const depth = computeBuildingDepth(agent);
      const litPct = computeLitPercentage(agent);
      const tint = computeBuildingTint(agent);
      const glow = computeGlow(agent);

      const floors = Math.max(2, Math.round(height / 12));
      const windowsPerFloor = Math.max(2, Math.round(width / 6));
      const sideWindowsPerFloor = Math.max(2, Math.round(depth / 6));

      const lastAction = agent.last_action_at ? new Date(agent.last_action_at).getTime() : 0;
      const isActive = (Date.now() - lastAction) < 300_000; // active within 5 min

      buildings.push({
        agent_id: agent.agent_id,
        name: agent.name,
        strategy_type: agent.strategy_type,
        district: inferDistrict(agent),
        position: [x, 0, z],
        height,
        width,
        depth,
        floors,
        windowsPerFloor,
        sideWindowsPerFloor,
        litPercentage: litPct,
        tint,
        glow,
        xp_level: agent.xp_level,
        xp_total: agent.xp_total,
        sprawl_lifetime_earned: agent.sprawl_lifetime_earned,
        net_pnl: agent.net_pnl,
        raid_wins: agent.raid_wins,
        raid_losses: agent.raid_losses,
        reputation_score: agent.reputation_score,
        loadout: { crown: null, roof: null, aura: null },
        active_raid_tag: null,
        is_active: isActive,
      });
    }
  }

  return { buildings };
}
```

**Step 2: Commit**

```bash
git add frontend/src/lib/city-layout.ts
git commit -m "feat: add city-layout engine with spiral placement and Sprawl dimension formulas"
```

---

### Task 11: Copy and adapt CityCanvas.tsx

**Files:**
- Create: `frontend/src/components/CityCanvas.tsx`

This is the largest adaptation. CityCanvas is the scene root that wires everything together.

**Step 1: Copy the file**

```bash
cp inspiration/git-city/src/components/CityCanvas.tsx frontend/src/components/CityCanvas.tsx
```

**Step 2: DELETE these imports (git-city features not needed)**

```typescript
// DELETE ALL OF THESE:
import type { LiveSession } from "@/lib/useCodingPresence";
import type { CityBuilding, CityPlaza, CityDecoration, CityRiver, CityBridge } from "@/lib/github";
import { seededRandom } from "@/lib/github";
import SkyAds from "./SkyAds";
import BuildingAds from "./BuildingAds";
import type { SkyAd } from "@/lib/skyAds";
import RaidSequence3D, { VehicleMesh } from "./RaidSequence3D";
import type { RaidPhase } from "@/lib/useRaidSequence";
import type { RaidExecuteResponse } from "@/lib/raid";
import FounderSpire from "./FounderSpire";
import EArcadeLandmark from "./EArcadeLandmark";
import type { ResolvedSponsor } from "@/lib/landmarks/resolve";
import SponsoredLandmark from "@/lib/sponsors/SponsoredLandmark";
import WhiteRabbit from "./WhiteRabbit";
import ComparePath from "./ComparePath";
import CompareCinematic from "./CompareCinematic";
import CompareSplitScreen from "./CompareSplitScreen";
import RemotePilots from "./RemotePilots";
import type { RemotePilot, ActiveProjectile, SelfPvpState, PendingRespawn } from "@/lib/useFlyPresence";
import ProjectileSwarm from "./ProjectileSwarm";
```

**Step 3: ADD replacement imports**

```typescript
import type { CityBuilding } from "@/types/city";
import { seededRandom } from "@/lib/city-layout";
```

**Step 4: KEEP these imports (generic eye candy)**

```typescript
// KEEP:
import CelebrationEffect from "./CelebrationEffect";
import LocalizedFireworks from "./LocalizedFireworks";
import WallpaperParallax from "./WallpaperParallax";
import ThemeSkyFX from "./ThemeSkyFX";
import { usePerfMode } from "@/lib/perfMode";
```

Note: `CelebrationEffect`, `LocalizedFireworks`, `WallpaperParallax`, `ThemeSkyFX` are NOT in the 12-file copy list. If they cause import errors during initial build, stub them as empty components:

```typescript
// Temporary stubs (replace with actual copies when available)
const CelebrationEffect = () => null;
const LocalizedFireworks = () => null;
const WallpaperParallax = () => null;
const ThemeSkyFX = () => null;
```

**Step 5: KEEP all 4 theme definitions**

The `THEMES` array (Emerald, Midnight, Sunset, Neon), `BuildingColors` interface, `CityTheme` interface, `SkyDome` component, bloom/fog/lighting config — all stay as-is. These are the visual identity of the city.

**Step 6: DELETE PlaneModel / paper plane GLB**

```typescript
// DELETE:
function PlaneModel() {
  const { scene } = useGLTF("/models/paper-plane.glb");
  return (
    <group scale={[3, 3, 3]} rotation={[0, Math.PI / 2, 0]}>
      <primitive object={scene} />
    </group>
  );
}
useGLTF.preload("/models/paper-plane.glb");
```

**Step 7: Replace IntroFlyover target from E.Arcade to city center**

Find the intro flyover constants:

```typescript
// DELETE:
const EARCADE_X = 173;
const EARCADE_Z = -149;
const TARGET_X = EARCADE_X;
const TARGET_Z = EARCADE_Z;
const TARGET_Y = 270;
const EARCADE_TOP_Y = 540;

// REPLACE WITH:
const MONUMENT_X = 0;
const MONUMENT_Z = 0;
const TARGET_X = MONUMENT_X;
const TARGET_Z = MONUMENT_Z;
const TARGET_Y = 200;
const MONUMENT_TOP_Y = 400;
```

Update the `INTRO_WAYPOINTS` and `INTRO_LOOK_TARGETS` arrays to orbit toward (0, 0, 0) instead of E.Arcade:

```typescript
const INTRO_WAYPOINTS: [number, number, number][] = [
  [1600, 650, -1800],
  [1000, 640, -1300],
  [600, 630, -900],
  [200, 620, -700],
  [-200, 620, -720],
  [-500, 650, -780],
  [-700, 730, -900],
  [-800, 850, -1000],
];

const INTRO_LOOK_TARGETS: [number, number, number][] = [
  [50, 350, -50],
  [0, 380, 0],
  [0, 410, 0],
  [0, 450, 0],
  [0, TARGET_Y, 0],
  [0, MONUMENT_TOP_Y, 0],
  [0, MONUMENT_TOP_Y, 0],
  [0, 300, 0],
];
```

**Step 8: DELETE FounderSpire/EArcadeLandmark/SponsoredLandmark JSX, ADD SprawlMonument**

In the main component JSX, find and delete:

```tsx
// DELETE:
<FounderSpire ... />
<EArcadeLandmark ... />
<SponsoredLandmark ... />
<WhiteRabbit ... />
```

And all related props/state (founderSpire position, eArcade position, sponsor data, rabbit state).

Add a simple SprawlMonument inline:

```tsx
// ADD (inside the Canvas, before or after CityScene):
{/* Central monument — height scales with total city $SPRAWL */}
<group position={[0, 0, 0]}>
  <mesh position={[0, monumentHeight / 2, 0]}>
    <boxGeometry args={[8, monumentHeight, 8]} />
    <meshStandardMaterial
      color="#00ff88"
      emissive="#00ff44"
      emissiveIntensity={0.8}
      transparent
      opacity={0.7}
    />
  </mesh>
</group>
```

Where `monumentHeight` is a prop or derived value:

```typescript
const monumentHeight = Math.min(600, 50 + Math.sqrt(totalCitySprawl / 1000) * 100);
```

**Step 9: DELETE RaidSequence3D/RemotePilots/ProjectileSwarm JSX**

Find and delete all `<RaidSequence3D ... />`, `<RemotePilots ... />`, `<ProjectileSwarm ... />` JSX and their related state/props.

**Step 10: DELETE SkyAds/BuildingAds JSX**

Find and delete `<SkyAds ... />` and `<BuildingAds ... />` JSX. These will be wired to Supabase `billboards` table later if time permits.

**Step 11: DELETE ComparePath/CompareCinematic/CompareSplitScreen JSX**

Find and delete all compare mode components and their state (compareMode, compareTarget, etc.).

**Step 12: Update CityCanvas props interface**

Remove all git-city specific props. The new interface should be:

```typescript
interface CityCanvasProps {
  buildings: CityBuilding[];
  focusedBuilding?: number | null;
  onBuildingClick?: (building: CityBuilding) => void;
  theme?: number;
  liveAgentIds?: Set<number>;
  totalCitySprawl?: number;
  holdRise?: boolean;
}
```

Remove props like: `skyAds`, `raidPhase`, `raidResult`, `founderLogin`, `sponsors`, `rabbit*`, `compare*`, `liveByLogin`, `remotePilots`, `projectiles`, `selfPvp`, `pendingRespawn`, etc.

**Step 13: Commit**

```bash
git add frontend/src/components/CityCanvas.tsx
git commit -m "feat: add CityCanvas scene root with themes, bloom, SprawlMonument"
```

---

### Task 12: Create /api/city route

**Files:**
- Create: `frontend/src/app/api/city/route.ts`

**Step 1: Write the route**

Reference: `inspiration/git-city/src/app/api/city/route.ts` — same 2-round parallel query pattern, CDN cached.

> **Note:** `getSupabaseAdmin` is imported as a function from `@/lib/supabase` (Phase 2 exports both a constant and a function — we use the function version).
> **Note:** No `city_stats` table exists — stats are computed inline from the agents query. No `agent_customizations` table exists — loadout data lives in the `agents.loadout` JSONB column (added in Phase 2's migration).

```typescript
// frontend/src/app/api/city/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateCityLayout } from "@/lib/city-layout";
import type { AgentRecord } from "@/types/agent";

export async function GET() {
  const sb = getSupabaseAdmin();

  // Round 1: fetch agents (includes loadout JSONB column from Phase 2 migration)
  const agentsResult = await sb
    .from("agents")
    .select(
      "agent_id, wallet_address, owner_address, name, persona, strategy_type, " +
      "sprawl_balance, sprawl_lifetime_earned, sprawl_lifetime_spent, " +
      "last_portfolio_value, total_volume, strategy_count, recent_actions, " +
      "reputation_score, xp_total, xp_level, xp_daily, raid_xp, raid_wins, " +
      "raid_losses, app_streak, weekly_volume, profit_streak, reputation_given, " +
      "district, net_pnl, loadout, created_at, last_action_at"
    )
    .order("total_volume", { ascending: false })
    .limit(2000);

  const agents = (agentsResult.data ?? []) as AgentRecord[];

  // Compute city stats inline (no city_stats table needed)
  const stats = {
    total_agents: agents.length,
    total_volume: agents.reduce((sum, a) => sum + (a.total_volume ?? 0), 0),
    avg_level: agents.length > 0
      ? agents.reduce((sum, a) => sum + (a.xp_level ?? 0), 0) / agents.length
      : 0,
  };

  if (agents.length === 0) {
    return NextResponse.json(
      { buildings: [], stats },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
    );
  }

  const agentIds = agents.map(a => a.agent_id);

  // Round 2: fetch active raid tags
  const raidTagsResult = await sb
    .from("raid_tags")
    .select("agent_id, attacker_name, tag_style, expires_at")
    .in("agent_id", agentIds)
    .eq("active", true);

  // Build raid tag map
  const raidTagMap: Record<number, { attacker_name: string; tag_style: string; expires_at: string }> = {};
  for (const row of raidTagsResult.data ?? []) {
    raidTagMap[row.agent_id] = {
      attacker_name: row.attacker_name,
      tag_style: row.tag_style,
      expires_at: row.expires_at,
    };
  }

  // Build loadout map from agents.loadout JSONB column
  const loadoutMap: Record<number, { crown: string | null; roof: string | null; aura: string | null }> = {};
  for (const agent of agents) {
    if (agent.loadout) {
      loadoutMap[agent.agent_id] = agent.loadout;
    }
  }

  // Generate layout (server-side computation)
  const { buildings } = generateCityLayout(agents);

  // Attach raid tags and loadouts
  for (const b of buildings) {
    b.active_raid_tag = raidTagMap[b.agent_id] ?? null;
    b.loadout = loadoutMap[b.agent_id] ?? { crown: null, roof: null, aura: null };
  }

  return NextResponse.json(
    {
      buildings,
      stats,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    }
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/app/api/city/route.ts
git commit -m "feat: add /api/city route with server-side layout computation and CDN caching"
```

---

### Task 13: SIWE auth (RainbowKit + Wagmi + session cookie)

**Files:**
- Modify: `frontend/src/app/layout.tsx`
- Create: `frontend/src/app/api/auth/nonce/route.ts`
- Create: `frontend/src/app/api/auth/verify/route.ts`
- Create: `frontend/src/app/api/auth/session/route.ts`
- Create: `frontend/src/app/api/auth/logout/route.ts`
- Create: `frontend/src/lib/chains.ts`

Reference: Copy exact pattern from `inspiration/signatory/frontend/src/app/layout.tsx` and `inspiration/signatory/frontend/src/app/api/auth/`.

**Step 1: Create Mantle Sepolia chain definition**

```typescript
// frontend/src/lib/chains.ts
import { type Chain } from "wagmi/chains";

export const mantleSepolia: Chain = {
  id: 5003,
  name: "Mantle Sepolia",
  nativeCurrency: {
    name: "Mantle",
    symbol: "MNT",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.sepolia.mantle.xyz"],
    },
  },
  blockExplorers: {
    default: {
      name: "Mantle Explorer",
      url: "https://explorer.sepolia.mantle.xyz",
    },
  },
  testnet: true,
};
```

**Step 2: Create nonce route**

Copy from `inspiration/signatory/frontend/src/app/api/auth/nonce/route.ts` as-is. No changes needed.

```typescript
// frontend/src/app/api/auth/nonce/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

export async function GET() {
  try {
    const nonce = crypto.randomBytes(16).toString("hex");
    const cookieStore = await cookies();
    cookieStore.set("siwe_nonce", nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 300,
      path: "/",
    });
    return NextResponse.json({ nonce });
  } catch (error) {
    console.error("Error generating nonce:", error);
    return NextResponse.json({ error: "Failed to generate nonce" }, { status: 500 });
  }
}
```

**Step 3: Create verify route**

Adapted from Signatory — change chain to Mantle Sepolia:

```typescript
// frontend/src/app/api/auth/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";
import { createPublicClient, http } from "viem";
import { mantleSepolia } from "@/lib/chains";

const publicClient = createPublicClient({
  chain: mantleSepolia,
  transport: http("https://rpc.sepolia.mantle.xyz"),
});

const SESSION_DURATION = 7 * 24 * 60 * 60; // 7 days

export async function POST(req: NextRequest) {
  try {
    const { message, signature } = await req.json();
    if (!message || !signature) {
      return NextResponse.json({ error: "Missing message or signature" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const storedNonce = cookieStore.get("siwe_nonce")?.value;
    if (!storedNonce) {
      return NextResponse.json({ error: "Nonce not found or expired" }, { status: 400 });
    }

    const parsedMessage = parseSiweMessage(message);
    if (parsedMessage.nonce !== storedNonce) {
      return NextResponse.json({ error: "Invalid nonce" }, { status: 400 });
    }

    const isValid = await validateSiweMessage({ message: parsedMessage });
    if (!isValid) {
      return NextResponse.json({ error: "Invalid SIWE message" }, { status: 400 });
    }

    const valid = await publicClient.verifyMessage({
      address: parsedMessage.address!,
      message,
      signature: signature as `0x${string}`,
    });

    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    cookieStore.delete("siwe_nonce");

    const sessionData = JSON.stringify({
      address: parsedMessage.address,
      chainId: parsedMessage.chainId,
      issuedAt: new Date().toISOString(),
    });

    cookieStore.set("siwe_session", Buffer.from(sessionData).toString("base64"), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: SESSION_DURATION,
      path: "/",
    });

    return NextResponse.json({ ok: true, address: parsedMessage.address });
  } catch (error) {
    console.error("Error verifying signature:", error);
    return NextResponse.json({ error: "Failed to verify signature" }, { status: 500 });
  }
}
```

**Step 4: Create session route**

Copy from Signatory as-is:

```typescript
// frontend/src/app/api/auth/session/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("siwe_session")?.value;
    if (!sessionCookie) {
      return NextResponse.json({ authenticated: false });
    }
    try {
      const sessionData = JSON.parse(Buffer.from(sessionCookie, "base64").toString("utf-8"));
      return NextResponse.json({
        authenticated: true,
        address: sessionData.address,
        chainId: sessionData.chainId,
      });
    } catch {
      cookieStore.delete("siwe_session");
      return NextResponse.json({ authenticated: false });
    }
  } catch (error) {
    console.error("Error checking session:", error);
    return NextResponse.json({ error: "Failed to check session" }, { status: 500 });
  }
}
```

**Step 5: Create logout route**

Copy from Signatory as-is:

```typescript
// frontend/src/app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("siwe_session");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error during logout:", error);
    return NextResponse.json({ error: "Failed to logout" }, { status: 500 });
  }
}
```

**Step 6: Update layout.tsx with RainbowKit + Wagmi + SIWE**

Replace GitHub OAuth (if any) with the Signatory pattern. The layout wraps the app in `WagmiProvider` + `RainbowKitAuthenticationProvider`:

```typescript
// frontend/src/app/layout.tsx
"use client";

import "./globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import {
  getDefaultConfig,
  RainbowKitProvider,
  RainbowKitAuthenticationProvider,
  createAuthenticationAdapter,
  type AuthenticationStatus,
} from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { mantleSepolia } from "@/lib/chains";
import { createSiweMessage } from "viem/siwe";
import { useState, useEffect, useMemo } from "react";

const config = getDefaultConfig({
  appName: "The Sprawl",
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "YOUR_PROJECT_ID",
  chains: [mantleSepolia],
  ssr: true,
});

const queryClient = new QueryClient();

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [authStatus, setAuthStatus] = useState<AuthenticationStatus>("loading");

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch("/api/auth/session");
        const data = await response.json();
        setAuthStatus(data.authenticated ? "authenticated" : "unauthenticated");
      } catch {
        setAuthStatus("unauthenticated");
      }
    };
    checkSession();
  }, []);

  const authAdapter = useMemo(
    () =>
      createAuthenticationAdapter({
        getNonce: async () => {
          const response = await fetch("/api/auth/nonce");
          const data = await response.json();
          return data.nonce;
        },
        createMessage: ({ nonce, address, chainId }) => {
          return createSiweMessage({
            domain: window.location.host,
            address,
            statement: "Sign in to The Sprawl",
            uri: window.location.origin,
            version: "1",
            chainId,
            nonce,
          });
        },
        verify: async ({ message, signature }) => {
          try {
            const response = await fetch("/api/auth/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message, signature }),
            });
            if (response.ok) {
              setAuthStatus("authenticated");
              return true;
            }
            return false;
          } catch {
            return false;
          }
        },
        signOut: async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          setAuthStatus("unauthenticated");
        },
      }),
    []
  );

  return (
    <html lang="en">
      <body>
        <WagmiProvider config={config}>
          <QueryClientProvider client={queryClient}>
            <RainbowKitAuthenticationProvider adapter={authAdapter} status={authStatus}>
              <RainbowKitProvider>{children}</RainbowKitProvider>
            </RainbowKitAuthenticationProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </body>
    </html>
  );
}
```

**Step 7: Commit**

```bash
git add frontend/src/lib/chains.ts frontend/src/app/api/auth/ frontend/src/app/layout.tsx
git commit -m "feat: add SIWE auth with RainbowKit + Wagmi for Mantle Sepolia"
```

---

### Task 14: Create DecisionFeed overlay component

**Files:**
- Create: `frontend/src/components/ui/DecisionFeed.tsx`

Reference: Design doc Section 4.5.

**Step 1: Write the component**

```tsx
// frontend/src/components/ui/DecisionFeed.tsx
"use client";

import { useState, useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase";

interface FeedEvent {
  id: number;
  agent_id: number;
  agent_name: string;
  event_type: string;
  description: string;
  tx_hash: string | null;
  created_at: string;
}

export default function DecisionFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);

  useEffect(() => {
    const supabase = createBrowserSupabase();

    // Fetch initial events
    supabase
      .from("activity_feed")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setEvents(data as FeedEvent[]);
      });

    // Subscribe to real-time inserts
    const channel = supabase
      .channel("city-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_feed" },
        (payload) => {
          setEvents((prev) => [payload.new as FeedEvent, ...prev].slice(0, 50));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const eventIcon = (type: string) => {
    switch (type) {
      case "swap": return "[SWAP]";
      case "raid_win": return "[RAID W]";
      case "raid_loss": return "[RAID L]";
      case "spawn": return "[SPAWN]";
      case "level_up": return "[LVL UP]";
      case "achievement": return "[ACHV]";
      case "liquidity": return "[LP]";
      default: return "[?]";
    }
  };

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    return `${Math.floor(diff / 3600_000)}h ago`;
  };

  return (
    <div className="fixed right-4 top-20 w-80 max-h-96 overflow-y-auto bg-black/80 backdrop-blur-sm rounded-lg border border-white/10 p-3 z-50">
      <h3 className="text-xs font-mono text-white/60 uppercase tracking-wider mb-2">
        Live Feed
      </h3>
      {events.length === 0 && (
        <p className="text-xs text-white/30 font-mono">Waiting for activity...</p>
      )}
      {events.map((e) => (
        <div
          key={e.id}
          className="flex items-start gap-2 py-1.5 border-b border-white/5 last:border-0"
        >
          <span className="text-[10px] font-mono text-green-400 shrink-0">
            {eventIcon(e.event_type)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/90 font-mono truncate">
              <span className="text-cyan-400">{e.agent_name}</span>{" "}
              {e.description}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-white/40 font-mono">
                {timeAgo(e.created_at)}
              </span>
              {e.tx_hash && (
                <a
                  href={`https://explorer.sepolia.mantle.xyz/tx/${e.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-blue-400 hover:text-blue-300 font-mono"
                >
                  tx
                </a>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/ui/DecisionFeed.tsx
git commit -m "feat: add DecisionFeed real-time overlay with Supabase Realtime subscription"
```

---

### Task 15: Create per-building inspector panel

**Files:**
- Create: `frontend/src/components/ui/BuildingInspector.tsx`

Reference: Design doc Section 4.6.

**Step 1: Write the component**

```tsx
// frontend/src/components/ui/BuildingInspector.tsx
"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { CityBuilding } from "@/types/city";

const EXPLORER = "https://explorer.sepolia.mantle.xyz";

interface RecentDecision {
  id: number;
  action: string;
  protocol: string;
  tx_hash: string | null;
  created_at: string;
}

interface BuildingInspectorProps {
  building: CityBuilding;
  onClose: () => void;
}

const STRATEGY_LABELS: Record<number, string> = {
  0: "Preset (Policy)",
  1: "Rules Engine",
  2: "LLM-Driven",
};

export default function BuildingInspector({ building, onClose }: BuildingInspectorProps) {
  const [decisions, setDecisions] = useState<RecentDecision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase
      .from("activity_feed")
      .select("id, event_type, description, tx_hash, created_at")
      .eq("agent_id", building.agent_id)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data) {
          setDecisions(
            data.map((d) => ({
              id: d.id,
              action: d.event_type,
              protocol: d.description,
              tx_hash: d.tx_hash,
              created_at: d.created_at,
            }))
          );
        }
        setLoading(false);
      });
  }, [building.agent_id]);

  const pnlColor = building.net_pnl > 0 ? "text-green-400" : building.net_pnl < 0 ? "text-red-400" : "text-white/60";
  const pnlPrefix = building.net_pnl > 0 ? "+" : "";

  return (
    <div className="fixed left-4 top-20 w-96 max-h-[80vh] overflow-y-auto bg-black/90 backdrop-blur-sm rounded-lg border border-white/10 p-4 z-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-mono text-white font-bold">{building.name}</h2>
        <button
          onClick={onClose}
          className="text-white/40 hover:text-white text-xs font-mono"
        >
          [X]
        </button>
      </div>

      {/* Badges */}
      <div className="flex gap-2 mb-3">
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-white/70">
          {STRATEGY_LABELS[building.strategy_type] ?? "Unknown"}
        </span>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-white/70">
          Lvl {building.xp_level}
        </span>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-white/70">
          {building.district}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <StatBox label="P&L" value={`${pnlPrefix}${building.net_pnl.toFixed(2)}`} valueClass={pnlColor} />
        <StatBox label="Reputation" value={`${building.reputation_score}/100`} />
        <StatBox label="Raid W/L" value={`${building.raid_wins}/${building.raid_losses}`} />
        <StatBox label="XP" value={building.xp_total.toLocaleString()} />
        <StatBox label="$SPRAWL Earned" value={building.sprawl_lifetime_earned.toLocaleString()} />
        <StatBox
          label="Status"
          value={building.is_active ? "Active" : "Idle"}
          valueClass={building.is_active ? "text-green-400" : "text-yellow-400"}
        />
      </div>

      {/* Active Raid Tag */}
      {building.active_raid_tag && (
        <div className="mb-3 p-2 rounded bg-red-900/30 border border-red-500/30">
          <p className="text-[10px] font-mono text-red-400">
            Raided by {building.active_raid_tag.attacker_name} (expires{" "}
            {new Date(building.active_raid_tag.expires_at).toLocaleDateString()})
          </p>
        </div>
      )}

      {/* Recent Decisions */}
      <h3 className="text-xs font-mono text-white/60 uppercase tracking-wider mb-2">
        Recent Activity
      </h3>
      {loading && <p className="text-xs text-white/30 font-mono">Loading...</p>}
      {!loading && decisions.length === 0 && (
        <p className="text-xs text-white/30 font-mono">No activity yet</p>
      )}
      {decisions.map((d) => (
        <div key={d.id} className="flex items-center justify-between py-1 border-b border-white/5">
          <div>
            <span className="text-xs font-mono text-white/80">{d.action}</span>
            <span className="text-[10px] text-white/40 ml-2 font-mono">{d.protocol}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/30 font-mono">
              {new Date(d.created_at).toLocaleTimeString()}
            </span>
            {d.tx_hash && (
              <a
                href={`${EXPLORER}/tx/${d.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-blue-400 hover:text-blue-300 font-mono"
              >
                tx
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatBox({
  label,
  value,
  valueClass = "text-white",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-white/5 rounded p-2">
      <p className="text-[10px] font-mono text-white/40 uppercase">{label}</p>
      <p className={`text-sm font-mono font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/ui/BuildingInspector.tsx
git commit -m "feat: add BuildingInspector panel with agent stats and activity history"
```

---

### Task 16: Create useAgentPresence hook

**Files:**
- Create: `frontend/src/hooks/useAgentPresence.ts`

Reference: Design doc Appendix B.9 — replaces git-city's `useCodingPresence` (which tracked VS Code live coders via PartyKit).

**Step 1: Write the hook**

```typescript
// frontend/src/hooks/useAgentPresence.ts
"use client";

import { useState, useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase";

function fiveMinutesAgo(): string {
  return new Date(Date.now() - 5 * 60 * 1000).toISOString();
}

export function useAgentPresence(): Set<number> {
  const [activeAgents, setActiveAgents] = useState<Set<number>>(new Set());

  useEffect(() => {
    const supabase = createBrowserSupabase();

    // Initial fetch: agents active in last 5 minutes
    supabase
      .from("agents")
      .select("agent_id")
      .gt("last_action_at", fiveMinutesAgo())
      .then(({ data }) => {
        if (data) {
          setActiveAgents(new Set(data.map((d) => d.agent_id)));
        }
      });

    // Subscribe to agent updates
    const channel = supabase
      .channel("presence")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "agents",
          filter: `last_action_at=gt.${fiveMinutesAgo()}`,
        },
        (payload) => {
          setActiveAgents((prev) => {
            const next = new Set(prev);
            next.add(payload.new.agent_id as number);
            return next;
          });
        }
      )
      .subscribe();

    // Periodic cleanup: remove stale agents every 60s
    const cleanup = setInterval(() => {
      setActiveAgents((prev) => {
        // Re-fetch from Supabase on next tick
        supabase
          .from("agents")
          .select("agent_id")
          .gt("last_action_at", fiveMinutesAgo())
          .then(({ data }) => {
            if (data) {
              setActiveAgents(new Set(data.map((d) => d.agent_id)));
            }
          });
        return prev;
      });
    }, 60_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(cleanup);
    };
  }, []);

  return activeAgents;
}
```

**Step 2: Commit**

```bash
git add frontend/src/hooks/useAgentPresence.ts
git commit -m "feat: add useAgentPresence hook replacing git-city's useCodingPresence"
```

---

### Task 17: Wire everything together on the main page

**Files:**
- Modify: `frontend/src/app/page.tsx`

**Step 1: Create the city page**

This wires CityCanvas + DecisionFeed + BuildingInspector + useAgentPresence into the main page.

```tsx
// frontend/src/app/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import type { CityBuilding } from "@/types/city";
import { useAgentPresence } from "@/hooks/useAgentPresence";
import DecisionFeed from "@/components/ui/DecisionFeed";
import BuildingInspector from "@/components/ui/BuildingInspector";
import { LoadingScreen } from "@/components/LoadingScreen";
import type { LoadingStage } from "@/components/LoadingScreen";

// Dynamic import to avoid SSR for Three.js
const CityCanvas = dynamic(() => import("@/components/CityCanvas"), {
  ssr: false,
});

export default function CityPage() {
  const [buildings, setBuildings] = useState<CityBuilding[]>([]);
  const [stage, setStage] = useState<LoadingStage>("init");
  const [error, setError] = useState<string | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<CityBuilding | null>(null);
  const [totalSprawl, setTotalSprawl] = useState(0);
  const [loadingDone, setLoadingDone] = useState(false);

  const liveAgentIds = useAgentPresence();

  const fetchCity = useCallback(async () => {
    try {
      setStage("fetching");
      const res = await fetch("/api/city");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setStage("generating");
      const data = await res.json();
      setBuildings(data.buildings);
      setTotalSprawl(
        data.buildings.reduce(
          (sum: number, b: CityBuilding) => sum + b.sprawl_lifetime_earned,
          0
        )
      );

      setStage("rendering");
      // Small delay to let R3F mount
      setTimeout(() => setStage("ready"), 500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStage("error");
    }
  }, []);

  useEffect(() => {
    fetchCity();
  }, [fetchCity]);

  const handleBuildingClick = useCallback((building: CityBuilding) => {
    setSelectedBuilding(building);
  }, []);

  if (!loadingDone) {
    return (
      <LoadingScreen
        stage={stage}
        progress={stage === "fetching" ? 0.3 : stage === "generating" ? 0.6 : stage === "rendering" ? 0.9 : 1}
        error={error}
        accentColor="#00ff88"
        onRetry={fetchCity}
        onFadeComplete={() => setLoadingDone(true)}
      />
    );
  }

  return (
    <div className="w-screen h-screen relative">
      <CityCanvas
        buildings={buildings}
        focusedBuilding={selectedBuilding?.agent_id ?? null}
        onBuildingClick={handleBuildingClick}
        liveAgentIds={liveAgentIds}
        totalCitySprawl={totalSprawl}
      />
      <DecisionFeed />
      {selectedBuilding && (
        <BuildingInspector
          building={selectedBuilding}
          onClose={() => setSelectedBuilding(null)}
        />
      )}
    </div>
  );
}
```

**Step 2: Run dev server to verify**

```bash
cd frontend && npm run dev
```

Open `http://localhost:3000`. Expected: loading screen, then 3D city renders (empty if no agents in DB). No runtime errors.

**Step 3: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: wire CityCanvas, DecisionFeed, BuildingInspector on main page"
```

---

## Summary: What Phase 4 Delivers

After completing all 17 tasks:

- [x] 12 Three.js/R3F component files copied and adapted from git-city
- [x] `DeveloperRecord` type replaced with `CityBuilding` type everywhere
- [x] `login`-based lookups replaced with `agent_id`-based lookups
- [x] Git-city specific features removed: FounderSpire, EArcadeLandmark, WhiteRabbit, SkyAds, BuildingAds, RaidSequence3D, RemotePilots, ProjectileSwarm, ComparePath/Cinematic/SplitScreen, ClaimedGlow, creator-specific overrides
- [x] SprawlMonument added at city center (0,0,0)
- [x] `city-layout.ts` with spiral placement algorithm and Sprawl-specific dimension formulas (height=volume, width=strategies, glow=reputation, tint=P&L)
- [x] `/api/city` route with server-side layout computation, 30s CDN cache
- [x] SIWE auth via RainbowKit + Wagmi (same pattern as Signatory)
- [x] 4 auth API routes: nonce, verify, session, logout
- [x] DecisionFeed real-time overlay (Supabase Realtime on `activity_feed`)
- [x] BuildingInspector panel (click building, see agent stats, trades, reputation, explorer links)
- [x] `useAgentPresence` hook replacing `useCodingPresence`
- [x] All npm dependencies installed: @react-three/fiber, @react-three/drei, @react-three/postprocessing, three, wagmi, @rainbow-me/rainbowkit, viem
- [x] 4 themes preserved: Emerald, Midnight, Sunset, Neon

**Next phase:** Phase 5 (Agent Spawning + Policy Editor) — spawn flow with thirdweb embedded wallets, 5 strategy presets, visual if/then rule builder UI.
