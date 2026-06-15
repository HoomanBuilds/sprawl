"use client";

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { PresetSelector } from "@/components/ui/PresetSelector";
import { RuleBuilder } from "@/components/ui/RuleBuilder";
import { getStrategyPreset, type StrategyPreset } from "@/lib/strategy-presets";
import type { AgentPolicy } from "@/types/agent";

const ACCENT = "#00ff88";

// strategyType enum matches the contract: 0=Preset, 1=Rules, 2=LLM
type StrategyMode = "preset" | "rules" | "llm";

const STRATEGY_TYPE: Record<StrategyMode, 0 | 1 | 2> = {
  preset: 0,
  rules: 1,
  llm: 2,
};

type Step = "configure" | "review";
type SpawnStatus = "idle" | "minting" | "funding" | "rising";

interface SpawnResult {
  agentId: number;
  walletAddress: string;
  erc8004TokenId?: number | null;
  name: string;
}

const emptyPolicy: AgentPolicy = {
  rules: [],
  riskTolerance: "medium",
  maxPositionSize: 30,
  maxSlippageBps: 100,
  allowedProtocols: ["SprawlDEX"],
};

const STATUS_LABEL: Record<Exclude<SpawnStatus, "idle">, string> = {
  minting: "Minting ERC-8004 identity...",
  funding: "Funding agent...",
  rising: "Building rising...",
};

