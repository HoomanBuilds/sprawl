import { readFileSync } from "node:fs";
import { Contract, parseEther } from "ethers";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

// Clump-break: agents stuck near the faucet floor (~$10k) all render identically
// in the inspector. Spread just those into distinct, varied wealth so no two
// match, blending them into the existing distribution. Hard-capped spend so the
// market-maker war chest stays intact (the skyline is already diverse via rank).
const CLUMP_LO = 9_000;
const CLUMP_HI = 12_500;
const SPREAD_LO = 12_000;
const SPREAD_HI = 40_000;
const BUDGET = 260_000; // max sUSDC to spend
const MIN_TOPUP = 300;

async function main() {
  const { CONTRACTS } = await import("../src/lib/config");
  const { getMantleSepoliaProvider, getDeployerWallet } = await import("../src/lib/ethers-provider");
  const { getSupabaseAdmin } = await import("../src/lib/supabase");
  const TOK = (await import("../src/constants/abi/SprawlToken.json")).default;

  const provider = getMantleSepoliaProvider();
  const deployer = getDeployerWallet();
  const sb = getSupabaseAdmin();
  const usdc = new Contract(CONTRACTS.sUSDC, TOK.abi, deployer);

  const { data } = await sb.from("agents").select("agent_id,name,wallet_address,last_portfolio_value,net_pnl");
  const clump = (data ?? [])
    .map((a) => ({ id: a.agent_id, name: a.name, wallet: a.wallet_address, wealth: (Number(a.last_portfolio_value) + Number(a.net_pnl)) / 1e18 }))
    .filter((a) => a.wealth >= CLUMP_LO && a.wealth <= CLUMP_HI)
    .sort((a, b) => a.id - b.id);

  const M = clump.length;
  console.log(`${M} agents clumped near $${CLUMP_LO}-$${CLUMP_HI}`);
  if (M === 0) { console.log("nothing to do"); return; }

  // Spread them linearly across the band, then scale deltas to fit the budget.
  let plan = clump.map((a, i) => {
    const target = M > 1 ? SPREAD_LO + (i * (SPREAD_HI - SPREAD_LO)) / (M - 1) : SPREAD_LO;
    return { ...a, target, delta: target - a.wealth };
  }).filter((p) => p.delta >= MIN_TOPUP);

  const raw = plan.reduce((s, p) => s + p.delta, 0);
  const scale = raw > BUDGET ? BUDGET / raw : 1;
  if (scale < 1) plan = plan.map((p) => ({ ...p, delta: p.delta * scale, target: p.wealth + p.delta * scale }));
  const total = plan.reduce((s, p) => s + p.delta, 0);
  console.log(`spreading ${plan.length} agents, total spend $${total.toFixed(0)} (scale ${scale.toFixed(2)})`);

  let nonce = await provider.getTransactionCount(deployer.address, "pending");
  const sent: { p: (typeof plan)[number]; tx: any }[] = [];
  for (const p of plan) {
    try {
      const tx = await usdc.transfer(p.wallet, parseEther(p.delta.toFixed(6)), { nonce: nonce++ });
      sent.push({ p, tx });
      console.log(`  sent +$${p.delta.toFixed(0)} -> ${p.name} (target $${p.target.toFixed(0)})`);
    } catch (e) {
      console.error(`  ✗ send ${p.name}: ${(e as Error).message}`);
      nonce = await provider.getTransactionCount(deployer.address, "pending");
    }
  }

  console.log(`waiting for ${sent.length} transfers to confirm...`);
  const results = await Promise.allSettled(sent.map((s) => s.tx.wait(1, 120_000)));

  let ok = 0;
  for (let i = 0; i < sent.length; i++) {
    const { p } = sent[i];
    if (results[i].status !== "fulfilled") { console.error(`  ✗ confirm ${p.name}`); continue; }
    await sb.from("agents").update({ last_portfolio_value: Math.floor(p.target * 1e18), net_pnl: 0 }).eq("agent_id", p.id);
    ok++;
  }
  console.log(`Done. Spread ${ok}/${plan.length} clumped agents into varied wealth.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
