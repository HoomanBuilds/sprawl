import { NextRequest, NextResponse } from "next/server";
import { Wallet, Contract, Interface, parseEther } from "ethers";
import { getAuthenticatedAddress } from "@/lib/auth";
import { validatePolicy } from "@/lib/policy-schema";
import { STRATEGY_PRESETS } from "@/lib/strategy-presets";
import { getMantleSepoliaProvider, getDeployerWallet } from "@/lib/ethers-provider";
import { CONTRACTS, ERC8004 } from "@/lib/config";
import { getSupabaseAdmin } from "@/lib/supabase";
import { storeAgentWallet } from "@/lib/execution/wallet-manager";
import { ensureAvatar } from "@/lib/avatar";
import AgentFaucetArtifact from "@/constants/abi/AgentFaucet.json";
import CityStateArtifact from "@/constants/abi/CityState.json";
import type { AgentPolicy } from "@/types/agent";

const IDENTITY_REGISTRY_ABI = [
  "function register(string) returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://sprawl.vercel.app";

interface SpawnBody {
  name?: string;
  strategyType?: number;
  presetName?: string;
  customPolicy?: unknown;
  persona?: string;
}

export async function POST(req: NextRequest) {
  let createdAgentId: number | null = null;
  const supabase = getSupabaseAdmin();

  try {
    const address = await getAuthenticatedAddress();
    if (!address) {
      return NextResponse.json({ error: "Connect wallet first" }, { status: 401 });
    }

    const body = (await req.json()) as SpawnBody;
    const { name, strategyType, presetName, customPolicy, persona } = body;

    if (!name || name.length < 2 || name.length > 32) {
      return NextResponse.json(
        { error: "Name must be 2-32 characters" },
        { status: 400 }
      );
    }

    if (![0, 1, 2].includes(strategyType as number)) {
      return NextResponse.json({ error: "Invalid strategy type" }, { status: 400 });
    }

    // Resolve the policy: preset takes precedence, else custom. LLM agents
    // (strategyType 2) carry no rules — the model decides each tick.
    let rawPolicy: unknown;
    if (presetName) {
      const preset = STRATEGY_PRESETS[presetName];
      if (!preset) {
        return NextResponse.json(
          { error: `Unknown preset: ${presetName}` },
          { status: 400 }
        );
      }
      rawPolicy = preset;
    } else if (customPolicy) {
      rawPolicy = customPolicy;
    } else if (strategyType === 2) {
      rawPolicy = {
        rules: [],
        riskTolerance: "medium",
        maxPositionSize: 30,
        maxSlippageBps: 200,
        allowedProtocols: ["SprawlDEX"],
      };
    } else {
      return NextResponse.json(
        { error: "Provide either presetName or customPolicy" },
        { status: 400 }
      );
    }

    const validation = validatePolicy(rawPolicy);
    if (!validation.ok || !validation.policy) {
      return NextResponse.json(
        { error: `Invalid policy: ${validation.error}` },
        { status: 400 }
      );
    }
    const policy: AgentPolicy = validation.policy;

    const provider = getMantleSepoliaProvider();
    const deployer = getDeployerWallet();

    // Manage the deployer nonce explicitly: withTxLock is a no-op on Vercel.
    let nonce = await provider.getTransactionCount(deployer.address, "pending");

    // a. Generate the agent wallet (not yet persisted — we don't know tokenId).
    const agentWallet = Wallet.createRandom();
    const agentAddress = agentWallet.address;

    // b. Register ERC-8004 identity (deployer signs). agentURI uses the wallet
    //    form because the tokenId does not exist yet.
    const agentURI = `${APP_URL}/api/agent/registration.json?wallet=${agentAddress}`;
    const registry = new Contract(
      ERC8004.IdentityRegistry,
      IDENTITY_REGISTRY_ABI,
      deployer
    );
    const iface = new Interface(IDENTITY_REGISTRY_ABI);

    const registerTx = await registry.register(agentURI, { nonce: nonce++ });
    const registerReceipt = await registerTx.wait();

    let tokenId: number | null = null;
    for (const log of registerReceipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.name === "Transfer") {
          tokenId = Number(parsed.args.tokenId);
          break;
        }
      } catch {
        // Not a Transfer log from this ABI — skip.
      }
    }

    if (tokenId === null) {
      return NextResponse.json(
        { error: "Failed to parse ERC-8004 tokenId from registration receipt" },
        { status: 500 }
      );
    }

    // c. Insert the agents row — agent_id IS the ERC-8004 tokenId.
    const { error: insertError } = await supabase.from("agents").insert({
      agent_id: tokenId,
      wallet_address: agentAddress,
      owner_address: address,
      name,
      persona:
        persona ||
        `Autonomous DeFi agent "${name}" spawned by ${address}`,
      strategy_type: strategyType,
      policy_config: policy,
      strategy_count: policy.rules.length,
    });

    if (insertError) {
      console.error("Failed to insert agent:", insertError);
      return NextResponse.json(
        { error: "Failed to create agent record" },
        { status: 500 }
      );
    }
    createdAgentId = tokenId;

    // d. Persist the encrypted agent wallet under the tokenId.
    await storeAgentWallet(tokenId, agentWallet);

    // e. Fund the agent wallet via AgentFaucet (deployer signs).
    const faucet = new Contract(
      CONTRACTS.AgentFaucet,
      AgentFaucetArtifact.abi,
      deployer
    );
    const fundTx = await faucet.fundNewAgent(agentAddress, { nonce: nonce++ });
    await fundTx.wait();

    // e2. Fund the agent wallet with MNT for gas — the faucet only mints tokens,
    //     and the agent signs its own swaps, so it needs gas to trade.
    const gasTx = await deployer.sendTransaction({
      to: agentAddress,
      value: parseEther("0.3"),
      nonce: nonce++,
    });
    await gasTx.wait();

    // f. Register the agent in CityState (deployer signs).
    const cityState = new Contract(
      CONTRACTS.CityState,
      CityStateArtifact.abi,
      deployer
    );
    const spawnTx = await cityState.spawnAgent(
      tokenId,
      agentAddress,
      strategyType,
      { nonce: nonce++ }
    );
    await spawnTx.wait();

    // g. Record the spawn in the activity feed.
    await supabase.from("activity_feed").insert({
      event_type: "spawn",
      actor_id: tokenId,
      metadata: { name, strategyType },
    });

    // h. Generate the agent avatar (best-effort; falls back to DiceBear).
    const avatarUrl = await ensureAvatar(tokenId, strategyType as number);
    await supabase
      .from("agents")
      .update({ avatar_url: avatarUrl })
      .eq("agent_id", tokenId);

    return NextResponse.json({
      ok: true,
      agentId: tokenId,
      walletAddress: agentAddress,
    });
  } catch (error) {
    console.error("Spawn error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: `Spawn failed: ${message}`,
        agentId: createdAgentId,
        partial: createdAgentId !== null,
      },
      { status: 500 }
    );
  }
}
