"use client";

import { useRef, useEffect, useMemo, useCallback } from "react";
import type { CityBuilding } from "@/types/city";

const ACCENT = "#00ff88";
const SIZE = 160;
const PAD = 10;

// District -> dot color. Covers both the DeFi-category districts the layout
// generator emits and the generic dex/lending/yield/bridge/general set.
const DISTRICT_RGB: Record<string, [number, number, number]> = {
  dex: [59, 130, 246],
  trading: [59, 130, 246],
  lending: [168, 85, 247],
  balanced: [168, 85, 247],
  yield: [34, 197, 94],
  bridge: [6, 182, 212],
  arbitrage: [6, 182, 212],
  degen: [239, 68, 68],
  downtown: [251, 191, 36],
  general: [120, 120, 130],
};

function districtColor(district: string | undefined): [number, number, number] {
  if (district && DISTRICT_RGB[district]) return DISTRICT_RGB[district];
  return DISTRICT_RGB.general;
}

interface MiniMapProps {
  buildings: CityBuilding[];
  focusedAgentId?: number | null;
  cameraPosition?: [number, number, number];
  onSelectAgent?: (agentId: number) => void;
}

interface PlottedDot {
  px: number;
  py: number;
  agentId: number;
  rgb: [number, number, number];
}

export default function MiniMap({
  buildings,
  focusedAgentId = null,
  cameraPosition,
  onSelectAgent,
}: MiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Stable world bounds derived from building positions (X / Z plane).
  const bounds = useMemo(() => {
    if (buildings.length === 0) return null;
    let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
    for (const b of buildings) {
      const bx = b.position[0];
      const bz = b.position[2];
      if (bx < x0) x0 = bx;
      if (bx > x1) x1 = bx;
      if (bz < z0) z0 = bz;
      if (bz > z1) z1 = bz;
    }
    const m = 20;
    return { x0: x0 - m, x1: x1 + m, z0: z0 - m, z1: z1 + m };
  }, [buildings]);

  // World (x, z) -> canvas pixel, preserving aspect ratio and centering.
  const w2p = useCallback(
    (wx: number, wz: number): [number, number] => {
      if (!bounds) return [SIZE / 2, SIZE / 2];
      const ww = bounds.x1 - bounds.x0 || 1;
      const wh = bounds.z1 - bounds.z0 || 1;
      const ds = SIZE - PAD * 2;
      const s = Math.min(ds / ww, ds / wh);
      const ox = PAD + (ds - ww * s) / 2;
      const oy = PAD + (ds - wh * s) / 2;
      return [ox + (wx - bounds.x0) * s, oy + (wz - bounds.z0) * s];
    },
    [bounds]
  );

  // Pre-compute the plotted dots once per building/bounds change.
  const dots = useMemo<PlottedDot[]>(() => {
    if (!bounds) return [];
    return buildings.map((b) => {
      const [px, py] = w2p(b.position[0], b.position[2]);
      return { px, py, agentId: b.agent_id, rgb: districtColor(b.district) };
    });
  }, [buildings, bounds, w2p]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = "rgba(6, 8, 10, 0.85)";
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Building dots
    for (const d of dots) {
      const focused = focusedAgentId != null && d.agentId === focusedAgentId;
      ctx.beginPath();
      ctx.arc(d.px, d.py, focused ? 4 : 2, 0, Math.PI * 2);
      if (focused) {
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = ACCENT;
        ctx.stroke();
      } else {
        ctx.fillStyle = `rgb(${d.rgb[0]}, ${d.rgb[1]}, ${d.rgb[2]})`;
        ctx.fill();
      }
    }

    // Camera indicator (only if provided)
    if (cameraPosition) {
      const [cx, cy] = w2p(cameraPosition[0], cameraPosition[2]);
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = ACCENT;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,255,136,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [dots, focusedAgentId, cameraPosition, w2p]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Map a click on the canvas to the nearest building dot.
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onSelectAgent || dots.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * SIZE;
      const my = ((e.clientY - rect.top) / rect.height) * SIZE;
      let best: PlottedDot | null = null;
      let bestDist = Infinity;
      for (const d of dots) {
        const dist = (d.px - mx) ** 2 + (d.py - my) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          best = d;
        }
      }
      // Only select if within a reasonable hit radius (~8px).
      if (best && bestDist <= 64) onSelectAgent(best.agentId);
    },
    [dots, onSelectAgent]
  );

  if (buildings.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 select-none">
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onClick={handleClick}
        className="rounded-md"
        style={{
          width: SIZE,
          height: SIZE,
          border: "1px solid rgba(0,255,136,0.25)",
          cursor: onSelectAgent ? "pointer" : "default",
          boxShadow: "0 0 20px rgba(0,0,0,0.5)",
        }}
      />
    </div>
  );
}
