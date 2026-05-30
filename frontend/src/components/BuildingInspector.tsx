"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { MANTLE_SEPOLIA_EXPLORER, TOKEN_SYMBOLS } from "@/lib/config";
import type { AgentRecord, PolicyRule } from "@/types/agent";

const ACCENT = "#00ff88";

interface BuildingInspectorProps {
  agent_id: number;
  onClose: () => void;
}

interface Trade {
  id: string;
  action: string;
  token_in: string | null;
  token_out: string | null;
  amount_in: number | null;
  pnl_realized: number | null;
  tx_hash: string | null;
  created_at: string;
}

interface RaidTag {
  attacker_name: string | null;
  expires_at: string;
}

// ─── Strategy types (0=Preset/blue, 1=Rules/purple, 2=LLM/green) ───
const STRATEGY: Record<number, { label: string; color: string }> = {
  0: { label: "PRESET", color: "#60a5fa" },
  1: { label: "RULES", color: "#a855f7" },
  2: { label: "LLM", color: "#00ff88" },
};

// ─── Tier names by level (from xp.ts logic, Sprawl-flavored) ───
interface Tier {
  name: string;
  color: string;
}
function tierFromLevel(level: number): Tier {
  if (level >= 24) return { name: "Sovereign", color: "#ffffff" };
  if (level >= 19) return { name: "Whale", color: "#00e0ff" };
  if (level >= 14) return { name: "Protocol", color: "#f0c060" };
  if (level >= 9) return { name: "Mainnet", color: "#a855f7" };
  if (level >= 5) return { name: "Devnet", color: "#6090e0" };
  return { name: "Testnet", color: "#e8dcc8" };
}

function num(v: number | bigint | null | undefined): number {
  return v == null ? 0 : Number(v);
}

