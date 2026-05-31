"use client";

import { Suspense, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Billboard, useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { CityBuilding } from "@/types/city";
import { seededRandom } from "@/lib/city-layout";

const MAX_ROAMERS = 40;
const SPRITE_SIZE = 40;
const GROUND_Y = SPRITE_SIZE / 2;
const WANDER_RADIUS = 70;
const SPEED = 8; // units per second
const ARRIVAL_DIST = 1;
const BOB_HEIGHT = 1.5;

function fallbackAvatarUrl(agentId: number): string {
  return `https://api.dicebear.com/9.x/pixel-art/png?seed=agent${agentId}&size=256`;
}

interface RoamerProps {
  building: CityBuilding;
  onSelect: (agentId: number) => void;
}

function Roamer({ building, onSelect }: RoamerProps) {
  const url = building.avatar_url ?? fallbackAvatarUrl(building.agent_id);
  const texture = useTexture(url) as THREE.Texture;

  const groupRef = useRef<THREE.Group>(null);

  // Deterministic per-agent ground anchor (building x,z), start offset and phase.
  const { baseX, baseZ, startX, startZ, phase } = useMemo(() => {
    const id = building.agent_id;
    const jx = (seededRandom(id * 7 + 1) - 0.5) * WANDER_RADIUS;
    const jz = (seededRandom(id * 13 + 5) - 0.5) * WANDER_RADIUS;
    return {
      baseX: building.position[0],
      baseZ: building.position[2],
      startX: building.position[0] + jx,
      startZ: building.position[2] + jz,
      phase: seededRandom(id * 17 + 3) * Math.PI * 2,
    };
  }, [building.agent_id, building.position]);

  // Mutable wander state (avoids re-renders + GC churn in the frame loop).
  const target = useRef(new THREE.Vector2(startX, startZ));
  const pos = useRef(new THREE.Vector2(startX, startZ));
  const seed = useRef(building.agent_id * 31 + 11);

  function pickTarget() {
    const a = seededRandom(seed.current++) * Math.PI * 2;
    const r = seededRandom(seed.current++) * WANDER_RADIUS;
    target.current.set(baseX + Math.cos(a) * r, baseZ + Math.sin(a) * r);
  }

  useFrame((state, delta) => {
    const g = groupRef.current;
    if (!g) return;

    const step = SPEED * Math.min(delta, 0.1);
    const dx = target.current.x - pos.current.x;
    const dz = target.current.y - pos.current.y;
    const dist = Math.hypot(dx, dz);

    if (dist < ARRIVAL_DIST) {
      pickTarget();
    } else {
      const t = Math.min(1, step / dist);
      pos.current.x += dx * t;
      pos.current.y += dz * t;
    }

    const bob = Math.sin(state.clock.elapsedTime * 2 + phase) * BOB_HEIGHT;
    g.position.set(pos.current.x, GROUND_Y + bob, pos.current.y);
  });

  const handleSelect = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onSelect(building.agent_id);
  };

  return (
    <group ref={groupRef} position={[startX, GROUND_Y, startZ]}>
      <Billboard>
        <mesh onPointerDown={handleSelect}>
          <planeGeometry args={[SPRITE_SIZE, SPRITE_SIZE]} />
          <meshBasicMaterial map={texture} transparent toneMapped={false} />
        </mesh>
      </Billboard>
    </group>
  );
}

interface RoamingAgentsProps {
  buildings: CityBuilding[];
  onSelect: (agentId: number) => void;
}

export default function RoamingAgents({ buildings, onSelect }: RoamingAgentsProps) {
  const roamers = useMemo(() => buildings.slice(0, MAX_ROAMERS), [buildings]);

  return (
    <Suspense fallback={null}>
      <group>
        {roamers.map((b) => (
          <Suspense key={b.agent_id} fallback={null}>
            <Roamer building={b} onSelect={onSelect} />
          </Suspense>
        ))}
      </group>
    </Suspense>
  );
}
