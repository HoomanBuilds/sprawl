import { readFileSync } from "node:fs";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

// One-shot re-peg: drag each DEX pool's price to the real (CoinGecko) price with
// a single constant-product corrective swap — exactly what an arbitrageur does.
// Trades still move the price afterwards; the market-maker keeps it pinned.
import { Contract, formatEther, parseEther, MaxUint256 } from "ethers";

const SKIP_BELOW_PCT = 3; // already pegged → leave it
const SYNTHS = ["sETH", "sBTC", "sPOL", "sSOL"] as const;

async function main() {
  const { getMantleSepoliaProvider, getDeployerWallet } = await import("../src/lib/ethers-provider");
  const { CONTRACTS } = await import("../src/lib/config");
  const { fetchRealPrices } = await import("../src/lib/market-maker");
  const DEX = (await import("../src/constants/abi/SprawlDEX.json")).default;
  const TOK = (await import("../src/constants/abi/SprawlToken.json")).default;

  const provider = getMantleSepoliaProvider();
  const wallet = getDeployerWallet();
  const dex = new Contract(CONTRACTS.SprawlDEX, DEX.abi, wallet);
  const real = await fetchRealPrices();

  for (const sym of SYNTHS) {
    const tokenAddr = (CONTRACTS as Record<string, string>)[sym];
    const usdc = CONTRACTS.sUSDC;
    const realPrice = real[sym]?.usd;
    if (!realPrice) {
      console.log(`${sym}: no real price, skip`);
      continue;
    }

    const poolId = await dex.getPoolId(tokenAddr, usdc);
    const pi = await dex.getPoolInfo(poolId);
    const tokenIsA = pi.tokenA.toLowerCase() === tokenAddr.toLowerCase();
    const reserveToken = Number(formatEther(tokenIsA ? pi.reserveA : pi.reserveB));
    const reserveUSDC = Number(formatEther(tokenIsA ? pi.reserveB : pi.reserveA));
    const feeRate = Number(pi.feeNumerator) / Number(pi.feeDenominator);

    const dexPrice = reserveUSDC / reserveToken;
    const spreadPct = ((dexPrice - realPrice) / realPrice) * 100;
    if (Math.abs(spreadPct) < SKIP_BELOW_PCT) {
      console.log(`${sym}: $${dexPrice.toFixed(2)} vs real $${realPrice.toFixed(2)} (${spreadPct.toFixed(1)}%) — already pegged, skip`);
      continue;
    }

    // Constant-product target reserves for the real price.
    const k = reserveToken * reserveUSDC;
    const targetUSDC = Math.sqrt(k * realPrice);
    const targetToken = Math.sqrt(k / realPrice);

    let inAddr: string, outAddr: string, amountInHuman: number, inSym: string;
    if (realPrice > dexPrice) {
      // raise price: buy token with USDC
      inAddr = usdc; outAddr = tokenAddr; inSym = "sUSDC";
      amountInHuman = (targetUSDC - reserveUSDC) / (1 - feeRate);
    } else {
      // lower price: sell token for USDC
      inAddr = tokenAddr; outAddr = usdc; inSym = sym;
      amountInHuman = (targetToken - reserveToken) / (1 - feeRate);
    }

    const inToken = new Contract(inAddr, TOK.abi, wallet);
    const bal = Number(formatEther(await inToken.balanceOf(wallet.address)));
    if (bal < amountInHuman) {
      console.log(`${sym}: need ${amountInHuman.toFixed(0)} ${inSym} but deployer has ${bal.toFixed(0)} — skip (mint a war chest first)`);
      continue;
    }

    const amountIn = parseEther(amountInHuman.toFixed(18));
    const allowance: bigint = await inToken.allowance(wallet.address, CONTRACTS.SprawlDEX);
    if (allowance < amountIn) {
      await (await inToken.approve(CONTRACTS.SprawlDEX, MaxUint256)).wait();
    }
    // minOut = 0: intentional re-peg, not slippage-protected.
    await (await dex.swap(inAddr, outAddr, amountIn, 0n)).wait();

    const pi2 = await dex.getPoolInfo(poolId);
    const rT2 = Number(formatEther(tokenIsA ? pi2.reserveA : pi2.reserveB));
    const rU2 = Number(formatEther(tokenIsA ? pi2.reserveB : pi2.reserveA));
    console.log(`${sym}: $${dexPrice.toFixed(2)} → $${(rU2 / rT2).toFixed(2)} (real $${realPrice.toFixed(2)}) — swapped ${amountInHuman.toFixed(0)} ${inSym}`);
  }
  console.log("Done.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
