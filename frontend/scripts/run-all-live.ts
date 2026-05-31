import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const ac = new AbortController();
process.on("SIGINT", () => ac.abort());
process.on("SIGTERM", () => ac.abort());

async function main() {
  const { startEngine } = await import("../src/lib/engine/game-loop");
  const { startIndexer } = await import("../src/lib/indexer");
  const { marketMakerLoop } = await import("../src/lib/market-maker");
  const { supabaseAdmin } = await import("../src/lib/supabase");
  const { data: agents, error } = await supabaseAdmin.from("agents").select("*");
  if (error) { console.error(`[RunAll] load agents: ${error.message}`); process.exit(1); }
  console.log(`[RunAll] Loaded ${agents?.length ?? 0} agents — starting engine + indexer + market-maker`);
  await Promise.allSettled([
    startEngine((agents ?? []) as never).then(() => console.log("[RunAll] engine stopped")),
    startIndexer(ac.signal).then(() => console.log("[RunAll] indexer stopped")),
    marketMakerLoop(ac.signal).then(() => console.log("[RunAll] market-maker stopped")),
  ]);
  process.exit(0);
}

main().catch((e) => { console.error("[RunAll] Fatal:", e); process.exit(1); });
