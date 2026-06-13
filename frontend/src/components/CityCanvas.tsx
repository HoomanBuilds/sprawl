"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stats, PerformanceMonitor } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import CityScene from "./CityScene";
import RoamingAgents from "./RoamingAgents";
import Streetscape from "./Streetscape";
import type { FocusInfo } from "./CityScene";
import type { CityBuilding } from "@/types/city";
import { seededRandom, generateStreetscape } from "@/lib/city-layout";
import { usePerfMode } from "@/lib/perfMode";
import { useAgentPresence } from "@/hooks/useAgentPresence";

// `seededRandom` is re-exported for decoration jitter parity with the layout engine.
void seededRandom;

// ─── Theme Definitions ───────────────────────────────────────

export const THEME_NAMES = [
  "Emerald",
  "Midnight",
  "Sunset",
  "Neon",
  "Sunrise",
  "Daylight",
] as const;

export interface BuildingColors {
  windowLit: string[];
  windowOff: string;
  face: string;
  roof: string;
  accent: string;
}

interface CityTheme {
  sky: [number, string][];
  fogColor: string;
  fogNear: number;
  fogFar: number;
  ambientColor: string;
  ambientIntensity: number;
  sunColor: string;
  sunIntensity: number;
  sunPos: [number, number, number];
  fillColor: string;
  fillIntensity: number;
  fillPos: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  groundColor: string;
  grid1: string;
  grid2: string;
  roadMarkingColor: string;
  sidewalkColor: string;
  building: BuildingColors;
  waterColor: string;
  waterEmissive: string;
  dockColor: string;
}

