"use client";

import { Suspense, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Billboard, Html, useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { CityBuilding } from "@/types/city";
import { seededRandom } from "@/lib/city-layout";
import { useAgentActivity, type AgentAction, type RaidEvent } from "@/hooks/useAgentActivity";

const MAX_ROAMERS = 40;
const SPRITE_SIZE = 40;
const GROUND_Y = SPRITE_SIZE / 2;
const WANDER_RADIUS = 70;
const SPEED = 8; // units per second
const RAID_SPEED = SPEED * 2.6; // charge at the rival
const RAID_MS = 6000; // how long a raid face-off lasts
const ARRIVAL_DIST = 1;
const BOB_HEIGHT = 1.5;

type PosMap = Map<number, THREE.Vector2>;
type RaidMap = Map<number, { targetId: number; until: number }>;

function fallbackAvatarUrl(agentId: number): string {
  return `https://api.dicebear.com/9.x/pixel-art/png?seed=agent${agentId}&size=256`;
}

const bubbleBody: CSSProperties = {
  background: "#ffffff",
  color: "#0a0a0a",
  fontFamily: "'Silkscreen', monospace",
  fontSize: 9,
  lineHeight: 1.5,
  padding: "5px 8px",
  border: "2px solid #0a0a0a",
  borderRadius: 2,
  maxWidth: 150,
  textAlign: "center",
  boxShadow: "2px 2px 0 rgba(0,0,0,0.4)",
  whiteSpace: "normal",
  userSelect: "none",
  imageRendering: "pixelated",
};
const bubbleTail: CSSProperties = {
  width: 0,
  height: 0,
  margin: "-1px auto 0",
  borderLeft: "5px solid transparent",
  borderRight: "5px solid transparent",
  borderTop: "7px solid #0a0a0a",
};

function SpeechBubble({ text }: { text: string }) {
  return (
    <Html
      position={[0, SPRITE_SIZE * 0.62, 0]}
      center
      distanceFactor={260}
      zIndexRange={[30, 0]}
      style={{ pointerEvents: "none", transition: "opacity 0.2s" }}
    >
      <div style={{ pointerEvents: "none" }}>
        <div style={bubbleBody}>{text}</div>
        <div style={bubbleTail} />
      </div>
    </Html>
  );
}

interface RoamerProps {
  building: CityBuilding;
  onSelect: (agentId: number) => void;
  positions: React.MutableRefObject<PosMap>;
  raidState: React.MutableRefObject<RaidMap>;
  action?: AgentAction;
}

function Roamer({ building, onSelect, positions, raidState, action }: RoamerProps) {
  const id = building.agent_id;
  const url = building.avatar_url ?? fallbackAvatarUrl(id);
  const texture = useTexture(url) as THREE.Texture;
  const groupRef = useRef<THREE.Group>(null);

  const { baseX, baseZ, startX, startZ, phase, standoffX, standoffZ } = useMemo(() => {
    const jx = (seededRandom(id * 7 + 1) - 0.5) * WANDER_RADIUS;
    const jz = (seededRandom(id * 13 + 5) - 0.5) * WANDER_RADIUS;
    const ang = seededRandom(id * 23 + 9) * Math.PI * 2;
    return {
      baseX: building.position[0],
      baseZ: building.position[2],
      startX: building.position[0] + jx,
      startZ: building.position[2] + jz,
      phase: seededRandom(id * 17 + 3) * Math.PI * 2,
      standoffX: Math.cos(ang) * SPRITE_SIZE,
      standoffZ: Math.sin(ang) * SPRITE_SIZE,
    };
  }, [id, building.position]);

  const target = useRef(new THREE.Vector2(startX, startZ));
  const pos = useRef(new THREE.Vector2(startX, startZ));
  const seed = useRef(id * 31 + 11);

  // Register/unregister this roamer's live position so rivals can converge on it.
  useEffect(() => {
    positions.current.set(id, pos.current);
    return () => {
      positions.current.delete(id);
    };
  }, [id, positions]);

  function pickTarget() {
    const a = seededRandom(seed.current++) * Math.PI * 2;
    const r = seededRandom(seed.current++) * WANDER_RADIUS;
    target.current.set(baseX + Math.cos(a) * r, baseZ + Math.sin(a) * r);
  }

  useFrame((state, delta) => {
    const g = groupRef.current;
    if (!g) return;

    const now = Date.now();
    const raid = raidState.current.get(id);
    let speed = SPEED;
    let charging = false;

    if (raid && now < raid.until) {
      const tp = positions.current.get(raid.targetId);
      if (tp) {
        target.current.set(tp.x + standoffX, tp.y + standoffZ);
        speed = RAID_SPEED;
        charging = true;
      }
    } else if (raid) {
      raidState.current.delete(id);
    }

    const step = speed * Math.min(delta, 0.1);
    const dx = target.current.x - pos.current.x;
    const dz = target.current.y - pos.current.y;
    const dist = Math.hypot(dx, dz);

    if (dist < ARRIVAL_DIST) {
      if (!charging) pickTarget(); // hold next to the rival while charging
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
    onSelect(id);
  };

  return (
    <group ref={groupRef} position={[startX, GROUND_Y, startZ]}>
      <Billboard>
        <mesh onPointerDown={handleSelect}>
          <planeGeometry args={[SPRITE_SIZE, SPRITE_SIZE]} />
          <meshBasicMaterial map={texture} transparent toneMapped={false} />
        </mesh>
      </Billboard>
      {action && <SpeechBubble text={action.text} />}
    </group>
  );
}

interface RoamingAgentsProps {
  buildings: CityBuilding[];
  onSelect: (agentId: number) => void;
}

export default function RoamingAgents({ buildings, onSelect }: RoamingAgentsProps) {
  const roamers = useMemo(() => buildings.slice(0, MAX_ROAMERS), [buildings]);
  const { actions, raids } = useAgentActivity();

  const positions = useRef<PosMap>(new Map());
  const raidState = useRef<RaidMap>(new Map());
  const processed = useRef<Set<string>>(new Set());

  // Turn new raid events into convergence animations (attacker charges defender).
  useEffect(() => {
    const now = Date.now();
    for (const r of raids as RaidEvent[]) {
      if (processed.current.has(r.id)) continue;
      processed.current.add(r.id);
      raidState.current.set(r.attacker, { targetId: r.defender, until: now + RAID_MS });
    }
  }, [raids]);

  return (
    <Suspense fallback={null}>
      <group>
        {roamers.map((b) => (
          <Suspense key={b.agent_id} fallback={null}>
            <Roamer
              building={b}
              onSelect={onSelect}
              positions={positions}
              raidState={raidState}
              action={actions[b.agent_id]}
            />
          </Suspense>
        ))}
      </group>
    </Suspense>
  );
}
