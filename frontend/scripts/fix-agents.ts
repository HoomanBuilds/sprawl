import { readFileSync } from "node:fs";
import { parseEther, formatEther } from "ethers";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const TOPUP_MNT = "2";

async function main() {
  const { getMantleSepoliaProvider, getDeployerWallet } = await import("../src/lib/ethers-provider");
  const { getSupabaseAdmin } = await import("../src/lib/supabase");
  const { readMarketContext, readPortfolio, calculatePortfolioValue } = await import("../src/lib/engine/market-reader");
  const provider = getMantleSepoliaProvider();
  const deployer = getDeployerWallet();
  const sb = getSupabaseAdmin();

  const market = await readMarketContext();
  const { data: agents } = await sb
    .from("agents")
    .select("agent_id, name, wallet_address")
    .eq("owner_address", deployer.address)
    .order("agent_id");

  let nonce = await provider.getTransactionCount(deployer.address, "pending");
  for (const a of agents ?? []) {
    // 1. Top up gas so the agent can keep trading + raiding.
    const bal = await provider.getBalance(a.wallet_address);
    if (bal < parseEther("1")) {
      await (await deployer.sendTransaction({ to: a.wallet_address, value: parseEther(TOPUP_MNT), nonce: nonce++ })).wait();
    }
    // 2. Reset the P&L baseline to the real current portfolio value, so net_pnl
    //    starts at ~0 and reflects genuine trading from here.
    const value = calculatePortfolioValue(await readPortfolio(a.wallet_address), market.prices);
    await sb.from("agents").update({
      last_portfolio_value: Math.floor(value * 1e18),
      net_pnl: 0,
    }).eq("agent_id", a.agent_id);
    console.log(`#${a.agent_id} ${a.name}: gas=${formatEther(await provider.getBalance(a.wallet_address))} MNT, baseline=$${value.toFixed(0)}`);
  }
  console.log("Done.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
