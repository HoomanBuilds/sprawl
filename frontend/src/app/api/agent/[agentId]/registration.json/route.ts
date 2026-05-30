import { NextRequest, NextResponse } from "next/server";
import { buildRegistrationCard } from "@/lib/registration-card";

// GET /api/agent/[agentId]/registration.json
// Also supports ?wallet=0x... for lookups before a tokenId exists.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const wallet = req.nextUrl.searchParams.get("wallet");

  const id = parseInt(agentId, 10);
  const card = await buildRegistrationCard({
    agentId: Number.isNaN(id) ? undefined : id,
    wallet,
  });

  return NextResponse.json(card, {
    headers: { "Content-Type": "application/json" },
  });
}
