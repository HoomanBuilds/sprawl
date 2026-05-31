import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { getSupabaseAdmin } = await import("../src/lib/supabase");
  const { ensureAvatar } = await import("../src/lib/avatar");
  const sb = getSupabaseAdmin();

  // Pass "all" to regenerate every agent; default regenerates only DiceBear ones.
  let q = sb.from("agents").select("agent_id, strategy_type, avatar_url").order("agent_id");
  if (process.argv[2] !== "all") q = q.like("avatar_url", "%dicebear%");
  const { data } = await q;

  const targets = data ?? [];
  console.log(`Regenerating AI avatars for ${targets.length} agents…`);

  for (const a of targets) {
    const url = await ensureAvatar(a.agent_id, a.strategy_type);
    await sb.from("agents").update({ avatar_url: url }).eq("agent_id", a.agent_id);
    console.log(`${url.includes("dicebear") ? "·" : "✓"} #${a.agent_id} ${url.includes("dicebear") ? "dicebear" : "ai"}`);
    await sleep(2000);
  }
  console.log("Done.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
