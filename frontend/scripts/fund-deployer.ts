import { readFileSync } from "node:fs";
import { Contract, formatEther } from "ethers";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

async function main() {
  const { CONTRACTS } = await import("../src/lib/config");
  const { getMantleSepoliaProvider, getDeployerWallet } = await import("../src/lib/ethers-provider");
  const dep = (await import("../src/constants/deployments.json")).default as unknown as Record<string, string>;
  const provider = getMantleSepoliaProvider();
  const w = getDeployerWallet();
  const rounds = Number(process.argv[2] ?? 5);

  const faucet = new Contract(CONTRACTS.AgentFaucet, ["function fundNewAgent(address)"], w);
  let nonce = await provider.getTransactionCount(w.address, "pending");
  for (let i = 0; i < rounds; i++) {
    await (await faucet.fundNewAgent(w.address, { nonce: nonce++ })).wait();
    console.log(`funded round ${i + 1}`);
  }

  const erc = ["function balanceOf(address) view returns (uint256)"];
  for (const t of ["sUSDC", "sETH", "sBTC", "sPOL", "sSOL"]) {
    const c = new Contract(dep[t], erc, provider);
    console.log(t.padEnd(6), formatEther(await c.balanceOf(w.address)));
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
