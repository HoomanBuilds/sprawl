import { getSupabaseAdmin } from "@/lib/supabase";
import { ERC8004, MANTLE_SEPOLIA_CHAIN_ID } from "@/lib/config";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://sprawl.vercel.app";

const STRATEGY_LABELS = ["Preset", "Rules", "LLM"];

export interface RegistrationCard {
  type: string;
  name: string;
  description: string;
  image: string;
  endpoints: { name: string; endpoint: string }[];
  registrations: { agentId: number; agentRegistry: string }[];
  supportedTrust: string[];
}

// Build an ERC-8004 registration JSON. Looks up the agent by tokenId (agent_id)
// or by wallet_address. If the row does not exist yet (e.g. during spawn, before
// the agents row is written), returns a minimal valid card.
export async function buildRegistrationCard(opts: {
  agentId?: number;
  wallet?: string | null;
}): Promise<RegistrationCard> {
  const { agentId, wallet } = opts;
  const supabase = getSupabaseAdmin();

  let agent:
    | {
        agent_id: number;
        name: string | null;
        persona: string | null;
        strategy_type: number | null;
        xp_level: number | null;
      }
    | null = null;

  const selectCols = "agent_id, name, persona, strategy_type, xp_level";

  if (typeof agentId === "number" && !Number.isNaN(agentId)) {
    const { data } = await supabase
      .from("agents")
      .select(selectCols)
      .eq("agent_id", agentId)
      .single();
    agent = data ?? null;
  } else if (wallet) {
    const { data } = await supabase
      .from("agents")
      .select(selectCols)
      .ilike("wallet_address", wallet)
      .single();
    agent = data ?? null;
  }

  const registry = `eip155:${MANTLE_SEPOLIA_CHAIN_ID}:${ERC8004.IdentityRegistry}`;

  if (!agent) {
    // Minimal valid card — the row may not exist yet during spawn.
    return {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name: "Sprawl Agent",
      description: "Autonomous DeFi agent in The Sprawl.",
      image: `${APP_URL}/og-default.png`,
      endpoints: [{ name: "web", endpoint: APP_URL }],
      registrations: [],
      supportedTrust: ["reputation"],
    };
  }

  const strategyLabel =
    STRATEGY_LABELS[agent.strategy_type ?? 0] ?? "Unknown";

  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: agent.name ?? `Sprawl Agent #${agent.agent_id}`,
    description:
      agent.persona ||
      `Autonomous DeFi agent in The Sprawl. Strategy: ${strategyLabel}. Level ${agent.xp_level ?? 1}.`,
    image: `${APP_URL}/api/share-card/${agent.agent_id}`,
    endpoints: [{ name: "web", endpoint: APP_URL }],
    registrations: [{ agentId: agent.agent_id, agentRegistry: registry }],
    supportedTrust: ["reputation"],
  };
}
