import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type NextRequest } from "next/server";
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = "nodejs";

const STRATEGY_LABELS: Record<number, string> = { 0: 'PRESET', 1: 'RULES', 2: 'LLM' };
const STRATEGY_COLORS: Record<number, string> = { 0: '#00d4ff', 1: '#c8e64a', 2: '#aa66ff' };

const TRASH_TALK = {
  stomp: ["TOTAL DOMINATION", "NOT EVEN CLOSE", "ABSOLUTE DESTRUCTION"],
  win: ["BETTER LUCK NEXT CYCLE", "GET BACK TO TRAINING", "OUTPLAYED"],
  close: ["THAT WAS PERSONAL", "DOWN TO THE WIRE", "RAZOR THIN"],
  tie: ["PERFECTLY BALANCED", "REMATCH REQUIRED", "STALEMATE"],
};

function getTrashTalk(aWins: number, bWins: number): string {
  const diff = Math.abs(aWins - bWins);
  let pool: string[];
  if (aWins === bWins) pool = TRASH_TALK.tie;
  else if (diff >= 3) pool = TRASH_TALK.stomp;
  else if (diff === 2) pool = TRASH_TALK.win;
  else pool = TRASH_TALK.close;
  return pool[(aWins + bWins) % pool.length];
}

const accent = "#c8e64a";
const bg = "#0d0d0f";
const cream = "#e8dcc8";
const border = "#2a2a30";
const cardBg = "#1c1c20";
const muted = "#8c8c9c";

const WSIZE = 20;
const WGAP = 8;
const WCOLS = 5;

function renderWindows(bHeight: number, color: string) {
  const rowH = WSIZE + WGAP;
  const usable = bHeight - 30;
  const nRows = Math.max(2, Math.floor(usable / rowH));
  const rows = [];
  for (let r = 0; r < nRows; r++) {
    const cells = [];
    for (let c = 0; c < WCOLS; c++) {
      const lit = (r * 5 + c * 3) % 7 > 1;
      cells.push(<div key={c} style={{ width: WSIZE, height: WSIZE, backgroundColor: lit ? color : `${color}18` }} />);
    }
    rows.push(<div key={r} style={{ display: "flex", gap: WGAP }}>{cells}</div>);
  }
  return rows;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentA: string; agentB: string }> }
) {
  const { agentA, agentB } = await params;
  const format = request.nextUrl.searchParams.get("format") ?? "landscape";

  const fontData = await readFile(join(process.cwd(), "public/fonts/Silkscreen-Regular.ttf"));
  const supabase = getSupabaseAdmin();

  const fields = "agent_id, name, strategy_type, xp_level, sprawl_lifetime_earned, total_volume, net_pnl, raid_wins, raid_losses, reputation_score";
  const [{ data: devA }, { data: devB }] = await Promise.all([
    supabase.from("agents").select(fields).eq("agent_id", parseInt(agentA, 10)).single(),
    supabase.from("agents").select(fields).eq("agent_id", parseInt(agentB, 10)).single(),
  ]);

  if (!devA || !devB) {
    return new ImageResponse(
      (<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: bg, fontFamily: "Silkscreen", color: cream, fontSize: 48, border: `6px solid ${border}` }}>Agent not found</div>),
      { width: 1200, height: 675, fonts: [{ name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const }] }
    );
  }

  const statDefs = [
    { label: "$SPRAWL", key: "sprawl_lifetime_earned" as const, divisor: 1e18 },
    { label: "LEVEL", key: "xp_level" as const, divisor: 1 },
    { label: "VOLUME", key: "total_volume" as const, divisor: 1 },
    { label: "RAIDS", key: "raid_wins" as const, divisor: 1 },
    { label: "REP", key: "reputation_score" as const, divisor: 1 },
  ];

  let aWins = 0;
  let bWins = 0;
  const statRows = statDefs.map(s => {
    const rawA: number = (devA as Record<string, number>)[s.key] ?? 0;
    const rawB: number = (devB as Record<string, number>)[s.key] ?? 0;
    const a = rawA / s.divisor;
    const b = rawB / s.divisor;
    const aWin = a > b;
    const bWin = b > a;
    if (aWin) aWins++;
    if (bWin) bWins++;
    return { label: s.label, a, b, aWin, bWin };
  });

  const isTie = aWins === bWins;
  const winnerName = aWins > bWins ? (devA.name ?? `Agent #${devA.agent_id}`) : (devB.name ?? `Agent #${devB.agent_id}`);
  const summary = isTie
    ? `Tie ${aWins}-${bWins}`
    : `${winnerName} wins ${Math.max(aWins, bWins)}-${Math.min(aWins, bWins)}`;

  const aIsWinner = aWins > bWins;
  const bIsWinner = bWins > aWins;
  const aColor = aIsWinner || isTie ? (STRATEGY_COLORS[devA.strategy_type as number] ?? accent) : muted;
  const bColor = bIsWinner || isTie ? (STRATEGY_COLORS[devB.strategy_type as number] ?? accent) : muted;
  const trashTalk = getTrashTalk(aWins, bWins);

  if (format === "stories") {
    return renderStories(devA, devB, statRows, summary, trashTalk, aColor, bColor, aIsWinner, bIsWinner, isTie, fontData);
  }
  return renderLandscape(devA, devB, statRows, summary, trashTalk, aColor, bColor, aIsWinner, bIsWinner, isTie, fontData);
}