const THEMES: CityTheme[] = [
  // 0 – Emerald
  {
    sky: [
      [0, "#000804"], [0.15, "#001408"], [0.30, "#002810"], [0.42, "#003c1c"],
      [0.52, "#004828"], [0.60, "#003820"], [0.75, "#002014"], [0.90, "#001008"],
      [1, "#000604"],
    ],
    fogColor: "#0a2014", fogNear: 400, fogFar: 3500,
    ambientColor: "#40a060", ambientIntensity: 0.55,
    sunColor: "#70d090", sunIntensity: 0.75, sunPos: [300, 100, -250],
    fillColor: "#20a080", fillIntensity: 0.35, fillPos: [-200, 60, 200],
    hemiSky: "#50b068", hemiGround: "#183020", hemiIntensity: 0.5,
    groundColor: "#1e3020", grid1: "#2c4838", grid2: "#243828",
    roadMarkingColor: "#60c080",
    sidewalkColor: "#404848",
    building: {
      windowLit: ["#0e4429", "#006d32", "#26a641", "#39d353", "#c8e64a"],
      windowOff: "#060e08", face: "#0c1810", roof: "#1e4028",
      accent: "#f0c060",
    },
    waterColor: "#082018", waterEmissive: "#0a3020", dockColor: "#3a2818",
  },
  // 1 – Midnight
  {
    sky: [
      [0, "#000206"], [0.15, "#020814"], [0.30, "#061428"], [0.45, "#0c2040"],
      [0.55, "#102850"], [0.65, "#0c2040"], [0.80, "#061020"], [1, "#020608"],
    ],
    fogColor: "#0a1428", fogNear: 400, fogFar: 3500,
    ambientColor: "#4060b0", ambientIntensity: 0.55,
    sunColor: "#7090d0", sunIntensity: 0.75, sunPos: [300, 120, -200],
    fillColor: "#304080", fillIntensity: 0.3, fillPos: [-200, 60, 200],
    hemiSky: "#5080a0", hemiGround: "#202830", hemiIntensity: 0.5,
    groundColor: "#242c38", grid1: "#344050", grid2: "#2c3848",
    roadMarkingColor: "#8090a0",
    sidewalkColor: "#484c58",
    building: {
      windowLit: ["#a0c0f0", "#80a0e0", "#6080c8", "#c0d8f8", "#e0e8ff"],
      windowOff: "#0c0e18", face: "#101828", roof: "#2a3858",
      accent: "#6090e0",
    },
    waterColor: "#0a1830", waterEmissive: "#0a2050", dockColor: "#3a2818",
  },
  // 2 – Sunset
  {
    sky: [
      [0, "#0c0614"], [0.15, "#1c0e30"], [0.28, "#3a1850"], [0.38, "#6a3060"],
      [0.46, "#a05068"], [0.52, "#d07060"], [0.57, "#e89060"], [0.62, "#f0b070"],
      [0.68, "#f0c888"], [0.75, "#c08060"], [0.85, "#603030"], [1, "#180c10"],
    ],
    fogColor: "#80405a", fogNear: 400, fogFar: 3500,
    ambientColor: "#e0a080", ambientIntensity: 0.7,
    sunColor: "#f0b070", sunIntensity: 1.0, sunPos: [400, 120, -300],
    fillColor: "#6050a0", fillIntensity: 0.35, fillPos: [-200, 80, 200],
    hemiSky: "#d09080", hemiGround: "#4a2828", hemiIntensity: 0.55,
    groundColor: "#3a3038", grid1: "#504048", grid2: "#443838",
    roadMarkingColor: "#d0a840",
    sidewalkColor: "#585058",
    building: {
      windowLit: ["#f8d880", "#f0b860", "#e89840", "#d07830", "#f0c060"],
      windowOff: "#1a1018", face: "#281828", roof: "#604050",
      accent: "#c8e64a",
    },
    waterColor: "#1a2040", waterEmissive: "#102060", dockColor: "#4a3020",
  },
  // 3 – Neon
  {
    sky: [
      [0, "#06001a"], [0.15, "#100028"], [0.30, "#200440"], [0.42, "#380650"],
      [0.52, "#500860"], [0.60, "#380648"], [0.75, "#180230"], [0.90, "#0c0118"],
      [1, "#06000c"],
    ],
    fogColor: "#1a0830", fogNear: 400, fogFar: 3500,
    ambientColor: "#8040c0", ambientIntensity: 0.6,
    sunColor: "#c050e0", sunIntensity: 0.85, sunPos: [300, 100, -200],
    fillColor: "#00c0d0", fillIntensity: 0.4, fillPos: [-250, 60, 200],
    hemiSky: "#9040d0", hemiGround: "#201028", hemiIntensity: 0.5,
    groundColor: "#2c2038", grid1: "#3c2c50", grid2: "#342440",
    roadMarkingColor: "#c060e0",
    sidewalkColor: "#484058",
    building: {
      windowLit: ["#ff40c0", "#c040ff", "#00e0ff", "#40ff80", "#ff8040"],
      windowOff: "#0a0814", face: "#180830", roof: "#3c1858",
      accent: "#e040c0",
    },
    waterColor: "#0c0830", waterEmissive: "#1008a0", dockColor: "#2a1838",
  },
  // 4 – Sunrise (warm dawn — bright and golden, not dark)
  {
    sky: [
      [0, "#1a1830"], [0.18, "#3a2a50"], [0.32, "#7a4a68"], [0.43, "#c0705e"],
      [0.51, "#f0a060"], [0.58, "#f8c878"], [0.70, "#f4dca0"], [0.85, "#ccc0b0"],
      [1, "#7a7a90"],
    ],
    fogColor: "#cf9c78", fogNear: 450, fogFar: 4000,
    ambientColor: "#e8b894", ambientIntensity: 0.75,
    sunColor: "#ffd0a0", sunIntensity: 1.05, sunPos: [420, 70, -320],
    fillColor: "#8088c8", fillIntensity: 0.4, fillPos: [-220, 70, 220],
    hemiSky: "#e8b8a8", hemiGround: "#5a4a48", hemiIntensity: 0.6,
    groundColor: "#463e42", grid1: "#5c4e52", grid2: "#4e4246",
    roadMarkingColor: "#f4c468",
    sidewalkColor: "#62565a",
    building: {
      windowLit: ["#ffd890", "#ffb870", "#f09850", "#ffe0a0", "#ffc060"],
      windowOff: "#181016", face: "#2a1e24", roof: "#5e424c",
      accent: "#ff9050",
    },
    waterColor: "#3a3052", waterEmissive: "#5a4064", dockColor: "#4a3020",
  },
  // 5 – Daylight (bright blue-sky day — clean, aesthetic, sunlit)
  {
    sky: [
      [0, "#2f6fb0"], [0.28, "#4f93d2"], [0.5, "#7cb9e8"], [0.7, "#b2daf0"],
      [0.85, "#d8ecf8"], [1, "#ecf5fc"],
    ],
    fogColor: "#d2e4f1", fogNear: 700, fogFar: 5200,
    ambientColor: "#ffffff", ambientIntensity: 0.95,
    sunColor: "#fff4e0", sunIntensity: 1.35, sunPos: [320, 420, -220],
    fillColor: "#a6c4e4", fillIntensity: 0.5, fillPos: [-220, 160, 220],
    hemiSky: "#bfdcff", hemiGround: "#9aa88c", hemiIntensity: 0.95,
    groundColor: "#9cae8a", grid1: "#aebfa0", grid2: "#a6b598",
    roadMarkingColor: "#ffffff",
    sidewalkColor: "#cbcfc6",
    building: {
      windowLit: ["#bcd8f0", "#d8e8f8", "#ffffff", "#cfe4f5", "#e8f2ff"],
      windowOff: "#7d8c9c", face: "#cdd5dd", roof: "#bcc4cc",
      accent: "#ff8c2a",
    },
    waterColor: "#5aa0d0", waterEmissive: "#3a80c0", dockColor: "#8a7050",
  },
];

