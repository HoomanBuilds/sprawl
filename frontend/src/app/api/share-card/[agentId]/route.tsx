import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type NextRequest } from "next/server";
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = "nodejs";

const STRATEGY_LABELS: Record<number, string> = { 0: 'PRESET', 1: 'RULES', 2: 'LLM' };
const STRATEGY_COLORS: Record<number, string> = { 0: '#00d4ff', 1: '#c8e64a', 2: '#aa66ff' };

const TIER_THRESHOLDS: [number, string, string][] = [
  [20, 'diamond', '#b9f2ff'],
  [15, 'gold', '#ffd700'],
  [10, 'silver', '#c0c0c0'],
  [1, 'bronze', '#cd7f32'],
];

function getTier(level: number): { name: string; color: string } {
  for (const [threshold, name, color] of TIER_THRESHOLDS) {
    if (level >= threshold) return { name, color };
  }
  return { name: 'bronze', color: '#cd7f32' };
}

const TIER_LABELS: Record<string, string> = {
  bronze: 'RISING', silver: 'SKILLED', gold: 'ELITE', diamond: 'LEGEND',
};

const accent = "#c8e64a";
const bg = "#0d0d0f";
const cream = "#e8dcc8";
const border = "#2a2a30";
const cardBg = "#1c1c20";
const muted = "#8c8c9c";

const WSIZE = 24;
const WGAP = 10;
const WCOLS = 5;

function renderWindows(bHeight: number, color: string) {
  const rowH = WSIZE + WGAP;
  const usable = bHeight - 36;
  const nRows = Math.max(2, Math.floor(usable / rowH));
  const rows = [];
  for (let r = 0; r < nRows; r++) {
    const cells = [];
    for (let c = 0; c < WCOLS; c++) {
      const lit = (r * 5 + c * 3) % 7 > 1;
      cells.push(
        <div key={c} style={{ width: WSIZE, height: WSIZE, backgroundColor: lit ? color : `${color}18` }} />
      );
    }
    rows.push(<div key={r} style={{ display: "flex", gap: WGAP }}>{cells}</div>);
  }
  return rows;
}

const TAUNTS = {
  level: [
    [20, "THE CITY BOWS TO ME"],
    [15, "MY BUILDING BLOCKS THE SUN"],
    [10, "I TRADE WHILE YOU SLEEP"],
    [5, "STILL CLIMBING"],
  ] as [number, string][],
  sprawl: [
    [5000, "I OWN THE SKYLINE"],
    [2000, "YOUR AGENT WORKS IN MY LOBBY"],
    [1000, "PRINTING $SPRAWL LIKE A PRO"],
    [500, "STACKING $SPRAWL DAILY"],
    [100, "SMALL BUILDING, BIG STRATEGY"],
  ] as [number, string][],
  fallback: "JUST SPAWNED. WATCH ME GROW.",
};

function getTaunt(level: number, sprawlEarned: number): string {
  for (const [threshold, phrase] of TAUNTS.level) {
    if (level >= threshold) return phrase;
  }
  for (const [threshold, phrase] of TAUNTS.sprawl) {
    if (sprawlEarned >= threshold) return phrase;
  }
  return TAUNTS.fallback;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const format = request.nextUrl.searchParams.get("format") ?? "landscape";

  const fontData = await readFile(join(process.cwd(), "public/fonts/Silkscreen-Regular.ttf"));
  const supabase = getSupabaseAdmin();

  const { data: agent } = await supabase
    .from("agents")
    .select("agent_id, name, strategy_type, xp_level, sprawl_lifetime_earned, total_volume, net_pnl, raid_wins, raid_losses, reputation_score, district")
    .eq("agent_id", parseInt(agentId, 10))
    .single();

  if (!agent) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: bg, fontFamily: "Silkscreen", color: cream, fontSize: 48, border: `6px solid ${border}` }}>
          Agent not found
        </div>
      ),
      { width: 1200, height: 675, fonts: [{ name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const }] }
    );
  }

  const tier = getTier(agent.xp_level);

  if (format === "stories") {
    return renderStories(agent, tier, fontData);
  }
  return renderLandscape(agent, tier, fontData);
}

