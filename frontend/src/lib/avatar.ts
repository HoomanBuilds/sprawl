import { getSupabaseAdmin } from "@/lib/supabase";

const ARCHETYPE: Record<number, string> = {
  0: "a calm methodical trader creature with cyan and teal accents",
  1: "a sharp rule-bound trader creature with lime green accents",
  2: "a clever autonomous AI trader creature with purple accents",
};

const STYLE =
  "16-bit pixel art creature sprite, chibi style, vivid saturated colors, " +
  "sharp pixel edges, transparent background, centered, full body, facing viewer";

function buildPrompt(strategyType: number): string {
  return `${ARCHETYPE[strategyType] ?? ARCHETYPE[0]}, ${STYLE}`;
}

export function dicebearUrl(agentId: number): string {
  return `https://api.dicebear.com/9.x/pixel-art/png?seed=agent${agentId}&size=256`;
}

export async function ensureAvatar(
  agentId: number,
  strategyType: number
): Promise<string> {
  const sb = getSupabaseAdmin();
  try {
    const prompt = encodeURIComponent(buildPrompt(strategyType));
    const src = `https://image.pollinations.ai/prompt/${prompt}?width=256&height=256&nologo=true&seed=${agentId}`;
    const res = await fetch(src, { signal: AbortSignal.timeout(45000) });
    if (!res.ok) throw new Error(`pollinations ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "image/png";
    const path = `${agentId}.png`;
    const up = await sb.storage
      .from("avatars")
      .upload(path, buf, { contentType, upsert: true });
    if (up.error) throw up.error;
    return sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  } catch (err) {
    console.error(`[avatar] ${agentId} fallback to dicebear:`, (err as Error).message);
    return dicebearUrl(agentId);
  }
}
