import { NextRequest, NextResponse } from "next/server";
import { buildRegistrationCard } from "@/lib/registration-card";

// GET /api/agent/registration.json?wallet=0x...
// Used as the ERC-8004 agentURI during spawn, before a tokenId exists.
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  const card = await buildRegistrationCard({ wallet });
  return NextResponse.json(card, {
    headers: { "Content-Type": "application/json" },
  });
}
