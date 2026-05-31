"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CityDecoration } from "@/lib/city-layout";

// ─── Shared temp objects ──────────────────────────────────────
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler();
const _c = new THREE.Color();

const FLAT_ROT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

// Flat ground planes (asphalt / sidewalk / road markings). Geometry is a unit
// XY plane laid flat; each instance scales to [size.x, size.z] and sits at its y.
function FlatInstanced({
  items,
  geometry,
  material,
}: {
  items: CityDecoration[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      _p.set(it.position[0], it.position[1], it.position[2]);
      _s.set(it.size?.[0] ?? 1, it.size?.[1] ?? 1, 1);
      _m.compose(_p, FLAT_ROT, _s);
      mesh.setMatrixAt(i, _m);
    }
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [items]);
  if (items.length === 0) return null;
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} frustumCulled={false} />;
}

// Upright primitives (lamp / tree / car parts). Geometry is pre-translated so
// its base rests at y=0; each instance gets a y-rotation and optional tint.
function UprightInstanced({
  items,
  geometry,
  material,
  palette,
}: {
  items: CityDecoration[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  palette?: string[];
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      _p.set(it.position[0], it.position[1], it.position[2]);
      _e.set(0, it.rotation ?? 0, 0);
      _q.setFromEuler(_e);
      _s.set(1, 1, 1);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      if (palette) {
        _c.set(palette[(it.variant ?? 0) % palette.length]);
        mesh.setColorAt(i, _c);
      }
    }
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items, palette]);
  if (items.length === 0) return null;
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} frustumCulled={false} />;
}

interface StreetscapeProps {
  decorations: CityDecoration[];
  groundColor: string;
  sidewalkColor: string;
  roadMarkingColor: string;
}

export default function Streetscape({
  decorations,
  groundColor,
  sidewalkColor,
  roadMarkingColor,
}: StreetscapeProps) {
  // Split decorations by type once.
  const groups = useMemo(() => {
    const g: Record<CityDecoration["type"], CityDecoration[]> = {
      asphalt: [],
      sidewalk: [],
      roadMarking: [],
      streetLamp: [],
      tree: [],
      car: [],
    };
    for (const d of decorations) g[d.type].push(d);
    return g;
  }, [decorations]);

  // Geometries (theme-independent). Upright parts are pre-translated to base@0.
  const geos = useMemo(() => {
    const mk = (g: THREE.BufferGeometry, y: number) => {
      g.translate(0, y, 0);
      return g;
    };
    return {
      plane: new THREE.PlaneGeometry(1, 1),
      lampPole: mk(new THREE.CylinderGeometry(0.3, 0.45, 18, 6), 9),
      lampHead: mk(new THREE.BoxGeometry(1.6, 0.9, 1.6), 18.6),
      treeTrunk: mk(new THREE.CylinderGeometry(1, 1.3, 9, 6), 4.5),
      treeCanopy: mk(new THREE.ConeGeometry(6, 11, 8), 14.5),
      carBody: mk(new THREE.BoxGeometry(8, 2.5, 3.5), 1.25),
      carCabin: mk(new THREE.BoxGeometry(5, 2, 3.2), 3.1),
    };
  }, []);

  // Materials (theme-tinted where it matters).
  const mats = useMemo(() => {
    const asphalt = _c.set(groundColor).clone().multiplyScalar(0.55);
    return {
      asphalt: new THREE.MeshStandardMaterial({
        color: asphalt,
        emissive: asphalt,
        emissiveIntensity: 0.12,
        roughness: 0.98,
      }),
      sidewalk: new THREE.MeshStandardMaterial({
        color: sidewalkColor,
        emissive: sidewalkColor,
        emissiveIntensity: 0.18,
        roughness: 0.9,
      }),
      roadMarking: new THREE.MeshStandardMaterial({
        color: roadMarkingColor,
        emissive: roadMarkingColor,
        emissiveIntensity: 0.9,
        toneMapped: false,
      }),
      lampPole: new THREE.MeshStandardMaterial({ color: "#3a3a42", emissive: "#3a3a42", emissiveIntensity: 0.25 }),
      lampHead: new THREE.MeshStandardMaterial({
        color: "#ffd27a",
        emissive: "#ffd27a",
        emissiveIntensity: 2.4,
        toneMapped: false,
      }),
      treeTrunk: new THREE.MeshStandardMaterial({ color: "#5a3a1e", emissive: "#3a2614", emissiveIntensity: 0.25 }),
      treeCanopy: new THREE.MeshStandardMaterial({ color: "#2d5a1e", emissive: "#163010", emissiveIntensity: 0.35 }),
      carBody: new THREE.MeshStandardMaterial({ color: "#888", emissive: "#222", emissiveIntensity: 0.2 }),
      carCabin: new THREE.MeshStandardMaterial({ color: "#888", emissive: "#222", emissiveIntensity: 0.2 }),
    };
  }, [groundColor, sidewalkColor, roadMarkingColor]);

  const treePalette = useMemo(() => ["#2d5a1e", "#1e6b2e", "#3a7a2a"], []);
  const carPalette = useMemo(() => ["#c03030", "#3050a0", "#d0d0d0", "#2a2a2a"], []);

  // Dispose geometries + materials on unmount / theme change.
  useEffect(() => {
    return () => {
      for (const g of Object.values(geos)) g.dispose();
    };
  }, [geos]);
  useEffect(() => {
    return () => {
      for (const m of Object.values(mats)) m.dispose();
    };
  }, [mats]);

  if (decorations.length === 0) return null;

  return (
    <group>
      <FlatInstanced items={groups.asphalt} geometry={geos.plane} material={mats.asphalt} />
      <FlatInstanced items={groups.sidewalk} geometry={geos.plane} material={mats.sidewalk} />
      <FlatInstanced items={groups.roadMarking} geometry={geos.plane} material={mats.roadMarking} />

      <UprightInstanced items={groups.streetLamp} geometry={geos.lampPole} material={mats.lampPole} />
      <UprightInstanced items={groups.streetLamp} geometry={geos.lampHead} material={mats.lampHead} />

      <UprightInstanced items={groups.tree} geometry={geos.treeTrunk} material={mats.treeTrunk} />
      <UprightInstanced items={groups.tree} geometry={geos.treeCanopy} material={mats.treeCanopy} palette={treePalette} />

      <UprightInstanced items={groups.car} geometry={geos.carBody} material={mats.carBody} palette={carPalette} />
      <UprightInstanced items={groups.car} geometry={geos.carCabin} material={mats.carCabin} palette={carPalette} />
    </group>
  );
}
