"use client";

import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CityBuilding } from "@/types/city";

const DOT_SIZE = 4;
const _matrix = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);

interface LiveDotsProps {
  buildings: CityBuilding[];
  liveAgentIds: Set<number>;
}

export default function LiveDots({ buildings, liveAgentIds }: LiveDotsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Indices of buildings whose agent is currently live
  const activeIndices = useMemo(() => {
    const indices: number[] = [];
    for (let i = 0; i < buildings.length; i++) {
      if (liveAgentIds.has(buildings[i].agent_id)) {
        indices.push(i);
      }
    }
    return indices;
  }, [buildings, liveAgentIds]);

  const count = activeIndices.length;

  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#4ade80",
        transparent: true,
        opacity: 1,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  // Position dots
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;

    _scale.set(DOT_SIZE, DOT_SIZE, DOT_SIZE);
    for (let i = 0; i < count; i++) {
      const b = buildings[activeIndices[i]];
      _pos.set(b.position[0], b.height + 12, b.position[2]);
      _matrix.compose(_pos, _quat, _scale);
      mesh.setMatrixAt(i, _matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = count;
  }, [buildings, activeIndices, count]);

  // Pulse animation
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const pulse = 0.6 + 0.4 * Math.sin(t * 2);
    if (count > 0) mat.opacity = pulse;
  });

  // Cleanup
  useEffect(() => {
    return () => {
      geo.dispose();
      mat.dispose();
    };
  }, [geo, mat]);

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geo, mat, count]}
      frustumCulled={false}
      renderOrder={999}
    />
  );
}