function fmt(v: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function shortTx(hash: string): string {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function tokenSymbol(addr: string | null): string {
  if (!addr) return "?";
  return TOKEN_SYMBOLS[addr] ?? `${addr.slice(0, 4)}…`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function BuildingInspector({ agent_id, onClose }: BuildingInspectorProps) {
  const [agent, setAgent] = useState<AgentRecord | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [raidTag, setRaidTag] = useState<RaidTag | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Trigger slide-in after first paint
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let cancelled = false;
    setLoading(true);
    setAgent(null);

    Promise.all([
      supabase.from("agents").select("*").eq("agent_id", agent_id).single(),
      supabase
        .from("trade_history")
        .select("id, action, token_in, token_out, amount_in, pnl_realized, tx_hash, created_at")
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
      if (raidRes.data) setRaidTag(raidRes.data as unknown as RaidTag);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [agent_id]);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleClose = () => {
    setMounted(false);
    setTimeout(onClose, 200);
  };

  const strategy = STRATEGY[agent?.strategy_type ?? 0] ?? STRATEGY[0];
  const tier = tierFromLevel(agent?.xp_level ?? 1);
  const netPnl = num(agent?.net_pnl);
  const pnlPositive = netPnl > 0;
  const pnlColor = pnlPositive ? ACCENT : netPnl < 0 ? "#ff5577" : "#9090a0";
  const rules: PolicyRule[] = agent?.policy_config?.rules ?? [];

  // Building viz: clamp P&L magnitude to a height fraction (10%–100%)
  const pnlMag = Math.min(1, Math.abs(netPnl) / 5000);
  const barHeight = Math.round(10 + pnlMag * 90);
  const barColor = pnlPositive ? ACCENT : netPnl < 0 ? "#ff5577" : "#3a3a4a";

  return (
    <>
      {/* Mobile scrim */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 md:hidden ${
          mounted ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={handleClose}
      />

      <aside
        className={`fixed z-50 flex flex-col font-mono text-white
          left-0 right-0 bottom-0 max-h-[82vh] rounded-t-2xl border-t-2
          md:left-auto md:right-0 md:top-0 md:bottom-auto md:h-full md:max-h-none md:w-[380px] md:rounded-none md:border-l-2 md:border-t-0
          border-[#00ff88]/30 bg-[#0a0c10]/95 backdrop-blur-md
          shadow-[0_0_40px_rgba(0,0,0,0.6)]
          transition-transform duration-200 ease-out
          ${mounted ? "translate-y-0 md:translate-x-0" : "translate-y-full md:translate-y-0 md:translate-x-full"}`}
        style={{ boxShadow: mounted ? "0 0 40px rgba(0,255,136,0.08)" : undefined }}
      >
        {/* ── Header ── */}
        <div className="relative flex items-start gap-3 border-b border-white/10 px-4 py-4">
          {/* mobile drag handle */}
          <div className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-white/20 md:hidden" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold tracking-tight" style={{ color: ACCENT }}>
              {agent?.name || `Agent #${agent_id}`}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[9px] text-white/60">
                ERC-8004 #{agent_id}
              </span>
              <span
                className="rounded px-1.5 py-0.5 text-[9px] font-bold"
                style={{ backgroundColor: strategy.color + "22", color: strategy.color }}
              >
                {strategy.label}
              </span>
              {agent?.district && (
                <span className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[9px] text-white/60">
                  {agent.district}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="shrink-0 rounded border border-white/15 px-2 py-1 text-[10px] text-white/40 transition-colors hover:border-white/40 hover:text-white"
          >
            ESC
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading && (
            <div className="space-y-3">
              <div className="h-24 animate-pulse rounded bg-white/5" />
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded bg-white/5" />
                ))}
              </div>
              <p className="text-center text-[10px] text-white/30">Loading agent…</p>
            </div>
          )}

          {!loading && !agent && (
            <div className="py-12 text-center text-xs text-white/40">
              Agent #{agent_id} not found.
            </div>
          )}

          {!loading && agent && (
            <>
              {/* Active raid tag */}
              {raidTag && (
                <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2">
                  <p className="text-[10px] text-red-300">
                    ⚔ Tagged by{" "}
                    <span className="font-bold">{raidTag.attacker_name ?? "an attacker"}</span>
                    {" · expires "}
                    {timeAgo(raidTag.expires_at)}
                  </p>
                </div>
              )}

              {/* ── Building viz (height bar colored by P&L) ── */}
              <div className="mb-4 flex items-end gap-3 rounded-lg border border-white/10 bg-black/30 p-3">
                <div className="flex h-28 w-16 items-end justify-center">
                  <div
                    className="w-full rounded-t transition-all duration-500"
                    style={{
                      height: `${barHeight}%`,
                      background: `linear-gradient(to top, ${barColor}, ${barColor}aa)`,
                      boxShadow: `0 0 16px ${barColor}55`,
                    }}
                  >
                    {/* pixel windows */}
                    <div className="grid h-full grid-cols-2 content-start gap-1 p-1.5">
                      {Array.from({ length: Math.max(2, Math.round(barHeight / 12)) * 2 }).map(
                        (_, i) => (
                          <div
                            key={i}
                            className="h-1 w-full"
                            style={{ background: pnlPositive ? "#063" : "#400" }}
                          />
                        )
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-[9px] uppercase tracking-wider text-white/40">Net P&amp;L</p>
                  <p className="text-xl font-bold" style={{ color: pnlColor }}>
                    {pnlPositive ? "+" : ""}
                    {fmt(netPnl)}
                  </p>
                  <p className="mt-1 text-[9px] uppercase tracking-wider text-white/40">
                    Portfolio Value
                  </p>
                  <p className="text-sm text-white/80">{fmt(num(agent.last_portfolio_value))}</p>
                </div>
              </div>

              {/* ── Level + tier ── */}
              <div className="mb-4 flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded border-2 text-sm font-bold"
                  style={{ borderColor: tier.color, color: tier.color }}
                >
                  {agent.xp_level}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold" style={{ color: tier.color }}>
                    Level {agent.xp_level}
                  </p>
                  <p className="text-[9px] uppercase tracking-wider text-white/40">
                    {tier.name} Tier · {num(agent.xp_total).toLocaleString()} XP
                  </p>
                </div>
              </div>

              {/* ── Stats grid ── */}
              <div className="mb-4 grid grid-cols-2 gap-2">
                <Stat label="$SPRAWL Earned" value={fmt(num(agent.sprawl_lifetime_earned))} accent />
                <Stat label="Reputation" value={`${num(agent.reputation_score)}/100`} />
                <Stat label="Total Volume" value={fmt(num(agent.total_volume))} />
                <Stat
                  label="Raid Record"
                  value={`${agent.raid_wins}W · ${agent.raid_losses}L`}
                />
              </div>

              {/* ── Wallet ── */}
              <div className="mb-4">
                <p className="mb-1 text-[9px] uppercase tracking-wider text-white/40">Wallet</p>
                <a
                  href={`${MANTLE_SEPOLIA_EXPLORER}/address/${agent.wallet_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-white/70 underline-offset-2 transition-colors hover:text-[#00ff88] hover:underline"
                >
                  {agent.wallet_address.slice(0, 10)}…{agent.wallet_address.slice(-8)}
                </a>
                <p className="mt-2">
                  <a
                    href={`/agent/${agent.agent_id}`}
                    className="text-[11px] text-[#00ff88]/80 underline-offset-2 transition-colors hover:text-[#00ff88] hover:underline"
                  >
                    Share / Public page →
                  </a>
                </p>
              </div>

              {/* ── Policy rules (rules-based strategy only) ── */}
              {agent.strategy_type === 1 && rules.length > 0 && (
                <div className="mb-4">
                  <h3 className="mb-2 text-[10px] uppercase tracking-wider text-white/50">
                    Policy Rules
                  </h3>
                  <div className="space-y-1.5">
                    {rules.map((r, i) => (
                      <div
                        key={i}
                        className="rounded border border-white/10 bg-black/20 px-2.5 py-1.5"
                      >
                        <p className="text-[10px] leading-relaxed text-white/80">
                          <span className="font-bold" style={{ color: "#a855f7" }}>
                            {r.name}
                          </span>
                          <br />
                          <span className="text-white/50">if</span> {r.condition.field}{" "}
                          <span style={{ color: ACCENT }}>{r.condition.operator}</span>{" "}
                          {String(r.condition.value)}{" "}
                          <span className="text-white/50">→</span> {r.action}{" "}
                          <span className="text-white/40">({r.protocol})</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Recent trades ── */}
              <div>
                <h3 className="mb-2 text-[10px] uppercase tracking-wider text-white/50">
                  Recent Trades
                </h3>
                {trades.length === 0 ? (
                  <p className="rounded border border-dashed border-white/10 py-4 text-center text-[10px] text-white/30">
                    No trades yet
                  </p>
                ) : (
                  <div className="space-y-1">
                    {trades.map((t) => {
                      const pnl = num(t.pnl_realized);
                      const pCol = pnl > 0 ? ACCENT : pnl < 0 ? "#ff5577" : "#9090a0";
                      return (
                        <div
                          key={t.id}
                          className="flex items-center justify-between gap-2 rounded border border-white/5 bg-black/20 px-2.5 py-1.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[11px] text-white/90">
                              <span className="font-bold uppercase" style={{ color: ACCENT }}>
                                {t.action}
                              </span>{" "}
                              {(t.token_in || t.token_out) && (
                                <span className="text-white/60">
                                  {tokenSymbol(t.token_in)}→{tokenSymbol(t.token_out)}
                                </span>
                              )}
                            </p>
                            <p className="text-[8px] text-white/30">{timeAgo(t.created_at)} ago</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {pnl !== 0 && (
                              <span className="text-[10px] font-bold" style={{ color: pCol }}>
                                {pnl > 0 ? "+" : ""}
                                {fmt(pnl)}
                              </span>
                            )}
                            {t.tx_hash && (
                              <a
                                href={`${MANTLE_SEPOLIA_EXPLORER}/tx/${t.tx_hash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[9px] text-white/40 underline-offset-2 transition-colors hover:text-[#00ff88] hover:underline"
                              >
                                {shortTx(t.tx_hash)}
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
      <p className="text-[9px] uppercase tracking-wider text-white/40">{label}</p>
      <p
        className="mt-0.5 text-sm font-bold"
        style={{ color: accent ? ACCENT : "#ffffff" }}
      >
        {value}
      </p>
    </div>
  );
}
