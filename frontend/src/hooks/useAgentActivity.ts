"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

export interface AgentAction {
  text: string;
  kind: string;
  ts: number;
}

export interface RaidEvent {
  id: string;
  attacker: number;
  defender: number;
  won: boolean;
  ts: number;
}

const BUBBLE_TTL = 7000;

type FeedRow = {
  id?: number | string;
  actor_id?: number | null;
  target_id?: number | null;
  event_type: string;
  metadata?: Record<string, unknown> | null;
};

function trim(s: string): string {
  return s.length > 90 ? s.slice(0, 88) + "…" : s;
}

function bubbleText(ev: FeedRow): string {
  const m = ev.metadata ?? {};
  const rationale = typeof m.rationale === "string" ? m.rationale : "";
  switch (ev.event_type) {
    case "swap":
    case "trade":
      return rationale
        ? trim(rationale)
        : `Trading ${String(m.tokenIn ?? "?")}→${String(m.tokenOut ?? "?")}`;
    case "raid_success":
      return "⚔️ Raid won!";
    case "raid_failed":
      return "⚔️ Raid repelled";
    case "settlement":
      return "💰 Daily settle";
    case "liquidity_added":
    case "provide_liquidity":
      return "💧 Providing liquidity";
    case "spawn":
      return "✨ Just spawned";
    default:
      return rationale ? trim(rationale) : ev.event_type.replace(/_/g, " ");
  }
}

// Subscribes to activity_feed inserts and exposes:
//  - actions: latest action text per agent (for speech bubbles), auto-expiring
//  - raids:   recent raid events (attacker -> defender) for war animations
export function useAgentActivity() {
  const [actions, setActions] = useState<Record<number, AgentAction>>({});
  const [raids, setRaids] = useState<RaidEvent[]>([]);
  const raidsRef = useRef<RaidEvent[]>([]);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    const channel = sb
      .channel(`agent-activity-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_feed" },
        (payload) => {
          const ev = payload.new as FeedRow;
          if (ev.actor_id == null) return;
          const ts = Date.now();
          const actor = ev.actor_id;

          setActions((prev) => {
            const next = { ...prev, [actor]: { text: bubbleText(ev), kind: ev.event_type, ts } };
            if (
              (ev.event_type === "raid_success" || ev.event_type === "raid_failed") &&
              ev.target_id != null
            ) {
              const won = ev.event_type === "raid_success";
              next[ev.target_id] = {
                text: won ? "🛡️ Under attack!" : "🛡️ Defended!",
                kind: "defend",
                ts,
              };
            }
            return next;
          });

          if (
            (ev.event_type === "raid_success" || ev.event_type === "raid_failed") &&
            ev.target_id != null
          ) {
            const rev: RaidEvent = {
              id: String(ev.id ?? ts),
              attacker: actor,
              defender: ev.target_id,
              won: ev.event_type === "raid_success",
              ts,
            };
            raidsRef.current = [...raidsRef.current.slice(-9), rev];
            setRaids(raidsRef.current);
          }
        }
      )
      .subscribe();

    const prune = setInterval(() => {
      const now = Date.now();
      setActions((prev) => {
        let changed = false;
        const next: Record<number, AgentAction> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (now - v.ts < BUBBLE_TTL) next[Number(k)] = v;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1500);

    return () => {
      clearInterval(prune);
      sb.removeChannel(channel);
    };
  }, []);

  return { actions, raids };
}
