"use client";

// PRESET_META is provided by the concurrently-built strategy-presets module.
// Expected shape: Record<presetKey, { name; description; risk; rules? }>.
// We define a local fallback type so this file type-checks even before that
// module's exports are finalized.
import { PRESET_META } from "@/lib/strategy-presets";

const ACCENT = "#00ff88";

interface PresetMetaEntry {
  name: string;
  description: string;
  risk: string;
  // Optional — used to show a rule count when available.
  rules?: unknown[];
  ruleCount?: number;
}

interface PresetSelectorProps {
  selected: string | null;
  onSelect: (presetName: string) => void;
}

const RISK_STYLES: Record<string, string> = {
  low: "bg-green-500/15 text-green-400 border border-green-500/30",
  medium: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
  high: "bg-red-500/15 text-red-400 border border-red-500/30",
};

function riskBadgeClass(risk: string): string {
  return (
    RISK_STYLES[risk?.toLowerCase()] ??
    "bg-white/10 text-gray-300 border border-white/20"
  );
}

function ruleCountOf(meta: PresetMetaEntry): number | null {
  if (typeof meta.ruleCount === "number") return meta.ruleCount;
  if (Array.isArray(meta.rules)) return meta.rules.length;
  return null;
}

export function PresetSelector({ selected, onSelect }: PresetSelectorProps) {
  const entries = Object.entries(
    PRESET_META as Record<string, PresetMetaEntry>
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([key, meta]) => {
        const isSelected = selected === key;
        const count = ruleCountOf(meta);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            aria-pressed={isSelected}
            className={`flex flex-col rounded-lg border bg-gray-900/60 p-5 text-left transition-all hover:bg-gray-900 ${
              isSelected
                ? "border-transparent ring-2"
                : "border-white/10 hover:border-white/20"
            }`}
            style={
              isSelected
                ? ({ "--tw-ring-color": ACCENT } as React.CSSProperties)
                : undefined
            }
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3 className="font-semibold text-white">{meta.name}</h3>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${riskBadgeClass(
                  meta.risk
                )}`}
              >
                {meta.risk}
              </span>
            </div>

            <p className="flex-1 text-sm leading-relaxed text-gray-400">
              {meta.description}
            </p>

            <div className="mt-4 flex items-center justify-between">
              {count !== null ? (
                <span className="text-xs text-gray-500">
                  {count} {count === 1 ? "rule" : "rules"}
                </span>
              ) : (
                <span />
              )}
              {isSelected && (
                <span
                  className="text-xs font-semibold"
                  style={{ color: ACCENT }}
                >
                  Selected
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
