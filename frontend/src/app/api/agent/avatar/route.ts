import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAddress } from "@/lib/auth";
import { generateAvatarPreview } from "@/lib/avatar";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  strategyType?: number;
  prompt?: string;
  seed?: number;
}

export async function POST(req: NextRequest) {
  try {
    const address = await getAuthenticatedAddress();
    if (!address) {
      return NextResponse.json({ error: "Connect wallet first" }, { status: 401 });
    }

    const { strategyType, prompt, seed } = (await req.json()) as Body;
    const type = [0, 1, 2].includes(strategyType as number) ? (strategyType as number) : 2;
    const cleanPrompt = typeof prompt === "string" ? prompt.slice(0, 200) : undefined;

    const result = await generateAvatarPreview(type, { prompt: cleanPrompt, seed });
    if (!result) {
      return NextResponse.json({ error: "All avatar generators are busy — try again" }, { status: 503 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Avatar preview error:", error);
    return NextResponse.json({ error: "Avatar generation failed" }, { status: 500 });
  }
}
