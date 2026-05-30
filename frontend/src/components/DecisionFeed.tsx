"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { MANTLE_SEPOLIA_EXPLORER } from "@/lib/config";

// Canonical activity_feed columns (migration 007): event_type, actor_id,
// target_id, metadata. Agent name + tx_hash (when present) live in metadata.
interface FeedEvent {
  id: string;
  event_type: string;
  actor_id: number | null;
  target_id: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const MAX_EVENTS = 50;

function eventLabel(type: string): string {
  switch (type) {
    case "swap":
    case "trade":
      return "[SWAP]";
    case "raid_win":
      return "[RAID W]";
    case "raid_loss":
      return "[RAID L]";
    case "raid":
      return "[RAID]";
    case "spawn":
      return "[SPAWN]";
    case "level_up":
      return "[LVL UP]";
    case "achievement":
      return "[ACHV]";
    case "liquidity":
      return "[LP]";
    case "settlement":
      return "[P&L]";
    default:
      return "[•]";
  }
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export default function DecisionFeed({ contained = false }: { contained?: boolean } = {}) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [names, setNames] = useState<Record<number, string>>({});
  const namesRef = useRef(names);
  namesRef.current = names;

  // Resolve an agent name: prefer metadata, fall back to the lookup map.
  function resolveName(e: FeedEvent): string {
    const fromMeta =
      str(e.metadata?.actor_name) ||
      str(e.metadata?.agent_name) ||
      str(e.metadata?.name);
    if (fromMeta) return fromMeta;
    if (e.actor_id != null && namesRef.current[e.actor_id]) {
      return namesRef.current[e.actor_id];
    }
    return e.actor_id != null ? `Agent #${e.actor_id}` : "The City";
  }

  function metaText(e: FeedEvent): string {
    return (
      str(e.metadata?.description) ||
      str(e.metadata?.summary) ||
      str(e.metadata?.action) ||
      e.event_type.replace(/_/g, " ")
    );
  }

  function txHash(e: FeedEvent): string | null {
    return str(e.metadata?.tx_hash) || str(e.metadata?.txHash);
  }

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let cancelled = false;

    // Agent name lookup so feed rows resolve to readable names.
    supabase
      .from("agents")
      .select("agent_id, name")
      .then(({ data }) => {
        if (cancelled || !data) return;
        const map: Record<number, string> = {};
        for (const row of data) {
          if (row.name) map[row.agent_id as number] = row.name as string;
        }
        setNames(map);
      });

    // Initial load + polling fallback (covers missed realtime frames).
    const loadFeed = () => {
      supabase
        .from("activity_feed")
        .select("id, event_type, actor_id, target_id, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(MAX_EVENTS)
        .then(({ data }) => {
          if (cancelled || !data) return;
          setEvents(data as FeedEvent[]);
        });
    };
    loadFeed();
    const pollId = setInterval(loadFeed, 15_000);

    // Realtime broadcast on 'city-feed' (indexer broadcasts every event here).
    const channel = supabase.channel("city-feed");
    channel
      .on("broadcast", { event: "*" }, ({ event, payload }) => {
        if (cancelled) return;
        const p = (payload ?? {}) as Partial<FeedEvent> & { timestamp?: string };
        const next: FeedEvent = {
          id: (p.id as string) ?? `${event}-${Date.now()}-${Math.random()}`,
          event_type: (p.event_type as string) ?? event,
          actor_id: (p.actor_id as number) ?? null,
          target_id: (p.target_id as number) ?? null,
          metadata: (p.metadata as Record<string, unknown>) ?? {},
          created_at: p.timestamp ?? new Date().toISOString(),
        };
        setEvents((prev) => [next, ...prev].slice(0, MAX_EVENTS));
      })
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(pollId);
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div
      className={
        contained
          ? "flex h-full w-full flex-col overflow-y-auto border border-white/10 bg-black/40 p-3"
          : "fixed right-4 top-4 z-50 w-80 max-h-[70vh] overflow-y-auto rounded-lg border border-white/10 bg-black/80 p-3 backdrop-blur-sm"
      }
    >
      <h3 className="mb-2 font-mono text-xs uppercase tracking-wider text-white/60">
        Live Feed
      </h3>
      {events.length === 0 && (
        <p className="font-mono text-xs text-white/30">Waiting for activity...</p>
      )}
      {events.map((e) => {
        const tx = txHash(e);
        return (
          <div
            key={e.id}
            className="flex items-start gap-2 border-b border-white/5 py-1.5 last:border-0"
          >
            <span className="shrink-0 font-mono text-[10px] text-green-400">
              {eventLabel(e.event_type)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-xs text-white/90">
                <span className="text-cyan-400">{resolveName(e)}</span>{" "}
                {metaText(e)}
              </p>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="font-mono text-[10px] text-white/40">
                  {timeAgo(e.created_at)}
                </span>
                {tx && (
                  <a
                    href={`${MANTLE_SEPOLIA_EXPLORER}/tx/${tx}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[10px] text-blue-400 hover:text-blue-300"
                  >
                    tx
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