// ─── Sky Dome ────────────────────────────────────────────────

function SkyDome({ stops }: { stops: [number, string][] }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 512;
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    for (const [stop, color] of stops) g.addColorStop(stop, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
  }, [stops]);

  useEffect(() => {
    return () => {
      mat.map?.dispose();
      mat.dispose();
    };
  }, [mat]);

  // Center sky dome on whichever camera is currently rendering
  const onBeforeRender = useCallback((_renderer: THREE.WebGLRenderer, _scene: THREE.Scene, camera: THREE.Camera) => {
    if (meshRef.current) {
      meshRef.current.position.copy(camera.position);
    }
  }, []);

  return (
    <mesh ref={meshRef} material={mat} renderOrder={-1} onBeforeRender={onBeforeRender}>
      <sphereGeometry args={[3500, 32, 48]} />
    </mesh>
  );
}

// ─── Sprawl Monument (central glowing pillar at city center) ─────

function SprawlMonument({ height }: { height: number }) {
  const coreRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (coreRef.current) {
      const t = state.clock.elapsedTime;
      const mat = coreRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.7 + Math.sin(t * 1.2) * 0.2;
    }
  });
  return (
    <group position={[0, 0, 0]}>
      {/* Central pillar — height scales with total city $SPRAWL */}
      <mesh ref={coreRef} position={[0, height / 2, 0]}>
        <boxGeometry args={[8, height, 8]} />
        <meshStandardMaterial
          color="#00ff88"
          emissive="#00ff44"
          emissiveIntensity={0.8}
          transparent
          opacity={0.7}
        />
      </mesh>
      {/* Sky beam above the monument */}
      <mesh position={[0, height + 250, 0]}>
        <boxGeometry args={[2, 500, 2]} />
        <meshBasicMaterial color="#00ff88" transparent opacity={0.25} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ─── Intro Flyover ──────────────────────────────────────────

const INTRO_DURATION = 14; // seconds

// SprawlMonument sits at city center (0, 0, 0).
const MONUMENT_X = 0;
const MONUMENT_Z = 0;
const TARGET_X = MONUMENT_X;
const TARGET_Z = MONUMENT_Z;
const TARGET_Y = 200;
const MONUMENT_TOP_Y = 400;

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

// Smootherstep (Perlin): zero velocity AND zero acceleration at both ends
function introEase(t: number): number {
  const s = Math.max(0, Math.min(1, t));
  return s * s * s * (s * (s * 6 - 15) + 10);
}

// Pre-allocated temp vectors for IntroFlyover (avoid GC in useFrame)
const _introPos = new THREE.Vector3();
const _introLook = new THREE.Vector3();

function IntroFlyover({ onEnd }: { onEnd: () => void }) {
  const { camera } = useThree();
  const elapsed = useRef(0);
  const ended = useRef(false);

  // Build CatmullRom curves once; centripetal = no cusps on uneven spacing
  const { posCurve, lookCurve } = useMemo(() => {
    const posPoints = INTRO_WAYPOINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const lookPoints = INTRO_LOOK_TARGETS.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const posCurve = new THREE.CatmullRomCurve3(posPoints, false, "centripetal");
    const lookCurve = new THREE.CatmullRomCurve3(lookPoints, false, "centripetal");
    posCurve.getLength();
    lookCurve.getLength();
    return { posCurve, lookCurve };
  }, []);

  useEffect(() => {
    camera.position.set(...INTRO_WAYPOINTS[0]);
    camera.lookAt(...INTRO_LOOK_TARGETS[0]);
  }, [camera]);

  useFrame((_, delta) => {
    if (ended.current) return;
    elapsed.current += delta;

    const rawT = Math.min(elapsed.current / INTRO_DURATION, 1);
    const t = introEase(rawT);

    posCurve.getPointAt(t, _introPos);
    lookCurve.getPointAt(t, _introLook);

    camera.position.copy(_introPos);
    camera.lookAt(_introLook);

    if (elapsed.current >= INTRO_DURATION && !ended.current) {
      ended.current = true;
      onEnd();
    }
  });

  return null;
}

// ─── Camera Focus (smooth pan to a focused building) ─────────

function CameraFocus({
  buildings,
  focusedBuilding,
  controlsRef,
  autoOrbit,
}: {
  buildings: CityBuilding[];
  focusedBuilding: number | null;
  controlsRef: React.RefObject<any>;
  autoOrbit?: boolean;
}) {
  const { camera } = useThree();
  const startPos = useRef(new THREE.Vector3());
  const startLook = useRef(new THREE.Vector3());
  const endPos = useRef(new THREE.Vector3());
  const endLook = useRef(new THREE.Vector3());
  const progress = useRef(1);
  const active = useRef(false);

  const buildingsRef = useRef(buildings);
  buildingsRef.current = buildings;
  const framedId = useRef<number | null>(null);

  useEffect(() => {
    if (autoOrbit && controlsRef.current) controlsRef.current.autoRotate = true;

    if (focusedBuilding == null) {
      framedId.current = null;
      if (controlsRef.current) controlsRef.current.autoRotate = true;
      return;
    }

    if (framedId.current === focusedBuilding) return;
    const b = buildingsRef.current.find((x) => x.agent_id === focusedBuilding);
    if (!b) return; // not placed yet — re-runs when buildings load (deps)
    framedId.current = focusedBuilding;

    startPos.current.copy(camera.position);
    if (controlsRef.current) startLook.current.copy(controlsRef.current.target);

    // Frame the building: look at mid-height, back off proportional to size
    const lookX = b.position[0];
    const lookY = b.height * 0.6;
    const lookZ = b.position[2];
    endLook.current.set(lookX, lookY, lookZ);

    const backoff = Math.max(120, b.height * 1.1);
    endPos.current.set(lookX + backoff * 0.7, lookY + backoff * 0.55, lookZ + backoff * 0.7);

    progress.current = 0;
    active.current = true;
    if (controlsRef.current && !autoOrbit) controlsRef.current.autoRotate = false;
  }, [focusedBuilding, buildings, camera, controlsRef, autoOrbit]);

  useFrame((_, delta) => {
    if (!active.current) return;
    progress.current = Math.min(1, progress.current + delta * 1.2);
    const t = introEase(progress.current);

    camera.position.lerpVectors(startPos.current, endPos.current, t);
    if (controlsRef.current) {
      controlsRef.current.target.lerpVectors(startLook.current, endLook.current, t);
      controlsRef.current.update();
    }

    if (progress.current >= 1) active.current = false;
  });

  return null;
}

// ─── Ground ──────────────────────────────────────────────────

function Ground({ color, grid1, grid2 }: { color: string; grid1: string; grid2: string }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
        <planeGeometry args={[20000, 20000]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} roughness={0.95} />
      </mesh>
      <gridHelper args={[4000, 200, grid1, grid2]} position={[0, -0.5, 0]} />
    </group>
  );
}

