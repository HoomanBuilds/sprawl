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

  const { data } = await sb
    .from("agents")
    .select("agent_id, strategy_type, avatar_url")
    .like("avatar_url", "%dicebear%");

  const targets = data ?? [];
  console.log(`Regenerating AI avatars for ${targets.length} DiceBear agents (10s spacing)…`);

  for (const a of targets) {
    let ok = false;
    for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
      const url = await ensureAvatar(a.agent_id, a.strategy_type);
      if (!url.includes("dicebear")) {
        await sb.from("agents").update({ avatar_url: url }).eq("agent_id", a.agent_id);
        console.log(`✓ #${a.agent_id} ai`);
        ok = true;
      } else if (attempt < 2) {
        await sleep(8000);
      }
    }
    if (!ok) console.log(`· #${a.agent_id} kept dicebear`);
    await sleep(10000);
  }
  console.log("Done.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
