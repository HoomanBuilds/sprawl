"use client";

import type { PolicyRule } from "@/types/agent";

const ACCENT = "#00ff88";
const MAX_RULES = 5;

interface RuleBuilderProps {
  rules: PolicyRule[];
  onChange: (rules: PolicyRule[]) => void;
}

// ─── Condition fields, grouped by category for the dropdown ───
interface FieldOption {
  value: string;
  label: string;
}
interface FieldGroup {
  group: string;
  options: FieldOption[];
}

const FIELD_GROUPS: FieldGroup[] = [
  {
    group: "Portfolio",
    options: [
      { value: "portfolio.totalValueUSD", label: "Total Value (USD)" },
      { value: "portfolio.unrealizedPnl", label: "Unrealized P&L" },
      { value: "portfolio.sprawlBalance", label: "SPRAWL Balance" },
      { value: "portfolio.holdings.sETH", label: "Holdings: sETH" },
      { value: "portfolio.holdings.sBTC", label: "Holdings: sBTC" },
      { value: "portfolio.holdings.sUSDC", label: "Holdings: sUSDC" },
      { value: "portfolio.holdings.sPOL", label: "Holdings: sPOL" },
      { value: "portfolio.holdings.sSOL", label: "Holdings: sSOL" },
    ],
  },
  {
    group: "Market — Price",
    options: [
      { value: "market.price.sETH", label: "Price: sETH" },
      { value: "market.price.sBTC", label: "Price: sBTC" },
      { value: "market.price.sPOL", label: "Price: sPOL" },
      { value: "market.price.sSOL", label: "Price: sSOL" },
    ],
  },
  {
    group: "Market — 1h Change",
    options: [
      { value: "market.priceChange1h.sETH", label: "1h Change: sETH" },
      { value: "market.priceChange1h.sBTC", label: "1h Change: sBTC" },
      { value: "market.priceChange1h.sPOL", label: "1h Change: sPOL" },
      { value: "market.priceChange1h.sSOL", label: "1h Change: sSOL" },
    ],
  },
  {
    group: "Market — 24h Change",
    options: [
      { value: "market.priceChange24h.sETH", label: "24h Change: sETH" },
      { value: "market.priceChange24h.sBTC", label: "24h Change: sBTC" },
      { value: "market.priceChange24h.sPOL", label: "24h Change: sPOL" },
      { value: "market.priceChange24h.sSOL", label: "24h Change: sSOL" },
    ],
  },
  {
    group: "Market — Pool",
    options: [{ value: "market.pool.sETH_sUSDC.apr", label: "sETH/sUSDC Pool APR" }],
  },
  {
    group: "Agent",
    options: [
      { value: "agent.level", label: "Level" },
      { value: "agent.raidWins", label: "Raid Wins" },
      { value: "agent.profitStreak", label: "Profit Streak (days)" },
    ],
  },
];

const DEFAULT_FIELD = FIELD_GROUPS[0].options[0].value;

const OPERATORS: PolicyRule["condition"]["operator"][] = [">", "<", "==", "!="];

const ACTIONS = [
  "swap",
  "provideLiquidity",
  "removeLiquidity",
  "hold",
  "raid",
] as const;
type ActionType = (typeof ACTIONS)[number];

const ACTION_LABELS: Record<ActionType, string> = {
  swap: "Swap",
  provideLiquidity: "Provide Liquidity",
  removeLiquidity: "Remove Liquidity",
  hold: "Hold",
  raid: "Raid",
};

const SWAP_TOKENS = ["sETH", "sBTC", "sUSDC", "sPOL", "sSOL", "SPRAWL"] as const;

// ─── Default params per action ───
function defaultParams(action: string): Record<string, unknown> {
  switch (action) {
    case "swap":
      return { tokenIn: "sUSDC", tokenOut: "sETH", amountPercent: 15 };
    case "provideLiquidity":
    case "removeLiquidity":
      return { tokenA: "sETH", tokenB: "sUSDC", amountPercent: 20 };
    case "raid":
      return { targetAgentId: 0 };
    case "hold":
    default:
      return {};
  }
}

function newRule(index: number): PolicyRule {
  return {
    name: `Rule ${index + 1}`,
    condition: { field: DEFAULT_FIELD, operator: ">", value: 0 },
    action: "swap",
    protocol: "SprawlDEX",
    params: defaultParams("swap"),
  };
}

// ─── Shared input styling ───
const selectCls =
  "bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#00ff88] transition-colors";
const inputCls =
  "bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#00ff88] transition-colors";
const labelCls = "text-[10px] uppercase tracking-wider text-gray-500 mb-1 block";