// ─── Orbit Scene (default explore camera) ────────────────────

function OrbitScene({
  buildings,
  focusedBuilding,
  autoOrbit,
}: {
  buildings: CityBuilding[];
  focusedBuilding: number | null;
  autoOrbit?: boolean;
}) {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();

  // Reset camera on mount — wide panorama from front, monument centered
  useEffect(() => {
    camera.position.set(-800, 700, -1000);
    camera.lookAt(TARGET_X, TARGET_Y, TARGET_Z);
  }, [camera]);

  return (
    <>
      <CameraFocus buildings={buildings} focusedBuilding={focusedBuilding} controlsRef={controlsRef} autoOrbit={autoOrbit} />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.06}
        minDistance={40}
        maxDistance={2500}
        maxPolarAngle={Math.PI / 2.1}
        target={[TARGET_X, TARGET_Y, TARGET_Z]}
        autoRotate
        autoRotateSpeed={0.15}
      />
    </>
  );
}

// ─── City Exposure (dim scene when city sleeps) ──────────────

function CityExposure({ cityEnergy }: { cityEnergy: number }) {
  const gl = useThree((s) => s.gl);
  const targetRef = useRef(1.3);
  targetRef.current = 0.4 + 0.9 * Math.min(1, cityEnergy); // 0.4 at sleep, 1.3 at full

  useFrame(() => {
    const current = gl.toneMappingExposure;
    const target = targetRef.current;
    if (Math.abs(current - target) > 0.001) {
      gl.toneMappingExposure += (target - current) * 0.02;
    }
  });

  return null;
}

