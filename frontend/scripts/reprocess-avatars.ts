import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

async function main() {
  const { getSupabaseAdmin } = await import("../src/lib/supabase");
  const { removeWhiteBackground } = await import("../src/lib/avatar");
  const sb = getSupabaseAdmin();

  const { data } = await sb
    .from("agents")
    .select("agent_id, avatar_url")
    .like("avatar_url", "%/storage/v1/object/public/avatars/%");

  const targets = data ?? [];
  console.log(`Reprocessing ${targets.length} avatars (white background -> transparent)…`);

  for (const a of targets) {
    try {
      const srcUrl = (a.avatar_url as string).split("?")[0];
      const res = await fetch(srcUrl);
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const raw = Buffer.from(await res.arrayBuffer());
      const png = await removeWhiteBackground(raw);
      const path = `${a.agent_id}.png`;
      const up = await sb.storage
        .from("avatars")
        .upload(path, png, { contentType: "image/png", upsert: true });
      if (up.error) throw up.error;
      const publicUrl = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      await sb.from("agents").update({ avatar_url: `${publicUrl}?v=2` }).eq("agent_id", a.agent_id);
      console.log(`✓ #${a.agent_id}`);
    } catch (err) {
      console.error(`✗ #${a.agent_id}: ${(err as Error).message}`);
    }
  }
  console.log("Done.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
