import { readFileSync } from "node:fs";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

// strategy_count was seeded to 0 for the demo agents, which pinned building
// width to its minimum. Backfill it to the real strategy breadth (number of
// protocols the agent is allowed to use) so footprints differ.
async function main() {
  const { getSupabaseAdmin } = await import("../src/lib/supabase");
  const sb = getSupabaseAdmin();

  const { data: agents, error } = await sb
    .from("agents")
    .select("agent_id, name, policy_config, strategy_count")
    .order("agent_id");
  if (error) throw error;

  for (const a of agents ?? []) {
    const protocols = a.policy_config?.allowedProtocols;
    const count = Array.isArray(protocols) ? protocols.length : 0;
    const next = Math.max(1, count);
    if (a.strategy_count === next) continue;
    await sb.from("agents").update({ strategy_count: next }).eq("agent_id", a.agent_id);
    console.log(`#${a.agent_id} ${a.name}: strategy_count ${a.strategy_count} -> ${next}`);
  }
  console.log("Done.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