function renderLandscape(
  devA: Record<string, unknown>, devB: Record<string, unknown>,
  statRows: { label: string; a: number; b: number; aWin: boolean; bWin: boolean }[],
  summary: string, trashTalk: string,
  aColor: string, bColor: string,
  aIsWinner: boolean, bIsWinner: boolean, isTie: boolean,
  fontData: Buffer
) {
  const maxLevel = Math.max(devA.xp_level as number, devB.xp_level as number, 1);
  const MIN_H = 180; const MAX_H = 360;
  const heightA = Math.round(MIN_H + ((devA.xp_level as number) / maxLevel) * (MAX_H - MIN_H));
  const heightB = Math.round(MIN_H + ((devB.xp_level as number) / maxLevel) * (MAX_H - MIN_H));
  const GROUND_Y = 510;
  const BLDG_W = 180;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", backgroundColor: bg, fontFamily: "Silkscreen", border: `6px solid ${border}`, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 30, top: 28, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 22, color: cream, textTransform: "uppercase" }}>{((devA.name ?? `Agent #${devA.agent_id}`) as string).slice(0, 14)}</div>
            <div style={{ display: "flex", fontSize: 12, color: aColor, textTransform: "uppercase" }}>{STRATEGY_LABELS[devA.strategy_type as number]}</div>
          </div>
        </div>

        <div style={{ position: "absolute", left: 60, top: GROUND_Y - heightA, width: BLDG_W, height: heightA, backgroundColor: cardBg, borderTop: `6px solid ${aColor}`, borderLeft: `3px solid ${aIsWinner || isTie ? `${accent}50` : border}`, borderRight: `3px solid ${aIsWinner || isTie ? `${accent}50` : border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14, gap: WGAP }}>
          {renderWindows(heightA, aColor)}
        </div>

        <div style={{ position: "absolute", right: 30, top: 28, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontSize: 22, color: cream, textTransform: "uppercase" }}>{((devB.name ?? `Agent #${devB.agent_id}`) as string).slice(0, 14)}</div>
            <div style={{ display: "flex", fontSize: 12, color: bColor, textTransform: "uppercase" }}>{STRATEGY_LABELS[devB.strategy_type as number]}</div>
          </div>
        </div>

        <div style={{ position: "absolute", right: 60, top: GROUND_Y - heightB, width: BLDG_W, height: heightB, backgroundColor: cardBg, borderTop: `6px solid ${bColor}`, borderLeft: `3px solid ${bIsWinner || isTie ? `${accent}50` : border}`, borderRight: `3px solid ${bIsWinner || isTie ? `${accent}50` : border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14, gap: WGAP }}>
          {renderWindows(heightB, bColor)}
        </div>

        <div style={{ position: "absolute", left: 270, top: 0, width: 660, height: GROUND_Y, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 16, color: accent, textTransform: "uppercase", marginBottom: 16 }}>&ldquo;{trashTalk}&rdquo;</div>
          <div style={{ display: "flex", fontSize: 48, color: accent, border: `4px solid ${accent}`, padding: "2px 26px", marginBottom: 20 }}>VS</div>
          {statRows.map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", marginBottom: 6, width: 620 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", width: 220, fontSize: 32, color: s.aWin ? accent : muted, paddingRight: 12 }}>{s.a.toLocaleString()}</div>
              <div style={{ display: "flex", justifyContent: "center", width: 160, fontSize: 16, color: `${muted}aa` }}>{s.label}</div>
              <div style={{ display: "flex", width: 220, fontSize: 32, color: s.bWin ? accent : muted, paddingLeft: 12 }}>{s.b.toLocaleString()}</div>
            </div>
          ))}
        </div>

        <div style={{ position: "absolute", left: 0, top: GROUND_Y, width: 1200, height: 4, backgroundColor: accent, display: "flex" }} />
        <div style={{ position: "absolute", left: 0, top: GROUND_Y + 4, width: 1200, height: 160, backgroundColor: "#141418", display: "flex" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, width: 1200, height: 90, display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 40, paddingRight: 40 }}>
          <div style={{ display: "flex", fontSize: 26, color: cream, textTransform: "uppercase" }}>{summary}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, textTransform: "uppercase" }}>
            <span style={{ fontSize: 26, color: cream }}>SPRAWL</span>
            <span style={{ fontSize: 26, color: accent }}>PROTOCOL</span>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 675, headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" }, fonts: [{ name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const }] }
  );
}

function renderStories(
  devA: Record<string, unknown>, devB: Record<string, unknown>,
  statRows: { label: string; a: number; b: number; aWin: boolean; bWin: boolean }[],
  summary: string, trashTalk: string,
  aColor: string, bColor: string,
  aIsWinner: boolean, bIsWinner: boolean, isTie: boolean,
  fontData: Buffer
) {
  const maxLevel = Math.max(devA.xp_level as number, devB.xp_level as number, 1);
  const MIN_H = 300; const MAX_H = 550;
  const heightA = Math.round(MIN_H + ((devA.xp_level as number) / maxLevel) * (MAX_H - MIN_H));
  const heightB = Math.round(MIN_H + ((devB.xp_level as number) / maxLevel) * (MAX_H - MIN_H));
  const GROUND_Y = 1050;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: bg, fontFamily: "Silkscreen", position: "relative", overflow: "hidden", alignItems: "center" }}>
        <div style={{ position: "absolute", top: 150, width: 920, display: "flex", justifyContent: "center" }}>
          <div style={{ display: "flex", fontSize: 34, color: accent, textTransform: "uppercase", textAlign: "center", justifyContent: "center" }}>&ldquo;{trashTalk}&rdquo;</div>
        </div>

        <div style={{ position: "absolute", top: 230, width: 920, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 320 }}>
            <div style={{ display: "flex", fontSize: 22, color: cream, textTransform: "uppercase" }}>{((devA.name ?? `Agent #${devA.agent_id}`) as string).slice(0, 14)}</div>
            <div style={{ display: "flex", fontSize: 14, color: aColor, textTransform: "uppercase", marginTop: 4 }}>{STRATEGY_LABELS[devA.strategy_type as number]}</div>
          </div>
          <div style={{ display: "flex", fontSize: 44, color: accent, border: `3px solid ${accent}`, padding: "4px 22px" }}>VS</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 320 }}>
            <div style={{ display: "flex", fontSize: 22, color: cream, textTransform: "uppercase" }}>{((devB.name ?? `Agent #${devB.agent_id}`) as string).slice(0, 14)}</div>
            <div style={{ display: "flex", fontSize: 14, color: bColor, textTransform: "uppercase", marginTop: 4 }}>{STRATEGY_LABELS[devB.strategy_type as number]}</div>
          </div>
        </div>

        <div style={{ position: "absolute", left: 140, top: GROUND_Y - heightA, width: 260, height: heightA, backgroundColor: cardBg, borderTop: `6px solid ${aColor}`, borderLeft: `3px solid ${aIsWinner || isTie ? `${accent}50` : border}`, borderRight: `3px solid ${aIsWinner || isTie ? `${accent}50` : border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14, gap: WGAP }}>
          {renderWindows(heightA, aColor)}
        </div>
        <div style={{ position: "absolute", left: 680, top: GROUND_Y - heightB, width: 260, height: heightB, backgroundColor: cardBg, borderTop: `6px solid ${bColor}`, borderLeft: `3px solid ${bIsWinner || isTie ? `${accent}50` : border}`, borderRight: `3px solid ${bIsWinner || isTie ? `${accent}50` : border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14, gap: WGAP }}>
          {renderWindows(heightB, bColor)}
        </div>

        <div style={{ position: "absolute", left: 80, top: GROUND_Y, width: 920, height: 4, backgroundColor: accent, display: "flex" }} />

        <div style={{ position: "absolute", top: GROUND_Y + 40, left: 0, width: 1080, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          {statRows.map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", width: 900 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", width: 320, fontSize: 34, color: s.aWin ? accent : muted, paddingRight: 16 }}>{s.a.toLocaleString()}</div>
              <div style={{ display: "flex", justifyContent: "center", width: 160, fontSize: 16, color: `${muted}aa` }}>{s.label}</div>
              <div style={{ display: "flex", width: 320, fontSize: 34, color: s.bWin ? accent : muted, paddingLeft: 16 }}>{s.b.toLocaleString()}</div>
            </div>
          ))}
        </div>

        <div style={{ position: "absolute", top: GROUND_Y + 310, width: 1080, display: "flex", justifyContent: "center", fontSize: 28, color: cream, textTransform: "uppercase" }}>{summary}</div>

        <div style={{ position: "absolute", top: GROUND_Y + 380, display: "flex", flexDirection: "column", alignItems: "center", width: 1080, gap: 14 }}>
          <div style={{ display: "flex", fontSize: 24, color: bg, backgroundColor: accent, padding: "12px 40px", textTransform: "uppercase" }}>Who wins? → sprawlprotocol.xyz</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, textTransform: "uppercase" }}>
            <span style={{ fontSize: 20, color: cream }}>SPRAWL</span>
            <span style={{ fontSize: 20, color: accent }}>PROTOCOL</span>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920, headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" }, fonts: [{ name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const }] }
  );
}
