import { readFileSync } from "node:fs";
import { Wallet, Contract, Interface } from "ethers";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const REG_ABI = [
  "function register(string) returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

const wei = (human: number) => (BigInt(Math.round(human)) * 10n ** 18n).toString();
const xpForLevel = (n: number) => Math.floor(25 * Math.pow(n, 2.2));

interface Demo {
  name: string;
  persona: string;
  strategyType: 0 | 1 | 2;
  district: string;
  level: number;
  volume: number;
  sprawl: number;
  pnl: number;
  raidWins: number;
  raidLosses: number;
  rep: number;
  active: boolean;
}

const DEMO: Demo[] = [
  { name: "Aether Prime", persona: "Momentum scalper chasing sETH breakouts.", strategyType: 0, district: "Core", level: 22, volume: 9200, sprawl: 5400, pnl: 2100, raidWins: 14, raidLosses: 3, rep: 95, active: true },
  { name: "NeonQuant", persona: "Rule-based mean-reversion bot.", strategyType: 1, district: "Core", level: 18, volume: 6100, sprawl: 3300, pnl: 1400, raidWins: 9, raidLosses: 4, rep: 88, active: true },
  { name: "Oracle-7", persona: "LLM-driven macro trader, reads the whole pool.", strategyType: 2, district: "Heights", level: 16, volume: 4800, sprawl: 2600, pnl: 900, raidWins: 7, raidLosses: 5, rep: 84, active: true },
  { name: "VoltTrader", persona: "Aggressive sBTC swing strategy.", strategyType: 0, district: "Heights", level: 13, volume: 3200, sprawl: 1500, pnl: 420, raidWins: 5, raidLosses: 6, rep: 72, active: false },
  { name: "GridKeeper", persona: "Conservative grid LP provider.", strategyType: 1, district: "Outskirts", level: 11, volume: 2400, sprawl: 1100, pnl: 260, raidWins: 3, raidLosses: 2, rep: 68, active: true },
  { name: "SolFlare", persona: "sSOL volatility hunter.", strategyType: 2, district: "Outskirts", level: 9, volume: 1700, sprawl: 720, pnl: -120, raidWins: 2, raidLosses: 7, rep: 61, active: false },
  { name: "Ledger Lyn", persona: "Patient value accumulator.", strategyType: 1, district: "Core", level: 7, volume: 980, sprawl: 410, pnl: 150, raidWins: 1, raidLosses: 1, rep: 57, active: true },
  { name: "ByteWolf", persona: "LLM raider, builds war chest then strikes.", strategyType: 2, district: "Heights", level: 6, volume: 720, sprawl: 300, pnl: -60, raidWins: 4, raidLosses: 8, rep: 49, active: false },
  { name: "PixelPilot", persona: "Preset trend-follower, just spawned.", strategyType: 0, district: "Outskirts", level: 3, volume: 240, sprawl: 90, pnl: 20, raidWins: 0, raidLosses: 1, rep: 44, active: true },
  { name: "Nano", persona: "Fresh agent finding its footing.", strategyType: 1, district: "Outskirts", level: 1, volume: 60, sprawl: 0, pnl: 0, raidWins: 0, raidLosses: 0, rep: 40, active: false },
];

async function main() {
  const { CONTRACTS, ERC8004 } = await import("../src/lib/config");
  const { getMantleSepoliaProvider, getDeployerWallet } = await import("../src/lib/ethers-provider");
  const { getSupabaseAdmin } = await import("../src/lib/supabase");
  const { ensureAvatar } = await import("../src/lib/avatar");
  const CityStateArtifact = (await import("../src/constants/abi/CityState.json")).default;

  const provider = getMantleSepoliaProvider();
  const deployer = getDeployerWallet();
  const owner = deployer.address;
  const sb = getSupabaseAdmin();

  console.log(`Seeding ${DEMO.length} demo agents owned by backend wallet ${owner}`);

  let nonce = await provider.getTransactionCount(deployer.address, "pending");
  const registry = new Contract(ERC8004.IdentityRegistry, REG_ABI, deployer);
  const cityState = new Contract(CONTRACTS.CityState, CityStateArtifact.abi, deployer);
  const iface = new Interface(REG_ABI);

  for (const d of DEMO) {
    try {
      const agentAddress = Wallet.createRandom().address;
      const uri = `https://sprawl.vercel.app/api/agent/registration.json?wallet=${agentAddress}`;

      const regReceipt = await (await registry.register(uri, { nonce: nonce++ })).wait();
      let tokenId: number | null = null;
      for (const log of regReceipt.logs) {
        try {
          const p = iface.parseLog({ topics: log.topics, data: log.data });
          if (p?.name === "Transfer") { tokenId = Number(p.args.tokenId); break; }
        } catch {}
      }
      if (tokenId === null) { console.error(`✗ ${d.name}: no tokenId`); continue; }

      await (await cityState.spawnAgent(tokenId, agentAddress, d.strategyType, { nonce: nonce++ })).wait();

      const policy = { rules: [], riskTolerance: "medium", maxPositionSize: 30, maxSlippageBps: 200, allowedProtocols: ["SprawlDEX"] };
      const { error } = await sb.from("agents").insert({
        agent_id: tokenId,
        wallet_address: agentAddress,
        owner_address: owner,
        name: d.name,
        persona: d.persona,
        strategy_type: d.strategyType,
        policy_config: policy,
        strategy_count: 0,
        xp_level: d.level,
        xp_total: xpForLevel(d.level),
        sprawl_lifetime_earned: wei(d.sprawl),
        total_volume: d.volume,
        net_pnl: wei(d.pnl),
        raid_wins: d.raidWins,
        raid_losses: d.raidLosses,
        reputation_score: d.rep,
        district: d.district,
        last_action_at: d.active
          ? new Date().toISOString()
          : new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      });
      if (error) { console.error(`✗ ${d.name}: ${error.message}`); continue; }

      const avatar = await ensureAvatar(tokenId, d.strategyType);
      await sb.from("agents").update({ avatar_url: avatar }).eq("agent_id", tokenId);
      await sb.from("activity_feed").insert({
        event_type: "spawn",
        actor_id: tokenId,
        metadata: { name: d.name, strategyType: d.strategyType },
      });

      console.log(`✓ #${tokenId} ${d.name} — L${d.level} ${avatar.includes("dicebear") ? "(dicebear)" : "(ai)"}`);
    } catch (err) {
      console.error(`✗ ${d.name}: ${(err as Error).message}`);
    }
  }
  console.log("Done.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
