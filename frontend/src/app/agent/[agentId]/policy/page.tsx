"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { RuleBuilder } from "@/components/ui/RuleBuilder";
import type { AgentPolicy } from "@/types/agent";

const ACCENT = "#00ff88";

interface PolicyResponse {
  agentId: number;
  name: string;
  strategyType: 0 | 1 | 2;
  policy: AgentPolicy;
}

const emptyPolicy: AgentPolicy = {
  rules: [],
  riskTolerance: "medium",
  maxPositionSize: 30,
  maxSlippageBps: 100,
  allowedProtocols: ["SprawlDEX"],
};

export default function PolicyEditPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = Number(params?.agentId);

  const { isConnected } = useAccount();

  const [agentName, setAgentName] = useState<string | null>(null);
  const [policy, setPolicy] = useState<AgentPolicy>(emptyPolicy);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(agentId) || agentId < 1) {
      setLoadError("Invalid agent ID");
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/agent/${agentId}/policy`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `Failed to load policy (HTTP ${res.status})`);
        }
        if (cancelled) return;
        const body = data as PolicyResponse;
        setAgentName(body.name);
        setPolicy(body.policy ?? emptyPolicy);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load policy");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);

    try {
      const res = await fetch(`/api/agent/${agentId}/policy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        throw new Error("Please sign in with your wallet first.");
      }
      if (res.status === 403) {
        throw new Error("You don't own this agent.");
      }
      if (!res.ok) {
        throw new Error(data.error || `Failed to save (HTTP ${res.status})`);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save policy");
    } finally {
      setSaving(false);
    }
  }, [agentId, policy]);

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
        <div className="mb-8">
          <h1
            className="text-4xl font-bold tracking-tight"
            style={{ color: ACCENT, textShadow: `0 0 24px ${ACCENT}55` }}
          >
            EDIT POLICY
          </h1>
          {agentName ? (
            <p className="mt-2 text-neutral-400">
              Agent{" "}
              <span className="font-mono text-neutral-200">#{agentId}</span> &mdash;{" "}
              <span className="text-neutral-200">{agentName}</span>
            </p>
          ) : (
            <p className="mt-2 text-neutral-400">
              Agent <span className="font-mono text-neutral-200">#{agentId}</span>
            </p>
          )}
        </div>

        {loading ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-10 text-center">
            <div
              className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-neutral-800"
              style={{ borderTopColor: ACCENT }}
            />
            <p className="text-neutral-400">Loading policy...</p>
          </div>
        ) : loadError ? (
          <div className="rounded-lg border border-red-800 bg-red-950/50 p-6 text-center">
            <p className="text-red-300">{loadError}</p>
            <a
              href="/"
              className="mt-4 inline-block text-sm text-neutral-400 hover:text-[var(--accent)] transition-colors"
              style={{ ["--accent" as string]: ACCENT }}
            >
              &larr; Back to The Sprawl
            </a>
          </div>
        ) : (
          <div className="space-y-8">
            {!isConnected && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 flex items-center justify-between gap-4">
                <p className="text-sm text-neutral-400">
                  Connect &amp; sign in with the owner wallet to save changes.
                </p>
                <ConnectButton />
              </div>
            )}

            {saveError && (
              <div className="rounded-lg border border-red-800 bg-red-950/50 p-4">
                <p className="text-sm text-red-300">{saveError}</p>
              </div>
            )}

            {saved && (
              <div
                className="rounded-lg border p-4"
                style={{ borderColor: `${ACCENT}55`, background: `${ACCENT}11` }}
              >
                <p className="text-sm" style={{ color: ACCENT }}>
                  Policy saved.
                </p>
              </div>
            )}

            <RuleBuilder policy={policy} onChange={setPolicy} />

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-lg px-6 py-4 text-lg font-bold text-black transition-all disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600"
              style={
                saving
                  ? undefined
                  : { background: ACCENT, boxShadow: `0 0 24px ${ACCENT}55` }
              }
            >
              {saving ? "Saving..." : "Save Policy"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
