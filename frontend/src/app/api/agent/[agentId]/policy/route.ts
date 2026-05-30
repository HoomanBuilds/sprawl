import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAddress } from "@/lib/auth";
import { validatePolicy } from "@/lib/policy-schema";
import { getSupabaseAdmin } from "@/lib/supabase";

// GET /api/agent/[agentId]/policy — read the current policy.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const id = parseInt(agentId, 10);

  if (Number.isNaN(id) || id < 1) {
    return NextResponse.json({ error: "Invalid agent ID" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: agent, error } = await supabase
    .from("agents")
    .select("agent_id, name, strategy_type, policy_config")
    .eq("agent_id", id)
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json({
    agentId: agent.agent_id,
    name: agent.name,
    strategyType: agent.strategy_type,
    policy: agent.policy_config,
  });
}

// POST /api/agent/[agentId]/policy — update the policy (owner only).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const address = await getAuthenticatedAddress();
    if (!address) {
      return NextResponse.json({ error: "Connect wallet first" }, { status: 401 });
    }

    const { agentId } = await params;
    const id = parseInt(agentId, 10);

    if (Number.isNaN(id) || id < 1) {
      return NextResponse.json({ error: "Invalid agent ID" }, { status: 400 });
    }

    const body = await req.json();
    const { policy, strategyType } = body as {
      policy: unknown;
      strategyType?: number;
    };

    const validation = validatePolicy(policy);
    if (!validation.ok || !validation.policy) {
      return NextResponse.json(
        { error: `Invalid policy: ${validation.error}` },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Verify ownership.
    const { data: agent, error: fetchError } = await supabase
      .from("agents")
      .select("agent_id, owner_address")
      .eq("agent_id", id)
      .single();

    if (fetchError || !agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (agent.owner_address.toLowerCase() !== address.toLowerCase()) {
      return NextResponse.json({ error: "Not your agent" }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {
      policy_config: validation.policy,
      strategy_count: validation.policy.rules.length,
    };

    if (strategyType !== undefined && [0, 1, 2].includes(strategyType)) {
      updateData.strategy_type = strategyType;
    }

    const { error: updateError } = await supabase
      .from("agents")
      .update(updateData)
      .eq("agent_id", id);

    if (updateError) {
      console.error("Failed to update policy:", updateError);
      return NextResponse.json(
        { error: "Failed to update policy" },
        { status: 500 }
      );
    }

    await supabase.from("activity_feed").insert({
      event_type: "policy_update",
      actor_id: id,
      metadata: {
        rules_count: validation.policy.rules.length,
        risk_tolerance: validation.policy.riskTolerance,
      },
    });

    return NextResponse.json({
      ok: true,
      agentId: id,
      policy: validation.policy,
    });
  } catch (error) {
    console.error("Policy update error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Internal server error: ${message}` },
      { status: 500 }
    );
  }
}
