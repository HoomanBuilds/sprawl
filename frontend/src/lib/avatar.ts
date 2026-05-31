import sharp from "sharp";
import { getSupabaseAdmin } from "@/lib/supabase";

const ARCHETYPE: Record<number, string> = {
  0: "a calm methodical trader creature with cyan and teal accents",
  1: "a sharp rule-bound trader creature with lime green accents",
  2: "a clever autonomous AI trader creature with purple accents",
};

const STYLE =
  "16-bit pixel art creature sprite, chibi style, vivid saturated colors, " +
  "sharp pixel edges, solid flat white background, centered, full body, facing viewer";

function buildPrompt(strategyType: number): string {
  return `${ARCHETYPE[strategyType] ?? ARCHETYPE[0]}, ${STYLE}`;
}

export function dicebearUrl(agentId: number): string {
  return `https://api.dicebear.com/9.x/pixel-art/png?seed=agent${agentId}&size=256`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isImage(contentType: string | null, bytes: number): boolean {
  return !!contentType && contentType.startsWith("image/") && bytes > 2048;
}

// ── Free generators (tried in order). Each returns raw image bytes or throws. ──

async function fromPollinations(prompt: string, seed: number): Promise<Buffer> {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=256&height=256&nologo=true&seed=${seed}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(40000) });
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok || !isImage(res.headers.get("content-type"), buf.length)) {
    throw new Error(`pollinations ${res.status} (${buf.length}b)`);
  }
  return buf;
}

async function fromHuggingFace(prompt: string): Promise<Buffer> {
  const key = process.env.HUGGINGFACE_API_KEY;
  if (!key) throw new Error("no HF key");
  const res = await fetch(
    "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ inputs: prompt }),
      signal: AbortSignal.timeout(50000),
    }
  );
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok || !isImage(res.headers.get("content-type"), buf.length)) {
    throw new Error(`huggingface ${res.status}`);
  }
  return buf;
}

async function fromTogether(prompt: string): Promise<Buffer> {
  const key = process.env.TOGETHER_API_KEY;
  if (!key) throw new Error("no Together key");
  const res = await fetch("https://api.together.xyz/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "black-forest-labs/FLUX.1-schnell-Free",
      prompt,
      width: 256,
      height: 256,
      n: 1,
      response_format: "b64_json",
    }),
    signal: AbortSignal.timeout(50000),
  });
  if (!res.ok) throw new Error(`together ${res.status}`);
  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("together no image");
  return Buffer.from(b64, "base64");
}

async function fromCloudflare(prompt: string): Promise<Buffer> {
  const acct = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!acct || !token) throw new Error("no Cloudflare creds");
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ prompt, steps: 6 }),
      signal: AbortSignal.timeout(50000),
    }
  );
  if (!res.ok) throw new Error(`cloudflare ${res.status}`);
  const json = (await res.json()) as { result?: { image?: string } };
  const b64 = json.result?.image;
  if (!b64) throw new Error("cloudflare no image");
  return Buffer.from(b64, "base64");
}

async function fromGemini(prompt: string): Promise<Buffer> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("no Gemini key");
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
      signal: AbortSignal.timeout(50000),
    }
  );
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
  };
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  const b64 = part?.inlineData?.data;
  if (!b64) throw new Error("gemini no image");
  return Buffer.from(b64, "base64");
}

// Try every free AI generator before giving up: keyed free-tier providers first
// (reliable when configured), then no-key Pollinations with seed rotation + backoff.
async function generateAvatar(strategyType: number, agentId: number): Promise<Buffer | null> {
  const prompt = buildPrompt(strategyType);

  const keyed: Array<() => Promise<Buffer>> = [];
  if (process.env.GEMINI_API_KEY) keyed.push(() => fromGemini(prompt));
  if (process.env.TOGETHER_API_KEY) keyed.push(() => fromTogether(prompt));
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) keyed.push(() => fromCloudflare(prompt));
  if (process.env.HUGGINGFACE_API_KEY) keyed.push(() => fromHuggingFace(prompt));
  for (const gen of keyed) {
    try { return await gen(); }
    catch (err) { console.warn(`[avatar] ${agentId} keyed provider failed: ${(err as Error).message}`); }
  }

  const seeds = [agentId, agentId + 1000, agentId + 2000, agentId + 3000];
  for (let i = 0; i < seeds.length; i++) {
    try { return await fromPollinations(prompt, seeds[i]); }
    catch (err) {
      console.warn(`[avatar] ${agentId} pollinations seed ${seeds[i]} failed: ${(err as Error).message}`);
      if (i < seeds.length - 1) await sleep(3000 * (i + 1));
    }
  }
  return null;
}

// Edge flood-fill: make the background (color sampled from the corners) transparent.
// Only pixels connected to the border are cleared, so detail inside is preserved.
export async function removeWhiteBackground(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const corners = [
    0,
    (width - 1) * channels,
    (height - 1) * width * channels,
    ((height - 1) * width + (width - 1)) * channels,
  ];
  let br = 0, bg = 0, bb = 0;
  for (const c of corners) { br += data[c]; bg += data[c + 1]; bb += data[c + 2]; }
  br /= 4; bg /= 4; bb /= 4;
  const TOL = 60;
  const near = (i: number) =>
    Math.abs(data[i] - br) < TOL && Math.abs(data[i + 1] - bg) < TOL && Math.abs(data[i + 2] - bb) < TOL;

  const stack: number[] = [];
  const seen = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) stack.push(x, 0, x, height - 1);
  for (let y = 0; y < height; y++) stack.push(0, y, width - 1, y);
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const p = y * width + x;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * channels;
    if (!near(i)) continue;
    data[i + 3] = 0;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

export async function ensureAvatar(agentId: number, strategyType: number): Promise<string> {
  const sb = getSupabaseAdmin();
  const raw = await generateAvatar(strategyType, agentId);
  if (!raw) {
    console.error(`[avatar] ${agentId} all AI generators failed — using dicebear`);
    return dicebearUrl(agentId);
  }
  try {
    const png = await removeWhiteBackground(raw);
    const path = `${agentId}.png`;
    const up = await sb.storage
      .from("avatars")
      .upload(path, png, { contentType: "image/png", upsert: true });
    if (up.error) throw up.error;
    return `${sb.storage.from("avatars").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  } catch (err) {
    console.error(`[avatar] ${agentId} store failed: ${(err as Error).message}`);
    return dicebearUrl(agentId);
  }
}
