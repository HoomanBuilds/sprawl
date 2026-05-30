"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { AgentRecord } from "@/types/agent";

type AgentResult = Pick<
  AgentRecord,
  "agent_id" | "name" | "district" | "xp_level"
>;

const MAX_RESULTS = 6;
const DEBOUNCE_MS = 250;

interface Props {
  onSelectAgent: (agentId: number) => void;
}

export default function AgentSearch({ onSelectAgent }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AgentResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [searched, setSearched] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Debounced query against Supabase: ilike on name OR exact agent_id match.
  useEffect(() => {
    const term = query.trim();
    if (term.length === 0) {
      setResults([]);
      setLoading(false);
      setSearched(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const handle = setTimeout(async () => {
      const supabase = getSupabaseBrowser();

      // Support "#12" or "12" as an exact id lookup, plus name matching.
      const idTerm = term.replace(/^#/, "");
      const asId = /^\d+$/.test(idTerm) ? Number(idTerm) : null;

      const filters = [`name.ilike.%${term}%`];
      if (asId !== null) filters.push(`agent_id.eq.${asId}`);

      const { data, error } = await supabase
        .from("agents")
        .select("agent_id, name, district, xp_level")
        .or(filters.join(","))
        .limit(MAX_RESULTS);

      if (cancelled) return;
      setLoading(false);
      setSearched(true);
      if (error || !data) {
        setResults([]);
        return;
      }
      setResults(data as AgentResult[]);
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  function handleSelect(agentId: number) {
    onSelectAgent(agentId);
    setOpen(false);
    setQuery("");
    setResults([]);
    setSearched(false);
  }

  const showDropdown = open && query.trim().length > 0;

  return (
    <div
      ref={containerRef}
      className="fixed left-1/2 top-4 z-50 w-80 -translate-x-1/2"
    >
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-[#00ff88]">
          &#9906;
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search agent name or #id"
          className="w-full rounded-lg border border-white/10 bg-black/80 py-2 pl-8 pr-3 font-mono text-xs text-white outline-none backdrop-blur-sm transition-colors placeholder:text-white/30 focus:border-[#00ff88] focus:ring-1 focus:ring-[#00ff88]/60"
        />
      </div>

      {showDropdown && (
        <div className="mt-1 overflow-hidden rounded-lg border border-white/10 bg-black/90 backdrop-blur-sm">
          {loading && (
            <p className="px-3 py-2 font-mono text-[11px] text-white/40">
              Searching...
            </p>
          )}

          {!loading && searched && results.length === 0 && (
            <p className="px-3 py-2 font-mono text-[11px] text-white/40">
              No agents found
            </p>
          )}

          {!loading &&
            results.map((agent) => (
              <button
                key={agent.agent_id}
                onClick={() => handleSelect(agent.agent_id)}
                className="flex w-full items-center justify-between gap-2 border-b border-white/5 px-3 py-2 text-left transition-colors last:border-0 hover:bg-[#00ff88]/10"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-white/90">
                  {agent.name || `Agent #${agent.agent_id}`}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-[#00ff88]">
                  #{agent.agent_id}
                </span>
                {agent.district && (
                  <span className="shrink-0 font-mono text-[10px] text-white/30">
                    {agent.district}
                  </span>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
