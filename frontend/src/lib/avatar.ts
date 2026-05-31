import sharp from "sharp";
import { removeBackground as imglyRemove } from "@imgly/background-removal-node";
import { getSupabaseAdmin } from "@/lib/supabase";

const ARCHETYPE: Record<number, string> = {
  0: "a calm methodical trader creature with cyan and teal accents",
  1: "a sharp rule-bound trader creature with lime green accents",
  2: "a clever autonomous AI trader creature with purple accents",
};

// Always appended so any prompt (incl. a user's) yields a single avatar creature,
// never a random scene.
const AVATAR_STYLE =
  "as a single 16-bit pixel art creature avatar sprite, chibi style, vivid saturated " +
  "colors, sharp pixel edges, centered, full body, one character only, facing viewer, " +
  "plain solid background";

export function buildPrompt(strategyType: number, custom?: string): string {
  const subject = custom && custom.trim() ? custom.trim() : ARCHETYPE[strategyType] ?? ARCHETYPE[0];
  return `${subject}, ${AVATAR_STYLE}`;
}

export function dicebearUrl(agentId: number): string {
  return `https://api.dicebear.com/9.x/pixel-art/png?seed=agent${agentId}&size=256`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isImage = (ct: string | null, n: number) => !!ct && ct.startsWith("image/") && n > 2048;

// ── Generators (each returns raw image bytes or throws) ──

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
  const b64 = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
  if (!b64) throw new Error("gemini no image");
  return Buffer.from(b64, "base64");
}

async function fromTogether(prompt: string, seed: number): Promise<Buffer> {
  const key = process.env.TOGETHER_API_KEY;
  if (!key) throw new Error("no Together key");
  const res = await fetch("https://api.together.xyz/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "black-forest-labs/FLUX.1-schnell-Free",
      prompt,
      width: 512,
      height: 512,
      n: 1,
      seed,
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

async function fromCloudflare(prompt: string, seed: number): Promise<Buffer> {
  const acct = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!acct || !token) throw new Error("no Cloudflare creds");
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ prompt, steps: 6, seed }),
      signal: AbortSignal.timeout(50000),
    }
  );
  if (!res.ok) throw new Error(`cloudflare ${res.status}`);
  const json = (await res.json()) as { result?: { image?: string } };
  const b64 = json.result?.image;
  if (!b64) throw new Error("cloudflare no image");
  return Buffer.from(b64, "base64");
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
  if (!res.ok || !isImage(res.headers.get("content-type"), buf.length)) throw new Error(`huggingface ${res.status}`);
  return buf;
}

async function fromPollinations(prompt: string, seed: number): Promise<Buffer> {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true&seed=${seed}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(40000) });
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok || !isImage(res.headers.get("content-type"), buf.length)) throw new Error(`pollinations ${res.status} (${buf.length}b)`);
  return buf;
}

// Keyed free-tier providers first (reliable), then no-key Pollinations with backoff.
async function generateRaw(strategyType: number, seed: number, custom?: string): Promise<Buffer | null> {
  const prompt = buildPrompt(strategyType, custom);
  const keyed: Array<() => Promise<Buffer>> = [];
  if (process.env.GEMINI_API_KEY) keyed.push(() => fromGemini(prompt));
  if (process.env.TOGETHER_API_KEY) keyed.push(() => fromTogether(prompt, seed));
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) keyed.push(() => fromCloudflare(prompt, seed));
  if (process.env.HUGGINGFACE_API_KEY) keyed.push(() => fromHuggingFace(prompt));
  for (const gen of keyed) {
    try { return await gen(); }
    catch (err) { console.warn(`[avatar] keyed provider failed: ${(err as Error).message}`); }
  }
  const seeds = [seed, seed + 1000, seed + 2000, seed + 3000];
  for (let i = 0; i < seeds.length; i++) {
    try { return await fromPollinations(prompt, seeds[i]); }
    catch (err) {
      console.warn(`[avatar] pollinations seed ${seeds[i]} failed: ${(err as Error).message}`);
      if (i < seeds.length - 1) await sleep(3000 * (i + 1));
    }
  }
  return null;
}

// AI foreground segmentation — cleanly cuts out the creature (never eats interior
// pixels, unlike colour keying), returns a transparent PNG.
export async function removeWhiteBackground(input: Buffer): Promise<Buffer> {
  const png = await sharp(input).png().toBuffer();
  const out = await imglyRemove(new Blob([new Uint8Array(png)], { type: "image/png" }), {
    output: { format: "image/png" },
  });
  return Buffer.from(await out.arrayBuffer());
}

async function buildAvatarPng(strategyType: number, seed: number, custom?: string): Promise<Buffer | null> {
  const raw = await generateRaw(strategyType, seed, custom);
  if (!raw) return null;
  try { return await removeWhiteBackground(raw); }
  catch (err) { console.warn(`[avatar] segmentation failed: ${(err as Error).message}`); return raw; }
}

export interface AvatarOptions { prompt?: string; seed?: number; }

// Preview (no upload) — for the spawn page regenerate/custom-prompt flow.
export async function generateAvatarPreview(
  strategyType: number,
  opts?: AvatarOptions
): Promise<{ dataUrl: string; seed: number } | null> {
  const seed = opts?.seed ?? Math.floor(Math.random() * 1_000_000_000);
  const png = await buildAvatarPng(strategyType, seed, opts?.prompt);
  if (!png) return null;
  return { dataUrl: `data:image/png;base64,${png.toString("base64")}`, seed };
}

// Generate + persist under the agent id. Same (prompt, seed) reproduces the preview.
export async function ensureAvatar(
  agentId: number,
  strategyType: number,
  opts?: AvatarOptions
): Promise<string> {
  const sb = getSupabaseAdmin();
  const seed = opts?.seed ?? agentId;
  const png = await buildAvatarPng(strategyType, seed, opts?.prompt);
  if (!png) {
    console.error(`[avatar] ${agentId} all generators failed — using dicebear`);
    return dicebearUrl(agentId);
  }
  try {
    const path = `${agentId}.png`;
    const up = await sb.storage.from("avatars").upload(path, png, { contentType: "image/png", upsert: true });
    if (up.error) throw up.error;
    return `${sb.storage.from("avatars").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  } catch (err) {
    console.error(`[avatar] ${agentId} store failed: ${(err as Error).message}`);
    return dicebearUrl(agentId);
  }
}
