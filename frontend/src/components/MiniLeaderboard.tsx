"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

const ACCENT = "#00ff88";

interface AgentRow {
  agent_id: number;
  name: string | null;
  sprawl_lifetime_earned: number;
  xp_level: number;
  total_volume: number;
  raid_wins: number;
}

interface LeaderboardMode {
  label: string;
  field: keyof Pick<
    AgentRow,
    "sprawl_lifetime_earned" | "xp_level" | "total_volume" | "raid_wins"
  >;
  format: (v: number) => string;
}

const MODES: LeaderboardMode[] = [
  {
    label: "$SPRAWL Earned",
    field: "sprawl_lifetime_earned",
    format: (v) => (v / 1e18).toLocaleString(),
  },
  {
    label: "Level",
    field: "xp_level",
    format: (v) => `Lv ${v.toLocaleString()}`,
  },
  {
    label: "Volume",
    field: "total_volume",
    format: (v) => v.toLocaleString(),
  },
  {
    label: "Raid Wins",
    field: "raid_wins",
    format: (v) => v.toLocaleString(),
  },
];

const ROTATE_MS = 10_000;
const REFETCH_MS = 15_000;

interface MiniLeaderboardProps {
  onSelectAgent?: (agentId: number) => void;
  contained?: boolean;
}

export default function MiniLeaderboard({ onSelectAgent, contained }: MiniLeaderboardProps) {
  const [modeIndex, setModeIndex] = useState(0);
  const [rows, setRows] = useState<AgentRow[]>([]);

  const mode = MODES[modeIndex];

  const fetchRows = useCallback(async (field: LeaderboardMode["field"]) => {
    const supabase = getSupabaseBrowser();
    const { data, error } = await supabase
      .from("agents")
      .select(
        "agent_id, name, sprawl_lifetime_earned, xp_level, total_volume, raid_wins"
      )
      .order(field, { ascending: false })
      .limit(5);
    if (!error && data) setRows(data as AgentRow[]);
  }, []);

  // Refetch whenever the mode changes, then keep it live on an interval.
  useEffect(() => {
    fetchRows(mode.field);
    const id = setInterval(() => fetchRows(mode.field), REFETCH_MS);
    return () => clearInterval(id);
  }, [mode.field, fetchRows]);

  // Auto-rotate ranking mode every 10s.
  useEffect(() => {
    const id = setInterval(() => {
      setModeIndex((i) => (i + 1) % MODES.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className={
        contained
          ? "h-full w-full select-none font-mono p-2 overflow-y-auto"
          : "fixed left-4 top-4 z-40 w-[240px] select-none font-mono"
      }
    >
      <div
        className="rounded-md border bg-black/80 backdrop-blur-sm"
        style={{ borderColor: "rgba(0,255,136,0.25)" }}
      >
        {/* Header */}
        <button
          onClick={() => setModeIndex((i) => (i + 1) % MODES.length)}
          className="flex w-full items-center justify-between px-3 py-2 transition-colors hover:bg-white/5"
          style={{ borderBottom: "1px solid rgba(0,255,136,0.15)" }}
        >
          <span
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: ACCENT }}
          >
            {mode.label}
          </span>
          <span className="flex items-center gap-1">
            {MODES.map((_, i) => (
              <span
                key={i}
                className="block h-1 w-1 rounded-full transition-all"
                style={{
                  backgroundColor: i === modeIndex ? ACCENT : "rgba(255,255,255,0.2)",
                  width: i === modeIndex ? 8 : 4,
                }}
              />
            ))}
          </span>
        </button>

        {/* Rows */}
        <div>
          {rows.length === 0 ? (
            <p className="px-3 py-2 text-[10px] text-white/30">Loading agents...</p>
          ) : (
            rows.map((r, i) => (
              <button
                key={r.agent_id}
                onClick={() => onSelectAgent?.(r.agent_id)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left transition-colors hover:bg-white/5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="w-4 shrink-0 text-[10px] font-bold"
                    style={{
                      color:
                        i === 0
                          ? "#ffd700"
                          : i === 1
                          ? "#c0c0c0"
                          : i === 2
                          ? "#cd7f32"
                          : ACCENT,
                    }}
                  >
                    #{i + 1}
                  </span>
                  <span className="truncate text-[11px] text-white/90">
                    {r.name || `Agent #${r.agent_id}`}
                  </span>
                </span>
                <span className="ml-2 shrink-0 text-[10px] text-white/50">
                  {mode.format(Number(r[mode.field] ?? 0))}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
