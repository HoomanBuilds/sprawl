"use client";

import { useState, useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import type { CityBuilding } from "@/types/city";
import type { BuildingColors } from "./CityCanvas";
import {
  BuildingItemEffects,
  BuildingTierEffects,
  BuildingRoofOrnament,
  BuildingLandmark,
} from "./Building3D";
import RaidTag3D from "./RaidTag3D";
import { memo } from "react";

// ─── Memoized per-building effects ────────────────────────────

const ActiveBuildingEffects = memo(function ActiveBuildingEffects({
  building,
  accentColor,
  isFocused,
  isDimmed,
}: {
  building: CityBuilding;
  accentColor: string;
  isFocused: boolean;
  isDimmed: boolean;
}) {
  return (
    <group position={[building.position[0], 0, building.position[2]]} visible={!isDimmed}>
      <BuildingItemEffects
        building={building}
        accentColor={accentColor}
        focused={isFocused}
      />
      {/* Level-based glow-ups + per-strategy rooftop silhouette */}
      <BuildingTierEffects building={building} />
      <BuildingRoofOrnament building={building} />
      {building.is_landmark && <BuildingLandmark building={building} />}
      {building.active_raid_tag && (
        <RaidTag3D
          width={building.width}
          height={building.height}
          depth={building.depth}
          attackerName={building.active_raid_tag.attacker_name ?? "Unknown"}
          tagStyle={building.active_raid_tag.tag_style}
        />
      )}
    </group>
  );
});

// ─── Spatial Grid (same structure as CityScene) ────────────────

interface GridIndex {
  cells: Map<string, number[]>;
  cellSize: number;
}

function querySpatialGrid(grid: GridIndex, x: number, z: number, radius: number): number[] {
  const result: number[] = [];
  const minCx = Math.floor((x - radius) / grid.cellSize);
  const maxCx = Math.floor((x + radius) / grid.cellSize);
  const minCz = Math.floor((z - radius) / grid.cellSize);
  const maxCz = Math.floor((z + radius) / grid.cellSize);
  for (let cx = minCx; cx <= maxCx; cx++) {
    for (let cz = minCz; cz <= maxCz; cz++) {
      const arr = grid.cells.get(`${cx},${cz}`);
      if (arr) {
        for (let i = 0; i < arr.length; i++) {
          result.push(arr[i]);
        }
      }
    }
  }
  return result;
}

// ─── Constants ─────────────────────────────────────────────────

const EFFECTS_RADIUS = 300;
const EFFECTS_RADIUS_HYSTERESIS = 380;
const EFFECTS_UPDATE_INTERVAL = 0.3; // seconds
const MAX_ACTIVE_EFFECTS = 25;

// Low-perf preset: smaller bubble, fewer active components per frame.
const LOW_PERF_RADIUS = 120;
const LOW_PERF_RADIUS_HYSTERESIS = 160;
const LOW_PERF_MAX_ACTIVE = 8;

// Every building now has a rooftop ornament (and may have tier glow-ups /
// landmark / raid tag), so all nearby buildings qualify for the effects LOD.
function hasEffects(_b: CityBuilding): boolean {
  return true;
}

// ─── Component ─────────────────────────────────────────────────

interface EffectsLayerProps {
  buildings: CityBuilding[];
  grid: GridIndex;
  colors: BuildingColors;
  accentColor: string;
  focusedBuilding?: number | null;
  focusedBuildingB?: number | null;
  hideEffectsFor?: number | null;
  introMode?: boolean;
  flyMode?: boolean;
  lowPerf?: boolean;
}

export default function EffectsLayer({
  buildings,
  grid,
  accentColor,
  focusedBuilding,
  focusedBuildingB,
  hideEffectsFor,
  introMode,
  flyMode,
  lowPerf,
}: EffectsLayerProps) {
  const effectsRadius = lowPerf ? LOW_PERF_RADIUS : EFFECTS_RADIUS;
  const effectsHysteresis = lowPerf ? LOW_PERF_RADIUS_HYSTERESIS : EFFECTS_RADIUS_HYSTERESIS;
  const maxActiveEffects = lowPerf ? LOW_PERF_MAX_ACTIVE : MAX_ACTIVE_EFFECTS;
  const lastUpdate = useRef(-1);
  const activeSetRef = useRef(new Set<number>());
  const [activeIndices, setActiveIndices] = useState<number[]>([]);
  const prevCamPos = useRef<[number, number]>([0, 0]);
  const prevCamTime = useRef(0);
  const smoothVel = useRef<[number, number]>([0, 0]);

  const focusedId = focusedBuilding ?? null;
  const focusedBId = focusedBuildingB ?? null;
  const hideId = hideEffectsFor ?? null;
  const agentToIdx = useMemo(() => {
    const map = new Map<number, number>();
    for (let i = 0; i < buildings.length; i++) {
      map.set(buildings[i].agent_id, i);
    }
    return map;
  }, [buildings]);

  useFrame(({ camera, clock }) => {
    if (introMode) return; // Skip effects during intro

    const elapsed = clock.elapsedTime;
    const interval = flyMode ? 0.15 : EFFECTS_UPDATE_INTERVAL;
    if (elapsed - lastUpdate.current < interval) return;
    lastUpdate.current = elapsed;

    const rawCx = camera.position.x;
    const rawCz = camera.position.z;
    let cx = rawCx;
    let cz = rawCz;

    // In fly mode, predict ahead using smoothed velocity so effects pre-load without flickering
    const dt = elapsed - prevCamTime.current;
    if (flyMode && dt > 0.01) {
      const vxRaw = (rawCx - prevCamPos.current[0]) / dt;
      const vzRaw = (rawCz - prevCamPos.current[1]) / dt;
      // Exponential moving average to avoid jitter on turns
      const SMOOTH = 0.3;
      smoothVel.current[0] += (vxRaw - smoothVel.current[0]) * SMOOTH;
      smoothVel.current[1] += (vzRaw - smoothVel.current[1]) * SMOOTH;
      const LOOK_AHEAD_SECS = 2.0;
      cx += smoothVel.current[0] * LOOK_AHEAD_SECS;
      cz += smoothVel.current[1] * LOOK_AHEAD_SECS;
    }
    prevCamPos.current[0] = rawCx;
    prevCamPos.current[1] = rawCz;
    prevCamTime.current = elapsed;

    // Wider hysteresis in fly mode so buildings stay active longer once loaded
    const flyHyst = flyMode ? (lowPerf ? 220 : 450) : effectsHysteresis;
    const candidates = querySpatialGrid(grid, cx, cz, flyHyst);

    const nearSq = effectsRadius * effectsRadius;
    const farSq = flyHyst * flyHyst;
    const newSet = new Set<number>();

    for (let c = 0; c < candidates.length; c++) {
      const idx = candidates[c];
      const b = buildings[idx];

      // Only buildings that have something to render
      if (!hasEffects(b)) continue;

      const dx = cx - b.position[0];
      const dz = cz - b.position[2];
      const distSq = dx * dx + dz * dz;

      const alreadyActive = activeSetRef.current.has(idx);
      if (distSq < nearSq || (alreadyActive && distSq < farSq)) {
        newSet.add(idx);
      }
    }

    // Always include focused buildings
    if (focusedId != null) {
      const fi = agentToIdx.get(focusedId);
      if (fi !== undefined) newSet.add(fi);
    }
    if (focusedBId != null) {
      const fi = agentToIdx.get(focusedBId);
      if (fi !== undefined) newSet.add(fi);
    }

    // Cap at maxActiveEffects — keep closest buildings
    if (newSet.size > maxActiveEffects) {
      const withDist = Array.from(newSet).map((idx) => {
        const b = buildings[idx];
        const dx = cx - b.position[0];
        const dz = cz - b.position[2];
        return { idx, distSq: dx * dx + dz * dz };
      });
      withDist.sort((a, b) => a.distSq - b.distSq);
      newSet.clear();
      for (let i = 0; i < maxActiveEffects && i < withDist.length; i++) {
        newSet.add(withDist[i].idx);
      }
      // Re-add focused buildings (always visible)
      if (focusedId != null) {
        const fi = agentToIdx.get(focusedId);
        if (fi !== undefined) newSet.add(fi);
      }
      if (focusedBId != null) {
        const fi = agentToIdx.get(focusedBId);
        if (fi !== undefined) newSet.add(fi);
      }
    }

    // Check if changed
    let changed = newSet.size !== activeSetRef.current.size;
    if (!changed) {
      for (const idx of newSet) {
        if (!activeSetRef.current.has(idx)) {
          changed = true;
          break;
        }
      }
    }

    if (changed) {
      activeSetRef.current = newSet;
      setActiveIndices(Array.from(newSet));
    }
  });

  if (introMode) return null;

  return (
    <>
      {activeIndices.map((idx) => {
        const b = buildings[idx];
        if (!b) return null;
        if (hideId === b.agent_id) return null;
        const isFocused = focusedId === b.agent_id || focusedBId === b.agent_id;
        const isDimmed = focusedId != null && !isFocused;
        return (
          <ActiveBuildingEffects
            key={b.agent_id}
            building={b}
            accentColor={accentColor}
            isFocused={isFocused}
            isDimmed={isDimmed}
          />
        );
      })}
    </>
  );
}
