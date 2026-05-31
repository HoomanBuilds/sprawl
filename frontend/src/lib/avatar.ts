import sharp from "sharp";
import { getSupabaseAdmin } from "@/lib/supabase";

const ARCHETYPE: Record<number, string> = {
  0: "a calm methodical trader creature with cyan and teal accents",
  1: "a sharp rule-bound trader creature with lime green accents",
  2: "a clever autonomous AI trader creature with purple accents",
};

const STYLE =
  "16-bit pixel art creature sprite, chibi style, vivid saturated colors, " +
  "sharp pixel edges, solid pure white background, centered, full body, facing viewer";

function buildPrompt(strategyType: number): string {
  return `${ARCHETYPE[strategyType] ?? ARCHETYPE[0]}, ${STYLE}`;
}

export function dicebearUrl(agentId: number): string {
  return `https://api.dicebear.com/9.x/pixel-art/png?seed=agent${agentId}&size=256`;
}

// Flood-fill transparency from the edges: only near-white pixels connected to
// the border become transparent, so white *inside* the creature is preserved.
export async function removeWhiteBackground(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const isWhite = (i: number) =>
    data[i] > 232 && data[i + 1] > 232 && data[i + 2] > 232;

  const stack: number[] = [];
  const seen = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) {
    stack.push(x, 0, x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    stack.push(0, y, width - 1, y);
  }
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const p = y * width + x;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * channels;
    if (!isWhite(i)) continue;
    data[i + 3] = 0;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
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
    const raw = Buffer.from(await res.arrayBuffer());
    const png = await removeWhiteBackground(raw);
    const path = `${agentId}.png`;
    const up = await sb.storage
      .from("avatars")
      .upload(path, png, { contentType: "image/png", upsert: true });
    if (up.error) throw up.error;
    return sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  } catch (err) {
    console.error(`[avatar] ${agentId} fallback to dicebear:`, (err as Error).message);
    return dicebearUrl(agentId);
  }
}