export default function SpawnPage() {
  const { address, isConnected } = useAccount();

  const [step, setStep] = useState<Step>("configure");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<StrategyMode>("preset");

  const [presetKey, setPresetKey] = useState<string | null>(null);
  const [policy, setPolicy] = useState<AgentPolicy>(emptyPolicy);

  // Derive the full preset object from the selected key so downstream
  // usages (preset.id / preset.risk / preset.name / !!preset) work unchanged.
  const preset = presetKey ? getStrategyPreset(presetKey) : null;
  const [persona, setPersona] = useState("");

  const [avatarPrompt, setAvatarPrompt] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarSeed, setAvatarSeed] = useState<number | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarFallback, setAvatarFallback] = useState(false);

  const [status, setStatus] = useState<SpawnStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SpawnResult | null>(null);

  const trimmedName = name.trim();
  const nameValid = trimmedName.length >= 2 && trimmedName.length <= 32;

  const configReady =
    nameValid &&
    (mode === "preset"
      ? !!preset
      : mode === "rules"
        ? policy.rules.length > 0
        : persona.trim().length >= 10);

  const handleSpawn = useCallback(async () => {
    if (!configReady) return;

    setError(null);
    setStatus("minting");

    // Walk the visible status labels while the request is in flight.
    const t1 = setTimeout(() => setStatus("funding"), 3500);
    const t2 = setTimeout(() => setStatus("rising"), 8000);

    const body: {
      name: string;
      strategyType: 0 | 1 | 2;
      presetName?: string;
      customPolicy?: AgentPolicy;
      persona?: string;
      avatarPrompt?: string;
      avatarSeed?: number;
    } = {
      name: trimmedName,
      strategyType: STRATEGY_TYPE[mode],
    };

    if (avatarSeed != null) body.avatarSeed = avatarSeed;
    if (avatarPrompt.trim()) body.avatarPrompt = avatarPrompt.trim();

    if (mode === "preset" && presetKey) {
      body.presetName = presetKey;
    } else if (mode === "rules") {
      body.customPolicy = {
        rules: policy.rules,
        riskTolerance: "medium",
        maxPositionSize: 30,
        maxSlippageBps: 100,
        allowedProtocols: ["SprawlDEX"],
      };
    } else if (mode === "llm") {
      body.persona = persona.trim();
    }

    try {
      const res = await fetch("/api/agent/spawn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        throw new Error("Please sign in with your wallet first.");
      }
      if (!res.ok) {
        throw new Error(data.error || `Spawn failed (HTTP ${res.status})`);
      }

      setResult({
        agentId: data.agentId,
        walletAddress: data.walletAddress,
        erc8004TokenId: data.erc8004TokenId,
        name: trimmedName,
      });
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Spawn failed");
      setStatus("idle");
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
    }
  }, [configReady, trimmedName, mode, presetKey, policy, persona, avatarSeed, avatarPrompt]);

  const regenerateAvatar = useCallback(async () => {
    setAvatarLoading(true);
    try {
      const res = await fetch("/api/agent/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyType: STRATEGY_TYPE[mode],
          prompt: avatarPrompt.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.dataUrl) {
        setAvatarUrl(data.dataUrl);
        setAvatarSeed(data.seed);
        setAvatarFallback(!!data.fallback);
      }
    } finally {
      setAvatarLoading(false);
    }
  }, [mode, avatarPrompt]);

  const shortAddr = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "";

  return (
    <div className="min-h-screen bg-black text-neutral-100 font-mono">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-black/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between">
          <a
            href="/"
            className="text-sm text-neutral-400 hover:text-[var(--accent)] transition-colors"
            style={{ ["--accent" as string]: ACCENT }}
          >
            &larr; Back to The Sprawl
          </a>
          <ConnectButton />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        {/* Title */}
        <div className="mb-10">
          <h1
            className="text-4xl font-bold tracking-tight"
            style={{ color: ACCENT, textShadow: `0 0 24px ${ACCENT}55` }}
          >
            SPAWN AGENT
          </h1>
          <p className="mt-2 text-neutral-400">
            Mint an autonomous DeFi agent into The Sprawl. It gets an ERC-8004
            identity, a funded wallet, and a tower of its own.
          </p>
        </div>

        {/* Not connected */}
        {!isConnected ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-10 text-center">
            <p className="text-lg text-neutral-300 mb-2">
              Connect your wallet to spawn an agent
            </p>
            <p className="text-sm text-neutral-500 mb-6">
              You will sign in with your wallet so the city knows who owns this
              agent.
            </p>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </div>
        ) : result ? (
          /* Success */
          <SpawnSuccess result={result} accent={ACCENT} />
        ) : status !== "idle" ? (
          /* Spawning loader */
          <SpawnLoader status={status} accent={ACCENT} />
        ) : step === "review" ? (
          /* Review step */
          <ReviewStep
            name={trimmedName}
            mode={mode}
            preset={preset}
            policy={policy}
            persona={persona}
            owner={shortAddr}
            error={error}
            accent={ACCENT}
            onBack={() => {
              setError(null);
              setStep("configure");
            }}
            onSpawn={handleSpawn}
          />
        ) : (
          /* Configure step */
          <div className="space-y-10">
            {error && <ErrorBanner message={error} />}

            {/* Step 1: Name */}
            <section>
              <SectionLabel index={1} title="Name your agent" accent={ACCENT} />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. AlphaBot, Night Trader, DeFi Sage"
                maxLength={32}
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-3 text-neutral-100 placeholder-neutral-600 outline-none transition-colors focus:border-[var(--accent)]"
                style={{ ["--accent" as string]: ACCENT }}
              />
              <div className="mt-1 flex justify-between text-xs text-neutral-600">
                <span>2&ndash;32 characters</span>
                <span>{trimmedName.length}/32</span>
              </div>
            </section>

            {/* Step 2: Strategy type */}
            <section>
              <SectionLabel
                index={2}
                title="Choose a strategy type"
                accent={ACCENT}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <ModeCard
                  active={mode === "preset"}
                  accent={ACCENT}
                  label="Preset"
                  desc="Pick a battle-tested strategy template."
                  onClick={() => setMode("preset")}
                />
                <ModeCard
                  active={mode === "rules"}
                  accent={ACCENT}
                  label="Custom Rules"
                  desc="Build IF / THEN trading rules yourself."
                  onClick={() => setMode("rules")}
                />
                <ModeCard
                  active={mode === "llm"}
                  accent={ACCENT}
                  label="LLM"
                  desc="Describe a persona; an LLM decides each tick."
                  onClick={() => setMode("llm")}
                />
              </div>
            </section>

            {/* Step 3: Strategy config */}
            <section>
              <SectionLabel index={3} title="Configure" accent={ACCENT} />
              {mode === "preset" && (
                <PresetSelector selected={presetKey} onSelect={setPresetKey} />
              )}
              {mode === "rules" && (
                <RuleBuilder
                  rules={policy.rules}
                  onChange={(rules) => setPolicy({ ...policy, rules })}
                />
              )}
              {mode === "llm" && (
                <div>
                  <textarea
                    value={persona}
                    onChange={(e) => setPersona(e.target.value)}
                    rows={6}
                    placeholder="Describe how this agent thinks. e.g. 'A cautious yield farmer that chases the safest stable pools, takes profit early, and never holds a position into high volatility.'"
                    className="w-full resize-none rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-3 text-neutral-100 placeholder-neutral-600 outline-none transition-colors focus:border-[var(--accent)]"
                    style={{ ["--accent" as string]: ACCENT }}
                  />
                  <p className="mt-1 text-xs text-neutral-600">
                    The persona drives the LLM's decisions every tick. Min 10
                    characters.
                  </p>
                </div>
              )}
            </section>

            {/* Step 4: Avatar */}
            <section>
              <SectionLabel index={4} title="Avatar (optional)" accent={ACCENT} />
              <div className="flex items-start gap-4">
                <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
                  {avatarLoading ? (
                    <div
                      className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-800"
                      style={{ borderTopColor: ACCENT }}
                    />
                  ) : avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt="Agent avatar preview"
                      className="h-full w-full object-contain"
                      style={{ imageRendering: "pixelated" }}
                    />
                  ) : (
                    <span className="px-2 text-center text-xs text-neutral-600">
                      Auto-generated on spawn
                    </span>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={avatarPrompt}
                    onChange={(e) => setAvatarPrompt(e.target.value)}
                    placeholder="Describe your avatar — e.g. 'a fire dragon trader' (optional)"
                    maxLength={200}
                    className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-3 text-neutral-100 placeholder-neutral-600 outline-none transition-colors focus:border-[var(--accent)]"
                    style={{ ["--accent" as string]: ACCENT }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={regenerateAvatar}
                      disabled={avatarLoading}
                      className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                      style={{ borderColor: ACCENT, color: ACCENT }}
                    >
                      {avatarLoading ? "Generating..." : avatarUrl ? "↻ Regenerate" : "Generate preview"}
                    </button>
                    {avatarUrl && (
                      <button
                        onClick={() => {
                          setAvatarUrl(null);
                          setAvatarSeed(null);
                          setAvatarFallback(false);
                        }}
                        className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-300 transition-colors hover:border-neutral-500"
                      >
                        Use default
                      </button>
                    )}
                  </div>
                  {avatarFallback ? (
                    <p className="text-xs text-amber-500/80">
                      AI image generators are busy right now, so this is a placeholder
                      avatar. Your agent still spawns normally.
                    </p>
                  ) : (
                    <p className="text-xs text-neutral-600">
                      Leave blank to auto-generate from the agent&apos;s strategy. Any prompt
                      is always turned into a pixel-art creature avatar.
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Continue */}
            <button
              onClick={() => setStep("review")}
              disabled={!configReady}
              className="w-full rounded-lg px-6 py-4 text-lg font-bold text-black transition-all disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600"
              style={
                configReady
                  ? { background: ACCENT, boxShadow: `0 0 24px ${ACCENT}55` }
                  : undefined
              }
            >
              Review &amp; Spawn
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

/* ---------- sub-components ---------- */

function SectionLabel({
  index,
  title,
  accent,
}: {
  index: number;
  title: string;
  accent: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full border text-sm font-bold"
        style={{ borderColor: accent, color: accent }}
      >
        {index}
      </span>
      <h2 className="text-lg font-semibold text-neutral-200">{title}</h2>
    </div>
  );
}

function ModeCard({
  active,
  accent,
  label,
  desc,
  onClick,
}: {
  active: boolean;
  accent: string;
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border p-4 text-left transition-all"
      style={{
        borderColor: active ? accent : "#262626",
        background: active ? `${accent}11` : "#0a0a0a",
        boxShadow: active ? `0 0 16px ${accent}33` : undefined,
      }}
    >
      <div
        className="font-bold"
        style={{ color: active ? accent : "#e5e5e5" }}
      >
        {label}
      </div>
      <div className="mt-1 text-xs text-neutral-500">{desc}</div>
    </button>
  );
}

function ReviewStep({
  name,
  mode,
  preset,
  policy,
  persona,
  owner,
  error,
  accent,
  onBack,
  onSpawn,
}: {
  name: string;
  mode: StrategyMode;
  preset: StrategyPreset | null;
  policy: AgentPolicy;
  persona: string;
  owner: string;
  error: string | null;
  accent: string;
  onBack: () => void;
  onSpawn: () => void;
}) {
  const strategyLabel =
    mode === "preset"
      ? preset?.name ?? "Preset"
      : mode === "rules"
        ? "Custom Rules"
        : "LLM Persona";

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-neutral-100">Review &amp; Spawn</h2>

      {error && <ErrorBanner message={error} />}

      <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-6">
        <Row label="Name" value={name} />
        <Row label="Strategy" value={strategyLabel} />
        <Row label="Type" value={`${STRATEGY_TYPE[mode]} (${mode})`} />
        {mode === "rules" && (
          <Row label="Rules" value={`${policy.rules.length} rule(s)`} />
        )}
        {mode === "preset" && preset && (
          <Row label="Risk" value={preset.risk} />
        )}
        <Row label="Owner" value={owner} mono last={mode !== "llm"} />
        {mode === "llm" && (
          <div className="pt-3">
            <div className="text-xs uppercase tracking-wider text-neutral-500">
              Persona
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-300">
              {persona}
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-4 text-sm text-neutral-400">
        Your agent will receive a starting portfolio (~$10,000 in simulated
        assets) and begin trading autonomously based on this configuration.
      </div>

      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 font-medium text-neutral-300 transition-colors hover:border-neutral-500"
        >
          Back
        </button>
        <button
          onClick={onSpawn}
          className="flex-1 rounded-lg px-6 py-4 text-lg font-bold text-black transition-all"
          style={{ background: accent, boxShadow: `0 0 24px ${accent}55` }}
        >
          Spawn Agent
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  last,
}: {
  label: string;
  value: string;
  mono?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-3 ${
        last ? "" : "border-b border-neutral-900"
      }`}
    >
      <span className="text-sm text-neutral-500">{label}</span>
      <span
        className={`text-sm text-neutral-200 ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function SpawnLoader({
  status,
  accent,
}: {
  status: SpawnStatus;
  accent: string;
}) {
  const steps: Array<Exclude<SpawnStatus, "idle">> = [
    "minting",
    "funding",
    "rising",
  ];
  const currentIdx = steps.indexOf(status as Exclude<SpawnStatus, "idle">);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-10 text-center">
      <div
        className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-4 border-neutral-800"
        style={{ borderTopColor: accent }}
      />
      <h2 className="text-xl font-bold" style={{ color: accent }}>
        {STATUS_LABEL[status as Exclude<SpawnStatus, "idle">]}
      </h2>
      <div className="mx-auto mt-8 max-w-sm space-y-3 text-left">
        {steps.map((s, i) => (
          <div
            key={s}
            className="flex items-center gap-3 text-sm"
            style={{
              color:
                i < currentIdx
                  ? accent
                  : i === currentIdx
                    ? "#e5e5e5"
                    : "#525252",
            }}
          >
            <span>
              {i < currentIdx ? "✓" : i === currentIdx ? "→" : "·"}
            </span>
            <span>{STATUS_LABEL[s]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SpawnSuccess({
  result,
  accent,
}: {
  result: SpawnResult;
  accent: string;
}) {
  return (
    <div className="rounded-xl border bg-neutral-950 p-10 text-center"
      style={{ borderColor: `${accent}55` }}>
      <div
        className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full text-3xl text-black"
        style={{ background: accent, boxShadow: `0 0 32px ${accent}77` }}
      >
        &#10003;
      </div>
      <h2 className="text-2xl font-bold text-neutral-100">Agent Spawned</h2>
      <p className="mt-2 text-neutral-400">
        &ldquo;{result.name}&rdquo; is now alive in The Sprawl.
      </p>

      <div className="mx-auto mt-8 max-w-sm rounded-lg border border-neutral-800 bg-black p-5 text-left">
        <Row label="Agent ID" value={`#${result.agentId}`} mono />
        <Row
          label="Wallet"
          value={`${result.walletAddress.slice(0, 6)}...${result.walletAddress.slice(-4)}`}
          mono
          last={result.erc8004TokenId == null}
        />
        {result.erc8004TokenId != null && (
          <Row label="ERC-8004 ID" value={`#${result.erc8004TokenId}`} mono last />
        )}
      </div>

      <div className="mt-8 flex justify-center gap-4">
        <a
          href={`/?agent=${result.agentId}`}
          className="rounded-lg px-6 py-3 font-bold text-black transition-all"
          style={{ background: accent, boxShadow: `0 0 24px ${accent}55` }}
        >
          View in The Sprawl &rarr;
        </a>
        <a
          href={`/agent/${result.agentId}/policy`}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-6 py-3 font-medium text-neutral-300 transition-colors hover:border-neutral-500"
        >
          Edit Policy
        </a>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-800 bg-red-950/50 p-4">
      <p className="text-sm text-red-300">{message}</p>
    </div>
  );
}
