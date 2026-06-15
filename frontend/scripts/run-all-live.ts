import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const ac = new AbortController();
process.on("SIGINT", () => ac.abort());
process.on("SIGTERM", () => ac.abort());

// Transient RPC blips (503 / -32001 / rate limits) that slip past per-call
// retries shouldn't crash the stack or flood stack traces — log one line.
const isTransientRpc = (e: unknown): boolean => {
  const x = e as { code?: string; info?: { responseBody?: string }; shortMessage?: string };
  return x?.code === "SERVER_ERROR" || x?.code === "TIMEOUT" || x?.code === "NETWORK_ERROR" ||
    /-3200[015]|rate limit|503|429/i.test(String(x?.info?.responseBody ?? x?.shortMessage ?? e));
};
process.on("unhandledRejection", (e: unknown) => {
  const x = e as { shortMessage?: string; message?: string };
  if (isTransientRpc(e)) console.error(`[RunAll] transient RPC: ${x?.shortMessage ?? x?.message ?? e}`);
  else console.error("[RunAll] unhandledRejection:", e);
});

async function main() {
  // Node < 22 has no global WebSocket; Supabase realtime needs one.
  const g = globalThis as { WebSocket?: unknown };
  if (typeof g.WebSocket === "undefined") g.WebSocket = (await import("ws")).default;

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
