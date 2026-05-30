"use client";

import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createWindowAtlas, FocusBeacon } from "./Building3D";
import InstancedBuildings from "./InstancedBuildings";
import InstancedLabels from "./InstancedLabels";
import EffectsLayer from "./EffectsLayer";
import LiveDots from "./LiveDots";
import DropBeacon from "./DropBeacon";
import type { CityBuilding } from "@/types/city";
import type { BuildingColors } from "./CityCanvas";

const GRID_CELL_SIZE = 200;

// Pre-allocated temp vector for focus info projection
const _position = new THREE.Vector3();

export interface FocusInfo {
  dist: number;
  screenX: number;
  screenY: number;
}

// ─── Spatial Grid ───────────────────────────────────────────────

interface GridIndex {
  cells: Map<string, number[]>;
  cellSize: number;
}

function buildSpatialGrid(buildings: CityBuilding[], cellSize: number): GridIndex {
  const cells = new Map<string, number[]>();
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    const cx = Math.floor(b.position[0] / cellSize);
    const cz = Math.floor(b.position[2] / cellSize);
    const key = `${cx},${cz}`;
    let arr = cells.get(key);
    if (!arr) {
      arr = [];
      cells.set(key, arr);
    }
    arr.push(i);
  }
  return { cells, cellSize };
}

// ─── Pre-computed building data ─────────────────────────────────

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

// ─── Component ──────────────────────────────────────────────────

interface CitySceneProps {
  buildings: CityBuilding[];
  colors: BuildingColors;
  focusedBuilding?: number | null;
  focusedBuildingB?: number | null;
  hideEffectsFor?: number | null;
  accentColor?: string;
  onBuildingClick?: (building: CityBuilding) => void;
  onFocusInfo?: (info: FocusInfo) => void;
  introMode?: boolean;
  flyMode?: boolean;
  holdRise?: boolean;
  liveAgentIds?: Set<number>;
  cityEnergy?: number;
  dimAll?: boolean;
  lowPerf?: boolean;
}

export default function CityScene({
  buildings,
  colors,
  focusedBuilding,
  focusedBuildingB,
  hideEffectsFor,
  accentColor,
  onBuildingClick,
  onFocusInfo,
  introMode,
  flyMode,
  holdRise,
  liveAgentIds,
  cityEnergy,
  dimAll,
  lowPerf,
}: CitySceneProps) {
  // Single atlas texture for all building windows (created once per theme)
  const atlasTexture = useMemo(() => createWindowAtlas(colors), [colors]);

  // Spatial grid for effects LOD
  const grid = useMemo(() => buildSpatialGrid(buildings, GRID_CELL_SIZE), [buildings]);

  // Lookup for focus info emission
  const lookup = useMemo(() => buildLookup(buildings), [buildings]);

  // Cache focus ids
  const focusedId = focusedBuilding ?? null;
  const focusedBId = focusedBuildingB ?? null;

  // Focused building data (for FocusBeacon positioning)
  const focusedBuildingData = useMemo(() => {
    if (focusedId == null) return null;
    const idx = lookup.indexByAgentId.get(focusedId);
    if (idx === undefined) return null;
    return buildings[idx];
  }, [focusedId, lookup, buildings]);

  const focusedBuildingBData = useMemo(() => {
    if (focusedBId == null) return null;
    const idx = lookup.indexByAgentId.get(focusedBId);
    if (idx === undefined) return null;
    return buildings[idx];
  }, [focusedBId, lookup, buildings]);

  const lastFocusUpdate = useRef(-1);

  // Emit focus info for focused buildings (throttled to 5Hz)
  useFrame(({ camera, clock, size }) => {
    const elapsed = clock.elapsedTime;
    if (elapsed - lastFocusUpdate.current < 0.2) return;
    lastFocusUpdate.current = elapsed;

    if (!onFocusInfo || (focusedId == null && focusedBId == null)) return;

    const fi = focusedId != null ? lookup.indexByAgentId.get(focusedId) : undefined;
    const fbi = focusedBId != null ? lookup.indexByAgentId.get(focusedBId) : undefined;
    const targetIdx = fi ?? fbi;
    if (targetIdx === undefined) return;

    const b = buildings[targetIdx];
    const dx = camera.position.x - b.position[0];
    const dz = camera.position.z - b.position[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    _position.set(b.position[0], b.height * 0.65, b.position[2]);
    _position.project(camera);
    const screenX = (_position.x * 0.5 + 0.5) * size.width;
    const screenY = (-_position.y * 0.5 + 0.5) * size.height;
    onFocusInfo({ dist, screenX, screenY });
  });

  // Dispose atlas on theme change
  useEffect(() => {
    return () => atlasTexture.dispose();
  }, [atlasTexture]);

  return (
    <>
      {/* All buildings: single instanced draw call with custom shader */}
      <InstancedBuildings
        buildings={buildings}
        colors={colors}
        atlasTexture={atlasTexture}
        focusedBuilding={focusedBuilding}
        focusedBuildingB={focusedBuildingB}
        introMode={introMode}
        onBuildingClick={onBuildingClick}
        holdRise={holdRise}
        liveAgentIds={liveAgentIds}
        cityEnergy={cityEnergy}
        dimAll={dimAll}
      />

      {/* Live presence dots above active buildings */}
      {liveAgentIds && liveAgentIds.size > 0 && (
        <LiveDots buildings={buildings} liveAgentIds={liveAgentIds} />
      )}

      {/* All labels: single instanced draw call with billboard shader */}
      <InstancedLabels
        buildings={buildings}
        introMode={introMode}
        flyMode={flyMode}
        focusedBuilding={focusedBuilding}
        focusedBuildingB={focusedBuildingB}
      />

      {/* Effects: React components only for nearby buildings with items */}
      <EffectsLayer
        buildings={buildings}
        grid={grid}
        colors={colors}
        accentColor={accentColor ?? colors.accent ?? "#00ff88"}
        focusedBuilding={focusedBuilding}
        focusedBuildingB={focusedBuildingB}
        hideEffectsFor={hideEffectsFor}
        introMode={introMode}
        flyMode={flyMode}
        lowPerf={lowPerf}
      />

      {/* FocusBeacon: standalone, only when a building is focused */}
      {!introMode && focusedBuildingData && (
        <group position={[focusedBuildingData.position[0], 0, focusedBuildingData.position[2]]}>
          <FocusBeacon
            height={focusedBuildingData.height}
            width={focusedBuildingData.width}
            depth={focusedBuildingData.depth}
            accentColor={accentColor ?? "#00ff88"}
          />
        </group>
      )}

      {!introMode && focusedBuildingBData && focusedBuildingBData !== focusedBuildingData && (
        <group position={[focusedBuildingBData.position[0], 0, focusedBuildingBData.position[2]]}>
          <FocusBeacon
            height={focusedBuildingBData.height}
            width={focusedBuildingBData.width}
            depth={focusedBuildingBData.depth}
            accentColor={accentColor ?? "#00ff88"}
          />
        </group>
      )}

      {/* Drop beacons: pillars of light on buildings with active raid tags */}
      {!introMode && buildings.filter((b) => b.active_raid_tag).map((b) => (
        <group key={`drop-${b.agent_id}`} position={[b.position[0], 0, b.position[2]]}>
          <DropBeacon rarity={b.active_raid_tag!.tag_style} height={b.height} />
        </group>
      ))}
    </>
  );
}