export function RuleBuilder({ rules, onChange }: RuleBuilderProps) {
  const atCap = rules.length >= MAX_RULES;

  function updateRule(index: number, patch: Partial<PolicyRule>) {
    onChange(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function updateCondition(
    index: number,
    patch: Partial<PolicyRule["condition"]>
  ) {
    const rule = rules[index];
    updateRule(index, { condition: { ...rule.condition, ...patch } });
  }

  function updateParams(index: number, patch: Record<string, unknown>) {
    const rule = rules[index];
    updateRule(index, { params: { ...rule.params, ...patch } });
  }

  function changeAction(index: number, action: string) {
    updateRule(index, { action, params: defaultParams(action) });
  }

  function addRule() {
    if (atCap) return;
    onChange([...rules, newRule(rules.length)]);
  }

  function removeRule(index: number) {
    onChange(rules.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      {rules.length === 0 && (
        <div className="rounded-lg border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-gray-500">
          No rules yet. Add a rule to define when your agent should act.
        </div>
      )}

      {rules.map((rule, index) => (
        <div
          key={index}
          className="rounded-lg border border-white/10 bg-gray-900/60 p-4"
        >
          {/* Header: name + remove */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <input
              type="text"
              value={rule.name}
              onChange={(e) => updateRule(index, { name: e.target.value })}
              maxLength={64}
              className={`${inputCls} flex-1 font-medium`}
              placeholder={`Rule ${index + 1}`}
            />
            <button
              type="button"
              onClick={() => removeRule(index)}
              className="rounded-md border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
            >
              Remove
            </button>
          </div>

          {/* IF condition */}
          <div className="rounded-md bg-black/30 p-3">
            <div
              className="mb-2 text-xs font-bold uppercase tracking-widest"
              style={{ color: ACCENT }}
            >
              If
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
              <div>
                <span className={labelCls}>Field</span>
                <select
                  value={rule.condition.field}
                  onChange={(e) =>
                    updateCondition(index, { field: e.target.value })
                  }
                  className={`${selectCls} w-full`}
                >
                  {FIELD_GROUPS.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <span className={labelCls}>Operator</span>
                <select
                  value={rule.condition.operator}
                  onChange={(e) =>
                    updateCondition(index, {
                      operator: e.target
                        .value as PolicyRule["condition"]["operator"],
                    })
                  }
                  className={`${selectCls} w-full`}
                >
                  {OPERATORS.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className={labelCls}>Value</span>
                <input
                  type="number"
                  value={
                    typeof rule.condition.value === "number"
                      ? rule.condition.value
                      : Number(rule.condition.value) || 0
                  }
                  onChange={(e) =>
                    updateCondition(index, {
                      value: e.target.value === "" ? 0 : Number(e.target.value),
                    })
                  }
                  step="any"
                  className={`${inputCls} w-full`}
                />
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="my-2 text-center text-gray-600">↓</div>

          {/* THEN action */}
          <div className="rounded-md bg-black/30 p-3">
            <div
              className="mb-2 text-xs font-bold uppercase tracking-widest"
              style={{ color: ACCENT }}
            >
              Then
            </div>
            <div className="space-y-3">
              <div>
                <span className={labelCls}>Action</span>
                <select
                  value={rule.action}
                  onChange={(e) => changeAction(index, e.target.value)}
                  className={`${selectCls} w-full sm:w-auto`}
                >
                  {ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {ACTION_LABELS[a]}
                    </option>
                  ))}
                </select>
              </div>

              <ActionParams
                action={rule.action}
                params={rule.params}
                onParamChange={(patch) => updateParams(index, patch)}
              />
            </div>
          </div>
        </div>
      ))}

      {/* Add rule + cap note */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addRule}
          disabled={atCap}
          className="rounded-md border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:border-white/10 disabled:text-gray-600"
          style={
            atCap
              ? undefined
              : { borderColor: ACCENT, color: ACCENT }
          }
        >
          + Add Rule
        </button>
        {atCap && (
          <span className="text-xs text-gray-500">
            Maximum of {MAX_RULES} rules reached.
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Action-specific param inputs ───
function ActionParams({
  action,
  params,
  onParamChange,
}: {
  action: string;
  params: Record<string, unknown>;
  onParamChange: (patch: Record<string, unknown>) => void;
}) {
  if (action === "hold") {
    return (
      <p className="text-xs text-gray-500">No parameters — agent stays put.</p>
    );
  }

  if (action === "raid") {
    return (
      <div className="max-w-[12rem]">
        <span className={labelCls}>Target Agent ID</span>
        <input
          type="number"
          min={0}
          value={Number(params.targetAgentId ?? 0)}
          onChange={(e) =>
            onParamChange({ targetAgentId: Number(e.target.value) || 0 })
          }
          className={`${inputCls} w-full`}
        />
      </div>
    );
  }

  if (action === "swap") {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TokenSelect
          label="Token In"
          value={String(params.tokenIn ?? "sUSDC")}
          onChange={(v) => onParamChange({ tokenIn: v })}
        />
        <TokenSelect
          label="Token Out"
          value={String(params.tokenOut ?? "sETH")}
          onChange={(v) => onParamChange({ tokenOut: v })}
        />
        <AmountPercent
          value={Number(params.amountPercent ?? 15)}
          onChange={(v) => onParamChange({ amountPercent: v })}
        />
      </div>
    );
  }

  // provideLiquidity / removeLiquidity
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <TokenSelect
        label="Token A"
        value={String(params.tokenA ?? "sETH")}
        onChange={(v) => onParamChange({ tokenA: v })}
      />
      <TokenSelect
        label="Token B"
        value={String(params.tokenB ?? "sUSDC")}
        onChange={(v) => onParamChange({ tokenB: v })}
      />
      <AmountPercent
        value={Number(params.amountPercent ?? 20)}
        onChange={(v) => onParamChange({ amountPercent: v })}
      />
    </div>
  );
}

function TokenSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className={labelCls}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${selectCls} w-full`}
      >
        {SWAP_TOKENS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}

function AmountPercent({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <span className={labelCls}>Amount %</span>
      <input
        type="number"
        min={1}
        max={100}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Math.min(100, Math.max(1, isNaN(n) ? 1 : n)));
        }}
        className={`${inputCls} w-full`}
      />
    </div>
  );
}
