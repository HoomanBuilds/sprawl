import { NextRequest, NextResponse } from "next/server";
import { Contract, Interface, parseEther } from "ethers";
import { getAuthenticatedAddress } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getDeployerWallet } from "@/lib/ethers-provider";
import { getAgentWallet } from "@/lib/execution/wallet-manager";
import { CONTRACTS } from "@/lib/config";
import { checkAchievements } from "@/lib/achievements";
import { trackDailyMission } from "@/lib/dailies";
import {
  getEffectiveMaxRaids,
  isWeeklyCooldownActive,
  XP_WIN_ATTACKER,
} from "@/lib/raid";
import SprawlTokenAbi from "@/constants/abi/SprawlToken.json";
import RaidContractAbi from "@/constants/abi/RaidContract.json";

const XP_LOSS_ATTACKER = 15;
const RAID_COST_SPRAWL = "5";

interface ExecuteBody {
  attackerId?: number;
  defenderId?: number;
}

export async function POST(req: NextRequest) {
  try {
    const address = await getAuthenticatedAddress();
    if (!address) {
      return NextResponse.json({ error: "Connect wallet first" }, { status: 401 });
    }

    const body = (await req.json()) as ExecuteBody;
    const { attackerId, defenderId } = body;

    if (
      typeof attackerId !== "number" ||
      typeof defenderId !== "number" ||
      attackerId === defenderId
    ) {
      return NextResponse.json(
        { error: "attackerId and defenderId must be distinct numbers" },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();

    const [attackerRes, defenderRes] = await Promise.all([
      admin
        .from("agents")
        .select(
          "agent_id, name, owner_address, wallet_address, total_volume, strategy_count, reputation_score, reputation_given, profit_streak, raid_xp, recent_actions"
        )
        .eq("agent_id", attackerId)
        .single(),
      admin
        .from("agents")
        .select(
          "agent_id, name, total_volume, strategy_count, reputation_score, reputation_given, profit_streak, raid_xp, recent_actions"
        )
        .eq("agent_id", defenderId)
        .single(),
    ]);

    const attacker = attackerRes.data;
    const defender = defenderRes.data;

    if (!attacker) {
      return NextResponse.json({ error: "Attacker agent not found" }, { status: 404 });
    }
    if (!defender) {
      return NextResponse.json({ error: "Defender agent not found" }, { status: 404 });
    }

    if ((attacker.owner_address ?? "").toLowerCase() !== address.toLowerCase()) {
      return NextResponse.json(
        { error: "You do not own the attacking agent" },
        { status: 403 }
      );
    }

    // Daily raid limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count: raidsToday } = await admin
      .from("raids")
      .select("id", { count: "exact", head: true })
      .eq("attacker_id", attackerId)
      .gte("created_at", todayStart.toISOString());

    if ((raidsToday ?? 0) >= getEffectiveMaxRaids()) {
      return NextResponse.json({ error: "Daily raid limit reached" }, { status: 429 });
    }

    // Weekly per-target cooldown
    if (isWeeklyCooldownActive()) {
      const now = new Date();
      const isoWeekStart = new Date(now);
      const dayOfWeek = now.getDay();
      isoWeekStart.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
      isoWeekStart.setHours(0, 0, 0, 0);

      const { count: weeklyPairCount } = await admin
        .from("raids")
        .select("id", { count: "exact", head: true })
        .eq("attacker_id", attackerId)
        .eq("defender_id", defenderId)
        .gte("created_at", isoWeekStart.toISOString());

      if ((weeklyPairCount ?? 0) > 0) {
        return NextResponse.json(
          { error: "Already raided this target this week" },
          { status: 429 }
        );
      }
    }

    // Load the attacker's server wallet (pays the 5 SPRAWL raid cost).
    const attackerWallet = await getAgentWallet(attackerId);
    const attackerWalletAddress = attackerWallet.address;

    // 1. Agent wallet approves the RaidContract to pull the raid cost.
    const sprawl = new Contract(CONTRACTS.SPRAWL, SprawlTokenAbi.abi, attackerWallet);
    const approveTx = await sprawl.approve(
      CONTRACTS.RaidContract,
      parseEther(RAID_COST_SPRAWL)
    );
    await approveTx.wait();

    // 2. Deployer (onlyOwner) executes the raid. The contract scores both sides,
    //    decides the winner, records to CityState, burns 5 SPRAWL, emits RaidResult.
    const raidContract = new Contract(
      CONTRACTS.RaidContract,
      RaidContractAbi.abi,
      getDeployerWallet()
    );
    const raidTx = await raidContract.initiateRaid(
      attackerId,
      defenderId,
      attackerWalletAddress
    );
    const receipt = await raidTx.wait();

    // Parse the RaidResult event for the on-chain outcome.
    const iface = new Interface(RaidContractAbi.abi);
    let attackerWon = false;
    let attackScore = 0;
    let defenseScore = 0;

    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.name === "RaidResult") {
          attackerWon = Boolean(parsed.args.attackerWon);
          attackScore = Number(BigInt(parsed.args.attackScore));
          defenseScore = Number(BigInt(parsed.args.defenseScore));
          break;
        }
      } catch {
        // Not a RaidResult log — skip.
      }
    }

    const txHash: string = receipt.hash;

    // Persist the raid-XP counter (drives raid achievements + titles) and grant
    // general XP (uncapped raid source). The indexer separately syncs the raids
    // table + raid_wins/raid_losses from RaidRecorded/RaidResult events.
    const raidXpEarned = attackerWon ? XP_WIN_ATTACKER : XP_LOSS_ATTACKER;
    await Promise.all([
      admin.rpc("increment_raid_xp", {
        p_agent_id: attackerId,
        p_amount: raidXpEarned,
      }),
      admin.rpc("grant_xp", {
        p_agent_id: attackerId,
        p_source: attackerWon ? "raid_win" : "raid_loss",
        p_amount: raidXpEarned,
      }),
    ]);

    await trackDailyMission(attackerId, "attempt_raid");
    if (attackerWon) await trackDailyMission(attackerId, "win_raid");

    const newAttackerRaidXp = (attacker.raid_xp ?? 0) + raidXpEarned;

    const newAchievements = await checkAchievements(
      attackerId,
      {
        total_trades: attacker.recent_actions ?? 0,
        protocols_used: attacker.strategy_count ?? 0,
        reputation_score: attacker.reputation_score ?? 0,
        agents_spawned: 0,
        reputation_given: attacker.reputation_given ?? 0,
        gifts_sent: 0,
        gifts_received: 0,
        profit_streak: attacker.profit_streak ?? 0,
        raid_xp: newAttackerRaidXp,
      },
      attacker.name ?? undefined
    );

    await admin.from("activity_feed").insert({
      event_type: attackerWon ? "raid_success" : "raid_failed",
      actor_id: attackerId,
      target_id: defenderId,
      metadata: {
        attacker_name: attacker.name,
        defender_name: defender.name,
        attacker_won: attackerWon,
        attack_score: attackScore,
        defense_score: defenseScore,
        tx_hash: txHash,
      },
    });

    return NextResponse.json({
      ok: true,
      attackerWon,
      attackScore,
      defenseScore,
      txHash,
      newAchievements,
    });
  } catch (error) {
    console.error("Raid execute error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Raid failed: ${message}` },
      { status: 500 }
    );
  }
}
