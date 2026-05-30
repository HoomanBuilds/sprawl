"use client";

import { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ─── LED Texture (inlined, was imported from SkyAds) ─────────

const LED_FONT = 28;
const LED_H = 48;
const LED_DOT = 4;
const LED_VISIBLE = 512;

function createLedTexture(text: string, color: string, bgColor: string) {
  const tmp = document.createElement("canvas");
  const tmpCtx = tmp.getContext("2d")!;
  tmpCtx.font = `bold ${LED_FONT}px monospace`;
  const rawTw = Math.ceil(tmpCtx.measureText(text).width);

  const needsScroll = rawTw > LED_VISIBLE - 30;

  // For continuous scrolling: tile = "TEXT /// " so RepeatWrapping loops seamlessly
  const loopText = needsScroll ? text + "  ///  " : text;
  const tw = Math.ceil(tmpCtx.measureText(loopText).width);
  const W = needsScroll ? tw : LED_VISIBLE;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = LED_H;
  const ctx = canvas.getContext("2d")!;

  // Dark background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, LED_H);

  // Top/bottom LED border accent
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.4;
  ctx.fillRect(0, 0, W, 2);
  ctx.fillRect(0, LED_H - 2, W, 2);
  ctx.globalAlpha = 1;

  // Text — bright colored on dark bg
  ctx.fillStyle = color;
  ctx.font = `bold ${LED_FONT}px monospace`;
  ctx.textBaseline = "middle";
  if (needsScroll) {
    ctx.textAlign = "left";
    ctx.fillText(loopText, 0, LED_H / 2);
  } else {
    ctx.textAlign = "center";
    ctx.fillText(loopText, W / 2, LED_H / 2);
  }

  // LED grid overlay — dark gaps between each dot cell
  ctx.fillStyle = "#000000";
  ctx.globalAlpha = 0.45;
  for (let x = LED_DOT - 1; x < W; x += LED_DOT) ctx.fillRect(x, 0, 1, LED_H);
  for (let y = LED_DOT - 1; y < LED_H; y += LED_DOT) ctx.fillRect(0, y, W, 1);
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  if (needsScroll) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.x = LED_VISIBLE / W;
  }

  return { tex, needsScroll };
}

interface Props {
  width: number;
  height: number;
  depth: number;
  attackerName: string;
  tagStyle: string;
}

// ─── Style Definitions ───────────────────────────────────────

interface TagTheme {
  color: string;
  bg: string;
  frameColor: string;
  frameEmissive: string;
  intensity: number;
}

const TAG_THEMES: Record<string, TagTheme> = {
  default: {
    color: "#ff30d0",
    bg: "#120818",
    frameColor: "#2a1530",
    frameEmissive: "#cc20a0",
    intensity: 1.8,
  },
  tag_neon: {
    color: "#00ffcc",
    bg: "#001a16",
    frameColor: "#0a2a24",
    frameEmissive: "#00ddaa",
    intensity: 2.0,
  },
  tag_fire: {
    color: "#ff8800",
    bg: "#180c00",
    frameColor: "#2a1800",
    frameEmissive: "#cc6600",
    intensity: 1.8,
  },
  tag_gold: {
    color: "#ffcc00",
    bg: "#161200",
    frameColor: "#2a2200",
    frameEmissive: "#ddaa00",
    intensity: 1.8,
  },
};

// ─── Component ───────────────────────────────────────────────

export default function RaidTag3D({ width, height, depth, attackerName, tagStyle }: Props) {
  const theme = TAG_THEMES[tagStyle] ?? TAG_THEMES.default;

  const tagText = `@${attackerName.toUpperCase()} WAS HERE`;

  const { tex, needsScroll } = useMemo(
    () => createLedTexture(tagText, theme.color, theme.bg),
    [tagText, theme.color, theme.bg],
  );

  const ledMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#000000",
        emissiveMap: tex,
        emissive: "#ffffff",
        emissiveIntensity: theme.intensity,
        toneMapped: false,
      }),
    [tex, theme.intensity],
  );

  useEffect(() => {
    return () => { tex.dispose(); ledMat.dispose(); };
  }, [tex, ledMat]);

  // Scroll if text is long
  useFrame(({ clock }) => {
    if (needsScroll) {
      tex.offset.x = (clock.elapsedTime * 0.15) % 1;
    }
  });

  // Sizing: wide panel on the building face
  const panelW = Math.max(10, width * 0.9);
  const panelH = Math.max(3, panelW * 0.2);
  const frameT = 0.35;
  const yPos = height * 0.82;
  const zFront = depth / 2 + 0.2;
  const zBack = -(depth / 2 + 0.2);

  return (
    <group>
      {/* ── Front face ── */}
      <group position={[0, yPos, zFront]}>
        {/* Frame */}
        <mesh position={[0, 0, -0.2]}>
          <boxGeometry args={[panelW + frameT * 2, panelH + frameT * 2, 0.3]} />
          <meshStandardMaterial
            color={theme.frameColor}
            emissive={theme.frameEmissive}
            emissiveIntensity={0.3}
            metalness={0.6}
            roughness={0.4}
          />
        </mesh>
        {/* LED screen */}
        <mesh position={[0, 0, 0.02]} material={ledMat}>
          <planeGeometry args={[panelW, panelH]} />
        </mesh>
      </group>

      {/* ── Back face ── */}
      <group position={[0, yPos, zBack]}>
        <mesh position={[0, 0, 0.2]}>
          <boxGeometry args={[panelW + frameT * 2, panelH + frameT * 2, 0.3]} />
          <meshStandardMaterial
            color={theme.frameColor}
            emissive={theme.frameEmissive}
            emissiveIntensity={0.3}
            metalness={0.6}
            roughness={0.4}
          />
        </mesh>
        <mesh position={[0, 0, -0.02]} material={ledMat} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[panelW, panelH]} />
        </mesh>
      </group>
    </group>
  );
}
