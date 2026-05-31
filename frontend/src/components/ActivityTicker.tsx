"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

// Mirrors the indexer broadcast payload on channel 'city-feed':
// { event_type, actor_id, target_id, metadata, timestamp }
interface FeedEvent {
  id: string;
  event_type: string;
  actor_id: number | null;
  target_id: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const MAX_EVENTS = 30;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

function trimAmount(v: unknown): string | null {
  const n = num(v);
  if (n === null) return null;
  // formatEther values arrive as long strings; show up to 4 decimals.
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function actorLabel(e: FeedEvent): string {
  const fromMeta =
    str(e.metadata?.actor_name) ||
    str(e.metadata?.agent_name) ||
    str(e.metadata?.name);
  if (fromMeta) return fromMeta;
  return e.actor_id != null ? `Agent #${e.actor_id}` : "The City";
}

function targetLabel(e: FeedEvent): string {
  const fromMeta =
    str(e.metadata?.target_name) || str(e.metadata?.defender_name);
  if (fromMeta) return fromMeta;
  return e.target_id != null ? `Agent #${e.target_id}` : "the city";
}

function formatEvent(e: FeedEvent): string {
  const actor = actorLabel(e);
  const meta = e.metadata ?? {};

  switch (e.event_type) {
    case "swap":
    case "trade": {
      const inAmt = trimAmount(meta.amountIn);
      const tokenIn = str(meta.tokenIn) ?? "tokens";
      const tokenOut = str(meta.tokenOut) ?? "tokens";
      if (inAmt) {
        return `${actor} swapped ${inAmt} ${tokenIn} → ${tokenOut}`;
      }
      return `${actor} swapped ${tokenIn} → ${tokenOut}`;
    }
    case "raid": {
      const won = meta.attackerWon;
      if (won === true) return `${actor} raided ${targetLabel(e)} and won`;
      if (won === false) return `${actor} raided ${targetLabel(e)} but lost`;
      return `${actor} raided ${targetLabel(e)}`;
    }
    case "raid_result": {
      const won = meta.attackerWon;
      if (won === true) return `${actor} won a raid against ${targetLabel(e)}`;
      if (won === false) return `${actor} failed a raid on ${targetLabel(e)}`;
      return `${actor} raided ${targetLabel(e)}`;
    }
    case "spawn":
      return `${actor} joined the city`;
    case "level_up": {
      const lvl = num(meta.level);
      return lvl != null
        ? `${actor} reached level ${lvl}`
        : `${actor} leveled up`;
    }
    case "liquidity_added": {
      const a = trimAmount(meta.amountA);
      const b = trimAmount(meta.amountB);
      if (a && b) return `${actor} added liquidity (${a} + ${b})`;
      return `${actor} added liquidity`;
    }
    case "liquidity_removed": {
      const a = trimAmount(meta.amountA);
      const b = trimAmount(meta.amountB);
      if (a && b) return `${actor} removed liquidity (${a} + ${b})`;
      return `${actor} removed liquidity`;
    }
    case "pool_created": {
      const ta = str(meta.tokenA);
      const tb = str(meta.tokenB);
      if (ta && tb) return `New pool created: ${ta}/${tb}`;
      return `A new pool was created`;
    }
    case "achievement": {
      const name = str(meta.achievement_name) || str(meta.name);
      return name
        ? `${actor} unlocked "${name}"`
        : `${actor} unlocked an achievement`;
    }
    case "settlement": {
      const pnl = num(meta.net_pnl) ?? num(meta.pnl);
      if (pnl != null) {
        const sign = pnl >= 0 ? "+" : "";
        return `${actor} settled daily P&L ${sign}${pnl.toLocaleString()}`;
      }
      return `${actor} settled daily P&L`;
    }
    default:
      return `${actor} ${e.event_type.replace(/_/g, " ")}`;
  }
}

export default function ActivityTicker() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const cancelledRef = useRef(false);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    cancelledRef.current = false;

    // Initial fetch of recent activity.
    supabase
      .from("activity_feed")
      .select("id, event_type, actor_id, target_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(MAX_EVENTS)
      .then(({ data }) => {
        if (cancelledRef.current || !data) return;
        setEvents((data as FeedEvent[]).filter((e) => e.actor_id != null));
      });

    // Live broadcast on 'city-feed' (indexer emits every event here).
    const channel = supabase.channel("city-feed");
    channel
      .on("broadcast", { event: "*" }, ({ event, payload }) => {
        if (cancelledRef.current) return;
        const p = (payload ?? {}) as Partial<FeedEvent> & {
          timestamp?: string;
        };
        const next: FeedEvent = {
          id: (p.id as string) ?? `${event}-${Date.now()}-${Math.random()}`,
          event_type: (p.event_type as string) ?? event,
          actor_id: (p.actor_id as number) ?? null,
          target_id: (p.target_id as number) ?? null,
          metadata: (p.metadata as Record<string, unknown>) ?? {},
          created_at: p.timestamp ?? new Date().toISOString(),
        };
        if (next.actor_id == null) return; // skip market-maker noise
        setEvents((prev) => [next, ...prev].slice(0, MAX_EVENTS));
      })
      .subscribe();

    return () => {
      cancelledRef.current = true;
      supabase.removeChannel(channel);
    };
  }, []);

  if (events.length === 0) return null;

  const items = events.map((e) => ({ id: e.id, text: formatEvent(e) }));
  // Duplicate the list so the translateX(-50%) loop is seamless.
  const loop = [...items, ...items];
  const durationSec = Math.max(20, items.length * 3);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex h-10 items-center border-t border-[#00ff88]/20 bg-black/90 backdrop-blur-sm">
      <span className="shrink-0 border-r border-[#00ff88]/20 px-3 font-mono text-[10px] uppercase tracking-widest text-[#00ff88]">
        Live
      </span>
      <div className="ticker-mask min-w-0 flex-1 overflow-hidden">
        <div
          className="ticker-scroll flex whitespace-nowrap"
          style={
            { "--ticker-duration": `${durationSec}s` } as React.CSSProperties
          }
        >
          {loop.map((item, i) => (
            <span
              key={`${item.id}-${i}`}
              className="mx-6 font-mono text-[11px] text-white/70"
            >
              <span className="mr-2 text-[#00ff88]">&#9654;</span>
              {item.text}
            </span>
          ))}
        </div>
      </div>

      <style jsx>{`
        .ticker-scroll {
          animation: ticker var(--ticker-duration, 60s) linear infinite;
        }
        .ticker-mask:hover .ticker-scroll {
          animation-play-state: paused;
        }
        @keyframes ticker {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
}

export { formatEvent };