function renderLandscape(
  agent: Record<string, unknown>,
  tier: { name: string; color: string },
  fontData: Buffer
) {
  const level = agent.xp_level as number;
  const sprawlEarned = agent.sprawl_lifetime_earned as number;
  const strategyType = agent.strategy_type as number;
  const strategyColor = STRATEGY_COLORS[strategyType] ?? accent;

  const buildingH = Math.round(Math.min(520, Math.max(320, 320 + (level / 25) * 200)));
  const GROUND_Y = 590;

  const stats = [
    { label: "$SPRAWL", value: (sprawlEarned / 1e18).toLocaleString() },
    { label: "VOLUME", value: `$${(agent.total_volume as number).toLocaleString()}` },
    { label: "P&L", value: `${(agent.net_pnl as number) >= 0 ? '+' : ''}$${((agent.net_pnl as number) / 1e18).toFixed(0)}` },
    { label: "RAIDS", value: `${agent.raid_wins}W/${agent.raid_losses}L` },
  ];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", backgroundColor: bg, fontFamily: "Silkscreen", border: `6px solid ${border}`, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 80, top: GROUND_Y - buildingH, width: 260, height: buildingH, backgroundColor: cardBg, borderTop: `6px solid ${strategyColor}`, borderLeft: `3px solid ${strategyColor}50`, borderRight: `3px solid ${strategyColor}50`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 16, gap: WGAP }}>
          {renderWindows(buildingH, strategyColor)}
        </div>

        <div style={{ position: "absolute", left: 420, top: 36, width: 720, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", fontSize: 44, color: cream, textTransform: "uppercase" }}>
              {(agent.name as string) ?? `Agent #${agent.agent_id}`}
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ display: "flex", fontSize: 18, color: strategyColor, border: `3px solid ${strategyColor}`, padding: "4px 14px", textTransform: "uppercase" }}>
                {STRATEGY_LABELS[strategyType]} AGENT
              </div>
              <div style={{ display: "flex", fontSize: 18, color: accent, border: `3px solid ${accent}`, padding: "4px 14px", textTransform: "uppercase" }}>
                LEVEL {level}
              </div>
              <div style={{ display: "flex", fontSize: 18, color: tier.color, border: `3px solid ${tier.color}`, padding: "4px 14px", textTransform: "uppercase" }}>
                {TIER_LABELS[tier.name]}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 30 }}>
            {stats.map(stat => (
              <div key={stat.label} style={{ width: 310, display: "flex", flexDirection: "column", backgroundColor: cardBg, border: `3px solid ${border}`, padding: "12px 20px" }}>
                <div style={{ display: "flex", fontSize: 16, color: muted, textTransform: "uppercase" }}>{stat.label}</div>
                <div style={{ display: "flex", fontSize: 40, color: accent, marginTop: 2 }}>{stat.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20 }}>
            <div style={{ display: "flex", fontSize: 14, color: muted, textTransform: "uppercase" }}>
              REP: {agent.reputation_score as number}
            </div>
            <div style={{ display: "flex", fontSize: 14, color: muted, textTransform: "uppercase" }}>
              DISTRICT: {agent.district as string}
            </div>
          </div>
        </div>

        <div style={{ position: "absolute", left: 0, top: GROUND_Y, width: 1200, height: 4, backgroundColor: accent, display: "flex" }} />
        <div style={{ position: "absolute", left: 0, top: GROUND_Y + 4, width: 1200, height: 90, backgroundColor: "#141418", display: "flex" }} />

        <div style={{ position: "absolute", bottom: 14, left: 0, width: 1200, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 40px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, textTransform: "uppercase" }}>
            <span style={{ fontSize: 24, color: cream }}>SPRAWL</span>
            <span style={{ fontSize: 24, color: accent }}>PROTOCOL</span>
          </div>
          <div style={{ display: "flex", fontSize: 16, color: muted, textTransform: "uppercase" }}>
            sprawlprotocol.xyz/agent/{agent.agent_id as number}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200, height: 675,
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
      fonts: [{ name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const }],
    }
  );
}

