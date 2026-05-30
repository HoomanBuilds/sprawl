import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";
import { createPublicClient, http } from "viem";
import { mantleSepolia } from "@/lib/chains";

const publicClient = createPublicClient({
  chain: mantleSepolia,
  transport: http(process.env.MANTLE_SEPOLIA_RPC_URL || "https://rpc.sepolia.mantle.xyz"),
});

// 7 days in seconds
const SESSION_DURATION = 7 * 24 * 60 * 60;

export async function POST(req: NextRequest) {
  try {
    const { message, signature } = await req.json();

    if (!message || !signature) {
      return NextResponse.json({ error: "Missing message or signature" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const storedNonce = cookieStore.get("siwe_nonce")?.value;

    if (!storedNonce) {
      return NextResponse.json({ error: "Nonce not found or expired" }, { status: 400 });
    }

    const parsedMessage = parseSiweMessage(message);

    if (parsedMessage.nonce !== storedNonce) {
      return NextResponse.json({ error: "Invalid nonce" }, { status: 400 });
    }

    // Validate against the request's own host to prevent cross-domain replay
    const requestHost = req.headers.get("host") ?? undefined;
    const isValid = validateSiweMessage({
      message: parsedMessage,
      domain: requestHost,
      nonce: storedNonce,
    });
    if (!isValid) {
      return NextResponse.json({ error: "Invalid SIWE message" }, { status: 400 });
    }

    const valid = await publicClient.verifyMessage({
      address: parsedMessage.address!,
      message,
      signature: signature as `0x${string}`,
    });

    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    cookieStore.delete("siwe_nonce");

    const sessionData = JSON.stringify({
      address: parsedMessage.address,
      chainId: parsedMessage.chainId,
      issuedAt: new Date().toISOString(),
    });

    cookieStore.set("siwe_session", Buffer.from(sessionData).toString("base64"), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: SESSION_DURATION,
      path: "/",
    });

    return NextResponse.json({ ok: true, address: parsedMessage.address });
  } catch (error) {
    console.error("Error verifying signature:", error);
    return NextResponse.json({ error: "Failed to verify signature" }, { status: 500 });
  }
}
