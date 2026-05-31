import { readFileSync } from "node:fs";
import { Contract, parseEther, formatEther } from "ethers";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const AMOUNTS: Record<string, string> = {
  sUSDC: "2000000", sETH: "2000", sBTC: "100", sPOL: "2000000", sSOL: "10000",
};

async function main() {
  const { CONTRACTS } = await import("../src/lib/config");
  const { getMantleSepoliaProvider, getDeployerWallet } = await import("../src/lib/ethers-provider");
  const dep = (await import("../src/constants/deployments.json")).default as unknown as Record<string, string>;
  const provider = getMantleSepoliaProvider();
  const w = getDeployerWallet();
  const faucet = CONTRACTS.AgentFaucet;
  const abi = [
    "function setMinter(address)",
    "function mint(address,uint256)",
    "function balanceOf(address) view returns (uint256)",
  ];
  let nonce = await provider.getTransactionCount(w.address, "pending");

  for (const [sym, amt] of Object.entries(AMOUNTS)) {
    const t = new Contract(dep[sym], abi, w);
    await (await t.setMinter(w.address, { nonce: nonce++ })).wait();
    await (await t.mint(w.address, parseEther(amt), { nonce: nonce++ })).wait();
    await (await t.setMinter(faucet, { nonce: nonce++ })).wait();
    console.log(`${sym.padEnd(6)} minted ${amt}, balance ${formatEther(await t.balanceOf(w.address))}, minter restored`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
