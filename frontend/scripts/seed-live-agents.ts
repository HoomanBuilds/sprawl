import { readFileSync } from "node:fs";
import { Wallet, Contract, Interface, parseEther } from "ethers";

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
const GAS_MNT = "0.3";
const INIT_PORTFOLIO = wei(15000); // ~ faucet-funded value, P&L baseline

interface Demo {
  name: string; persona: string; strategyType: 0 | 1 | 2; district: string;
  level: number; volume: number; sprawl: number; rep: number;
}

const DEMO: Demo[] = [
  { name: "Aether Prime", persona: "Momentum scalper chasing sETH breakouts.", strategyType: 2, district: "Core", level: 12, volume: 4200, sprawl: 1400, rep: 90 },
  { name: "NeonQuant", persona: "Rule-based mean-reversion bot.", strategyType: 1, district: "Core", level: 10, volume: 3100, sprawl: 980, rep: 84 },
  { name: "Oracle-7", persona: "LLM-driven macro trader, reads the whole pool.", strategyType: 2, district: "Heights", level: 9, volume: 2400, sprawl: 760, rep: 80 },
  { name: "VoltTrader", persona: "Aggressive sBTC swing strategy.", strategyType: 0, district: "Heights", level: 7, volume: 1600, sprawl: 400, rep: 72 },
  { name: "GridKeeper", persona: "Conservative grid trader.", strategyType: 1, district: "Outskirts", level: 6, volume: 1100, sprawl: 300, rep: 68 },
  { name: "SolFlare", persona: "sSOL volatility hunter.", strategyType: 2, district: "Outskirts", level: 5, volume: 720, sprawl: 180, rep: 61 },
  { name: "Ledger Lyn", persona: "Patient value accumulator.", strategyType: 0, district: "Core", level: 4, volume: 460, sprawl: 110, rep: 57 },
  { name: "ByteWolf", persona: "LLM raider, builds a war chest then strikes.", strategyType: 2, district: "Heights", level: 3, volume: 240, sprawl: 60, rep: 49 },
];

const POLICY = { rules: [], riskTolerance: "medium", maxPositionSize: 30, maxSlippageBps: 200, allowedProtocols: ["SprawlDEX"] };

async function main() {
  const { CONTRACTS, ERC8004 } = await import("../src/lib/config");
  const { getMantleSepoliaProvider, getDeployerWallet } = await import("../src/lib/ethers-provider");
  const { getSupabaseAdmin } = await import("../src/lib/supabase");
  const { ensureAvatar } = await import("../src/lib/avatar");
  const { storeAgentWallet } = await import("../src/lib/execution/wallet-manager");
  const CityStateArtifact = (await import("../src/constants/abi/CityState.json")).default;
  const AgentFaucetArtifact = (await import("../src/constants/abi/AgentFaucet.json")).default;

  const provider = getMantleSepoliaProvider();
  const deployer = getDeployerWallet();
  const owner = deployer.address;
  const sb = getSupabaseAdmin();

  // Clean up prior backend-owned (static) demo agents.
  const { data: prior } = await sb.from("agents").select("agent_id").eq("owner_address", owner);
  const priorIds = (prior ?? []).map((p) => p.agent_id);
  if (priorIds.length) {
    await sb.from("activity_feed").delete().in("actor_id", priorIds);
    await sb.from("agent_wallets").delete().in("agent_id", priorIds);
    await sb.from("agents").delete().in("agent_id", priorIds);
    console.log(`Cleaned up ${priorIds.length} prior demo agents.`);
  }

  console.log(`Seeding ${DEMO.length} LIVE agents owned by ${owner}`);
  let nonce = await provider.getTransactionCount(deployer.address, "pending");
  const registry = new Contract(ERC8004.IdentityRegistry, REG_ABI, deployer);
  const faucet = new Contract(CONTRACTS.AgentFaucet, AgentFaucetArtifact.abi, deployer);
  const cityState = new Contract(CONTRACTS.CityState, CityStateArtifact.abi, deployer);
  const iface = new Interface(REG_ABI);

  for (const d of DEMO) {
    try {
      const wallet = Wallet.createRandom().connect(provider);
      const uri = `https://sprawl.vercel.app/api/agent/registration.json?wallet=${wallet.address}`;

      const regReceipt = await (await registry.register(uri, { nonce: nonce++ })).wait();
      let tokenId: number | null = null;
      for (const log of regReceipt.logs) {
        try {
          const p = iface.parseLog({ topics: log.topics, data: log.data });
          if (p?.name === "Transfer") { tokenId = Number(p.args.tokenId); break; }
        } catch {}
      }
      if (tokenId === null) { console.error(`✗ ${d.name}: no tokenId`); continue; }

      const { error } = await sb.from("agents").insert({
        agent_id: tokenId, wallet_address: wallet.address, owner_address: owner,
        name: d.name, persona: d.persona, strategy_type: d.strategyType, policy_config: POLICY,
        strategy_count: 0, xp_level: d.level, xp_total: xpForLevel(d.level),
        sprawl_lifetime_earned: wei(d.sprawl), total_volume: d.volume, net_pnl: wei(0),
        reputation_score: d.rep, district: d.district, last_portfolio_value: INIT_PORTFOLIO,
        last_action_at: new Date().toISOString(),
      });
      if (error) { console.error(`✗ ${d.name}: ${error.message}`); continue; }

      await storeAgentWallet(tokenId, wallet);
      await (await faucet.fundNewAgent(wallet.address, { nonce: nonce++ })).wait();
      await (await deployer.sendTransaction({ to: wallet.address, value: parseEther(GAS_MNT), nonce: nonce++ })).wait();
      await (await cityState.spawnAgent(tokenId, wallet.address, d.strategyType, { nonce: nonce++ })).wait();

      const avatar = await ensureAvatar(tokenId, d.strategyType);
      await sb.from("agents").update({ avatar_url: avatar }).eq("agent_id", tokenId);
      await sb.from("activity_feed").insert({ event_type: "spawn", actor_id: tokenId, metadata: { name: d.name, strategyType: d.strategyType } });

      console.log(`✓ #${tokenId} ${d.name} type=${d.strategyType} funded+gas, ${avatar.includes("dicebear") ? "dicebear" : "ai"}`);
    } catch (err) {
      console.error(`✗ ${d.name}: ${(err as Error).message}`);
    }
  }
  console.log("Done.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
