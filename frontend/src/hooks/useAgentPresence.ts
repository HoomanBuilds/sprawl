"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

const PRESENCE_WINDOW_MS = 5 * 60 * 1000; // active within last 5 min

function fiveMinutesAgoISO(): string {
  return new Date(Date.now() - PRESENCE_WINDOW_MS).toISOString();
}

function isRecent(lastActionAt: unknown): boolean {
  if (typeof lastActionAt !== "string") return false;
  return Date.now() - new Date(lastActionAt).getTime() < PRESENCE_WINDOW_MS;
}

// Returns the set of agent_ids whose last_action_at is within the last 5 minutes.
// Backed by an initial query + Supabase Realtime on agents UPDATE + periodic
// re-fetch (so stale agents drop out of the set).
export function useAgentPresence(): Set<number> {
  const [activeAgents, setActiveAgents] = useState<Set<number>>(new Set());

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let cancelled = false;

    const refetch = () => {
      supabase
        .from("agents")
        .select("agent_id")
        .gt("last_action_at", fiveMinutesAgoISO())
        .then(({ data }) => {
          if (cancelled || !data) return;
          setActiveAgents(new Set(data.map((d) => d.agent_id as number)));
        });
    };

    refetch();

    const channel = supabase
      .channel(`agent-presence-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agents" },
        (payload) => {
          if (cancelled) return;
          const row = payload.new as { agent_id?: number; last_action_at?: unknown };
          if (row.agent_id == null) return;
          if (isRecent(row.last_action_at)) {
            setActiveAgents((prev) => {
              if (prev.has(row.agent_id!)) return prev;
              const next = new Set(prev);
              next.add(row.agent_id!);
              return next;
            });
          }
        }
      )
      .subscribe();

    // Periodic cleanup so agents that go idle leave the set.
    const cleanup = setInterval(refetch, 60_000);

    return () => {
      cancelled = true;
      clearInterval(cleanup);
      supabase.removeChannel(channel);
    };
  }, []);

  return activeAgents;
}