// ─── Main Canvas ─────────────────────────────────────────────

interface CityCanvasProps {
  buildings: CityBuilding[];
  focusedBuilding?: number | null;
  onBuildingClick?: (building: CityBuilding) => void;
  onFocusInfo?: (info: FocusInfo) => void;
  theme?: number;
  liveAgentIds?: Set<number>;
  totalCitySprawl?: number;
  cityEnergy?: number;
  holdRise?: boolean;
  introMode?: boolean;
  onIntroEnd?: () => void;
  autoOrbit?: boolean;
  contained?: boolean;
}

export default function CityCanvas({
  buildings,
  focusedBuilding,
  onBuildingClick,
  onFocusInfo,
  theme = 0,
  liveAgentIds,
  totalCitySprawl = 0,
  cityEnergy,
  holdRise,
  introMode,
  onIntroEnd,
  autoOrbit,
  contained,
}: CityCanvasProps) {
  const t = THEMES[theme] ?? THEMES[0];
  const showPerf = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("perf");
  const { mode: perfMode, markDecline } = usePerfMode();
  const lowPerf = perfMode === "low";
  const [dpr, setDpr] = useState(1);
  const [bloomEnabled, setBloomEnabled] = useState(false);

  // Live agent presence (green dots + window boost). Falls back to the prop if
  // a caller supplies its own set; otherwise subscribe to the shared hook.
  const presenceFromHook = useAgentPresence();
  const liveIds = liveAgentIds ?? presenceFromHook;

  // Apply low-perf preset as soon as mode resolves (after mount)
  useEffect(() => {
    if (lowPerf) {
      setDpr(0.75);
      setBloomEnabled(false);
    }
  }, [lowPerf]);

  // Central monument height scales with total city $SPRAWL
  const monumentHeight = useMemo(
    () => Math.min(600, 50 + Math.sqrt(Math.max(0, totalCitySprawl) / 1000) * 100),
    [totalCitySprawl]
  );

  // Roads, sidewalks, lamps, trees, cars — deterministic from the block grid.
  const decorations = useMemo(
    () => generateStreetscape(buildings.length),
    [buildings.length]
  );

  const handleSelect = useCallback(
    (id: number) => {
      const b = buildings.find((x) => x.agent_id === id);
      if (b && onBuildingClick) onBuildingClick(b);
    },
    [buildings, onBuildingClick]
  );

  return (
    <Canvas
      camera={{ position: [-400, 450, -600], fov: 55, near: 0.5, far: 15000 }}
      dpr={dpr}
      gl={{ antialias: false, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.3 }}
      style={
        contained
          ? { position: "absolute", inset: 0, width: "100%", height: "100%" }
          : { position: "fixed", inset: 0, width: "100vw", height: "100vh" }
      }
    >
      {showPerf && <Stats />}
      <CityExposure cityEnergy={cityEnergy ?? 1} />
      <PerformanceMonitor
        onIncline={() => {
          if (lowPerf) return; // stay in low-perf preset; don't bump DPR or enable bloom
          setDpr(1.25);
          setBloomEnabled(true);
        }}
        onDecline={() => {
          setDpr(lowPerf ? 0.6 : 0.75);
          setBloomEnabled(false);
          markDecline();
        }}
      />
      <fog attach="fog" args={[t.fogColor, t.fogNear, t.fogFar]} key={`fog-${theme}`} />

      <ambientLight intensity={t.ambientIntensity * 3} color={t.ambientColor} />
      <directionalLight position={t.sunPos} intensity={t.sunIntensity * 3.5} color={t.sunColor} />
      <directionalLight position={t.fillPos} intensity={t.fillIntensity * 3} color={t.fillColor} />
      <hemisphereLight args={[t.hemiSky, t.hemiGround, t.hemiIntensity * 3.5]} key={`hemi-${theme}`} />

      <SkyDome key={`sky-${theme}`} stops={t.sky} />

      {introMode && <IntroFlyover onEnd={onIntroEnd ?? (() => {})} />}

      {!introMode && (
        <OrbitScene buildings={buildings} focusedBuilding={focusedBuilding ?? null} autoOrbit={autoOrbit} />
      )}

      <Ground key={`ground-${theme}`} color={t.groundColor} grid1={t.grid1} grid2={t.grid2} />

      {/* Roads, sidewalks, lamps, trees, cars */}
      <Streetscape
        key={`streets-${theme}`}
        decorations={decorations}
        groundColor={t.groundColor}
        sidewalkColor={t.sidewalkColor}
        roadMarkingColor={t.roadMarkingColor}
      />

      {/* Central monument — height scales with total city $SPRAWL */}
      <SprawlMonument height={monumentHeight} />

      <CityScene
        buildings={buildings}
        colors={t.building}
        focusedBuilding={focusedBuilding}
        accentColor={t.building.accent}
        onBuildingClick={onBuildingClick}
        onFocusInfo={onFocusInfo}
        introMode={introMode}
        holdRise={holdRise}
        liveAgentIds={liveIds}
        cityEnergy={cityEnergy}
        lowPerf={lowPerf}
      />

      {!introMode && <RoamingAgents buildings={buildings} onSelect={handleSelect} />}

      {bloomEnabled && !lowPerf && (
        <EffectComposer multisampling={0}>
          <Bloom
            mipmapBlur
            luminanceThreshold={1}
            luminanceSmoothing={0.3}
            intensity={1.2 * Math.max(0.1, cityEnergy ?? 1)}
          />
        </EffectComposer>
      )}
    </Canvas>
  );
}