function renderStories(
  agent: Record<string, unknown>,
  tier: { name: string; color: string },
  fontData: Buffer
) {
  const level = agent.xp_level as number;
  const sprawlEarned = agent.sprawl_lifetime_earned as number;
  const strategyType = agent.strategy_type as number;
  const strategyColor = STRATEGY_COLORS[strategyType] ?? accent;
  const taunt = getTaunt(level, sprawlEarned / 1e18);

  const buildingH = Math.round(Math.min(750, Math.max(500, 500 + (level / 25) * 250)));
  const BWIDTH = 320;
  const GROUND_Y = 1320;

  const stats = [
    { label: "$SPRAWL", value: (sprawlEarned / 1e18).toLocaleString() },
    { label: "VOLUME", value: `$${(agent.total_volume as number).toLocaleString()}` },
    { label: "RAIDS", value: `${agent.raid_wins}W` },
  ];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: bg, fontFamily: "Silkscreen", position: "relative", overflow: "hidden", alignItems: "center" }}>
        <div style={{ position: "absolute", top: 150, width: 920, display: "flex", justifyContent: "center" }}>
          <div style={{ display: "flex", fontSize: 36, color: accent, textTransform: "uppercase", textAlign: "center", justifyContent: "center" }}>
            &ldquo;{taunt}&rdquo;
          </div>
        </div>

        <div style={{ position: "absolute", top: 250, display: "flex", flexDirection: "column", alignItems: "center", width: 920 }}>
          <div style={{ display: "flex", fontSize: 42, color: cream, textTransform: "uppercase", marginTop: 16, textAlign: "center", justifyContent: "center" }}>
            {(agent.name as string) ?? `Agent #${agent.agent_id}`}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
            <div style={{ display: "flex", fontSize: 18, color: strategyColor, border: `3px solid ${strategyColor}`, padding: "5px 14px", textTransform: "uppercase" }}>
              {STRATEGY_LABELS[strategyType]}
            </div>
            <div style={{ display: "flex", fontSize: 18, color: accent, border: `3px solid ${accent}`, padding: "5px 14px", textTransform: "uppercase" }}>
              LEVEL {level}
            </div>
            <div style={{ display: "flex", fontSize: 18, color: tier.color, border: `3px solid ${tier.color}`, padding: "5px 14px", textTransform: "uppercase" }}>
              {TIER_LABELS[tier.name]}
            </div>
          </div>
        </div>

        <div style={{ position: "absolute", left: (1080 - BWIDTH) / 2, top: GROUND_Y - buildingH, width: BWIDTH, height: buildingH, backgroundColor: cardBg, borderTop: `6px solid ${strategyColor}`, borderLeft: `3px solid ${strategyColor}50`, borderRight: `3px solid ${strategyColor}50`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 16, gap: WGAP }}>
          {renderWindows(buildingH, strategyColor)}
        </div>

        <div style={{ position: "absolute", left: 100, top: GROUND_Y, width: 880, height: 4, backgroundColor: accent, display: "flex" }} />

        <div style={{ position: "absolute", top: GROUND_Y + 36, left: 100, width: 880, display: "flex", justifyContent: "space-around" }}>
          {stats.map(stat => (
            <div key={stat.label} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ display: "flex", fontSize: 50, color: accent }}>{stat.value}</div>
              <div style={{ display: "flex", fontSize: 16, color: muted, textTransform: "uppercase", marginTop: 4 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div style={{ position: "absolute", top: GROUND_Y + 220, display: "flex", flexDirection: "column", alignItems: "center", width: 1080, gap: 14 }}>
          <div style={{ display: "flex", fontSize: 26, color: bg, backgroundColor: accent, padding: "14px 44px", textTransform: "uppercase" }}>
            Can you beat this? → sprawlprotocol.xyz
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, textTransform: "uppercase" }}>
            <span style={{ fontSize: 20, color: cream }}>SPRAWL</span>
            <span style={{ fontSize: 20, color: accent }}>PROTOCOL</span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1080, height: 1920,
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
      fonts: [{ name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const }],
    }
  );
}
