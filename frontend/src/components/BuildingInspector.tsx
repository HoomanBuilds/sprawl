"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { MANTLE_SEPOLIA_EXPLORER } from "@/lib/config";
import type { AgentRecord, PolicyRule } from "@/types/agent";

interface BuildingInspectorProps {
  agent_id: number;
  onClose?: () => void;
}

interface Trade {
  id: string;
  action: string;
  token_in: string | null;
  token_out: string | null;
  pnl_realized: number | null;
  tx_hash: string | null;
  created_at: string;
}

const STRATEGY_LABELS: Record<number, string> = {
  0: "Preset Policy",
  1: "Rules Engine",
  2: "LLM-Driven",
};

const STRATEGY_BADGE: Record<number, string> = {
  0: "bg-emerald-500/20 text-emerald-300",
  1: "bg-blue-500/20 text-blue-300",
  2: "bg-fuchsia-500/20 text-fuchsia-300",
};

function shortTx(hash: string): string {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function num(v: number | bigint | null | undefined): number {
  return v == null ? 0 : Number(v);
}

export default function BuildingInspector({ agent_id, onClose }: BuildingInspectorProps) {
  const [agent, setAgent] = useState<AgentRecord | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [raidTag, setRaidTag] = useState<{ attacker_name: string; expires_at: string } | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let cancelled = false;
    setLoading(true);

    Promise.all([
      supabase.from("agents").select("*").eq("agent_id", agent_id).single(),
      supabase
        .from("trade_history")
        .select("id, action, token_in, token_out, pnl_realized, tx_hash, created_at")
        .eq("agent_id", agent_id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("raid_tags")
        .select("attacker_name, expires_at")
        .eq("building_agent_id", agent_id)
        .eq("active", true)
        .maybeSingle(),
    ]).then(([agentRes, tradesRes, raidRes]) => {
      if (cancelled) return;
      if (agentRes.data) setAgent(agentRes.data as unknown as AgentRecord);
      if (tradesRes.data) setTrades(tradesRes.data as unknown as Trade[]);
      if (raidRes.data) setRaidTag(raidRes.data as { attacker_name: string; expires_at: string });
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [agent_id]);

  const netPnl = num(agent?.net_pnl);
  const pnlColor = netPnl > 0 ? "text-green-400" : netPnl < 0 ? "text-red-400" : "text-white/60";
  const pnlPrefix = netPnl > 0 ? "+" : "";
  const strategy = (agent?.strategy_type ?? 0) as number;
  const rules: PolicyRule[] = agent?.policy_config?.rules ?? [];

  return (
    <div className="fixed left-4 top-4 z-50 w-96 max-h-[85vh] overflow-y-auto rounded-lg border border-white/10 bg-black/90 p-4 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-mono text-sm font-bold text-white">
          {agent?.name || `Agent #${agent_id}`}
        </h2>
        <button
          onClick={onClose}
          className="font-mono text-xs text-white/40 hover:text-white"
          aria-label="Close"
        >
          [X]
        </button>
      </div>

      {loading && <p className="font-mono text-xs text-white/30">Loading agent...</p>}

      {!loading && agent && (
        <>
          {/* Badges */}
          <div className="mb-3 flex flex-wrap gap-2">
            <span
              className={`rounded px-2 py-0.5 font-mono text-[10px] ${STRATEGY_BADGE[strategy] ?? "bg-white/10 text-white/70"}`}
            >
              {STRATEGY_LABELS[strategy] ?? "Unknown"}
            </span>
            <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/70">
              Lvl {agent.xp_level}
            </span>
            <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/70">
              {agent.district}
            </span>
            <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/70">
              ERC-8004 #{agent.agent_id}
            </span>
          </div>

          {/* Stats grid */}
          <div className="mb-4 grid grid-cols-2 gap-2">
            <StatBox label="Net P&L" value={`${pnlPrefix}${netPnl.toLocaleString()}`} valueClass={pnlColor} />
            <StatBox label="Reputation" value={`${agent.reputation_score}/100`} />
            <StatBox label="Raid W/L" value={`${agent.raid_wins}/${agent.raid_losses}`} />
            <StatBox label="XP" value={agent.xp_total.toLocaleString()} />
            <StatBox label="$SPRAWL Earned" value={num(agent.sprawl_lifetime_earned).toLocaleString()} />
            <StatBox label="Volume" value={num(agent.total_volume).toLocaleString()} />
          </div>

          {/* Owner */}
          <div className="mb-3">
            <p className="font-mono text-[10px] uppercase text-white/40">Wallet</p>
            <a
              href={`${MANTLE_SEPOLIA_EXPLORER}/address/${agent.wallet_address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-blue-400 hover:text-blue-300"
            >
              {agent.wallet_address.slice(0, 8)}…{agent.wallet_address.slice(-6)}
            </a>
          </div>

          {/* Active raid tag */}
          {raidTag && (
            <div className="mb-3 rounded border border-red-500/30 bg-red-900/30 p-2">
              <p className="font-mono text-[10px] text-red-400">
                Tagged by {raidTag.attacker_name} · expires{" "}
                {new Date(raidTag.expires_at).toLocaleDateString()}
              </p>
            </div>
          )}

          {/* Policy rules */}
          {rules.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-2 font-mono text-xs uppercase tracking-wider text-white/60">
                Policy Rules
              </h3>
              {rules.map((r, i) => (
                <div key={i} className="mb-1 rounded bg-white/5 p-2">
                  <p className="font-mono text-[11px] text-white/80">
                    <span className="text-yellow-300">{r.name}</span>: if{" "}
                    {r.condition.field} {r.condition.operator} {String(r.condition.value)} →{" "}
                    {r.action} <span className="text-white/40">({r.protocol})</span>
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Recent trades */}
          <h3 className="mb-2 font-mono text-xs uppercase tracking-wider text-white/60">
            Recent Trades
          </h3>
          {trades.length === 0 && (
            <p className="font-mono text-xs text-white/30">No trades yet</p>
          )}
          {trades.map((t) => {
            const pnl = num(t.pnl_realized);
            const pnlCls = pnl > 0 ? "text-green-400" : pnl < 0 ? "text-red-400" : "text-white/40";
            return (
              <div
                key={t.id}
                className="flex items-center justify-between border-b border-white/5 py-1"
              >
                <div className="min-w-0">
                  <span className="font-mono text-xs text-white/80">{t.action}</span>
                  {(t.token_in || t.token_out) && (
                    <span className="ml-2 font-mono text-[10px] text-white/40">
                      {t.token_in ?? "?"}→{t.token_out ?? "?"}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {pnl !== 0 && (
                    <span className={`font-mono text-[10px] ${pnlCls}`}>
                      {pnl > 0 ? "+" : ""}
                      {pnl.toLocaleString()}
                    </span>
                  )}
                  {t.tx_hash && (
                    <a
                      href={`${MANTLE_SEPOLIA_EXPLORER}/tx/${t.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10px] text-blue-400 hover:text-blue-300"
                    >
                      {shortTx(t.tx_hash)}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

      {!loading && !agent && (
        <p className="font-mono text-xs text-white/30">Agent not found.</p>
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  valueClass = "text-white",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded bg-white/5 p-2">
      <p className="font-mono text-[10px] uppercase text-white/40">{label}</p>
      <p className={`font-mono text-sm font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}
