import { Contract, formatEther, parseEther, MaxUint256 } from 'ethers';
import { getMantleSepoliaProvider, getDeployerWallet } from '../ethers-provider';
import { CONTRACTS, TOKEN_SYMBOLS } from '../config';
import SprawlDEXABI from '@/constants/abi/SprawlDEX.json';
import SprawlTokenABI from '@/constants/abi/SprawlToken.json';
import { withTxLock } from '../execution/tx-lock';
import type { CoinGeckoPrice } from '@/types/market';

// ---------------------------------------------------------------------------
// CoinGecko price feed
// ---------------------------------------------------------------------------

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const COINGECKO_IDS: Record<string, string> = {
    sETH: 'ethereum',
    sBTC: 'bitcoin',
    sPOL: 'matic-network',
    sSOL: 'solana',
};

let priceCache: Record<string, CoinGeckoPrice> = {};
let lastFetch = 0;
const CACHE_TTL_MS = 30_000;
const STALE_THRESHOLD_MS = 5 * 60_000;

export async function fetchRealPrices(): Promise<Record<string, CoinGeckoPrice>> {
    const now = Date.now();
    if (now - lastFetch < CACHE_TTL_MS && Object.keys(priceCache).length > 0) {
        return priceCache;
    }

    const ids = Object.values(COINGECKO_IDS).join(',');

    try {
        const res = await fetch(
            `${COINGECKO_API}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
            {
                headers: {
                    'Accept': 'application/json',
                    ...(process.env.COINGECKO_API_KEY
                        ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY }
                        : {}),
                },
            }
        );

        if (!res.ok) {
            console.error(`[PriceFeed] CoinGecko error: ${res.status}`);
            return priceCache;
        }

        const data = await res.json();
        const prices: Record<string, CoinGeckoPrice> = {};

        for (const [symbol, geckoId] of Object.entries(COINGECKO_IDS)) {
            const entry = data[geckoId];
            if (entry) {
                prices[symbol] = {
                    usd: entry.usd,
                    usd_24h_change: entry.usd_24h_change ?? 0,
                };
            }
        }

        prices.SPRAWL = { usd: 1.0, usd_24h_change: 0 };
        prices.sUSDC = { usd: 1.0, usd_24h_change: 0 };

        priceCache = prices;
        lastFetch = now;
        return prices;
    } catch (err: any) {
        console.error(`[PriceFeed] Fetch failed: ${err.message}`);
        return priceCache;
    }
}

function isPriceStale(): boolean {
    return lastFetch > 0 && Date.now() - lastFetch > STALE_THRESHOLD_MS;
}

// ---------------------------------------------------------------------------
// Arb detection + execution
// ---------------------------------------------------------------------------

const ARB_THRESHOLD_PCT = 0.5;
const NOISE_MIN_PCT = 0.001;
const NOISE_MAX_PCT = 0.003;
const MAX_SLIPPAGE_BPS = 200;

const TOKEN_ADDRESSES: Record<string, string> = {
    sETH: CONTRACTS.sETH,
    sBTC: CONTRACTS.sBTC,
    sPOL: CONTRACTS.sPOL,
    sSOL: CONTRACTS.sSOL,
    SPRAWL: CONTRACTS.SPRAWL,
};

const ADDRESS_TO_SYMBOL: Record<string, string> = {};
for (const [sym, addr] of Object.entries(TOKEN_ADDRESSES)) {
    ADDRESS_TO_SYMBOL[addr.toLowerCase()] = sym;
}

interface ArbOpportunity {
    token: string;
    dexPrice: number;
    realPrice: number;
    spreadPct: number;
    direction: 'buy' | 'sell';
}

async function getDexPrice(dex: Contract, tokenAddress: string): Promise<number> {
    const priceRaw = await dex.getPrice(tokenAddress, CONTRACTS.sUSDC);
    return parseFloat(formatEther(priceRaw));
}

async function findArbOpportunities(): Promise<ArbOpportunity[]> {
    const provider = getMantleSepoliaProvider();
    const dex = new Contract(CONTRACTS.SprawlDEX, SprawlDEXABI.abi, provider);
    const realPrices = await fetchRealPrices();

    const opportunities: ArbOpportunity[] = [];

    for (const [symbol, address] of Object.entries(TOKEN_ADDRESSES)) {
        if (symbol === 'SPRAWL') continue;

        const realPrice = realPrices[symbol]?.usd;
        if (!realPrice) continue;

        try {
            const dexPrice = await getDexPrice(dex, address);
            const spreadPct = ((dexPrice - realPrice) / realPrice) * 100;

            if (Math.abs(spreadPct) > ARB_THRESHOLD_PCT) {
                opportunities.push({
                    token: symbol,
                    dexPrice,
                    realPrice,
                    spreadPct,
                    direction: spreadPct > 0 ? 'sell' : 'buy',
                });
            }
        } catch (err: any) {
            console.error(`[ArbBot] Failed to get DEX price for ${symbol}: ${err.message}`);
        }
    }

    return opportunities.sort((a, b) => Math.abs(b.spreadPct) - Math.abs(a.spreadPct));
}

async function executeArb(opp: ArbOpportunity): Promise<string | null> {
    return withTxLock(async () => {
        const wallet = getDeployerWallet();
        const dex = new Contract(CONTRACTS.SprawlDEX, SprawlDEXABI.abi, wallet);

        const tokenAddress = TOKEN_ADDRESSES[opp.token];
        const usdcAddress = CONTRACTS.sUSDC;

        const tradeValueUSD = 500;

        if (opp.direction === 'buy') {
            const amountIn = parseEther(tradeValueUSD.toString());
            const expectedOut = tradeValueUSD / opp.dexPrice;
            const minOut = parseEther(
                (expectedOut * (1 - MAX_SLIPPAGE_BPS / 10000)).toFixed(18)
            );

            const usdcToken = new Contract(usdcAddress, SprawlTokenABI.abi, wallet);
            const allowance: bigint = await usdcToken.allowance(wallet.address, CONTRACTS.SprawlDEX);
            if (allowance < amountIn) {
                const tx = await usdcToken.approve(CONTRACTS.SprawlDEX, MaxUint256);
                await tx.wait();
            }

            const tx = await dex.swap(usdcAddress, tokenAddress, amountIn, minOut);
            const receipt = await tx.wait();
            return receipt.hash;
        } else {
            const amountToken = tradeValueUSD / opp.dexPrice;
            const amountIn = parseEther(amountToken.toFixed(18));
            const expectedOut = amountToken * opp.dexPrice;
            const minOut = parseEther(
                (expectedOut * (1 - MAX_SLIPPAGE_BPS / 10000)).toFixed(18)
            );

            const token = new Contract(tokenAddress, SprawlTokenABI.abi, wallet);
            const allowance: bigint = await token.allowance(wallet.address, CONTRACTS.SprawlDEX);
            if (allowance < amountIn) {
                const tx = await token.approve(CONTRACTS.SprawlDEX, MaxUint256);
                await tx.wait();
            }

            const tx = await dex.swap(tokenAddress, usdcAddress, amountIn, minOut);
            const receipt = await tx.wait();
            return receipt.hash;
        }
    });
}

// ---------------------------------------------------------------------------
// Noise trades — organic volume for all pools including $SPRAWL
// ---------------------------------------------------------------------------

async function executeNoiseTrades(): Promise<void> {
    const provider = getMantleSepoliaProvider();
    const dex = new Contract(CONTRACTS.SprawlDEX, SprawlDEXABI.abi, provider);

    const pools: Array<[string, string]> = [
        ['sETH', 'sUSDC'],
        ['sBTC', 'sUSDC'],
        ['sPOL', 'sUSDC'],
        ['sSOL', 'sUSDC'],
        ['SPRAWL', 'sUSDC'],
    ];

    for (const [tokenA, tokenB] of pools) {
        try {
            const addressA = CONTRACTS[tokenA as keyof typeof CONTRACTS];
            const addressB = CONTRACTS[tokenB as keyof typeof CONTRACTS];

            const poolId = await dex.getPoolId(addressA, addressB);
            const poolInfo = await dex.getPoolInfo(poolId);
            const reserveB = parseFloat(formatEther(poolInfo.reserveB));

            const noisePct = NOISE_MIN_PCT + Math.random() * (NOISE_MAX_PCT - NOISE_MIN_PCT);
            const noiseAmount = reserveB * noisePct;
            if (noiseAmount < 0.01) continue;

            const direction = Math.random() > 0.5 ? 'buy' : 'sell';

            await withTxLock(async () => {
                const wallet = getDeployerWallet();
                const dexSigned = new Contract(CONTRACTS.SprawlDEX, SprawlDEXABI.abi, wallet);

                if (direction === 'buy') {
                    const amountIn = parseEther(noiseAmount.toFixed(18));
                    const usdcToken = new Contract(addressB, SprawlTokenABI.abi, wallet);
                    const allowance: bigint = await usdcToken.allowance(wallet.address, CONTRACTS.SprawlDEX);
                    if (allowance < amountIn) {
                        const tx = await usdcToken.approve(CONTRACTS.SprawlDEX, MaxUint256);
                        await tx.wait();
                    }
                    const tx = await dexSigned.swap(addressB, addressA, amountIn, 0n);
                    await tx.wait();
                } else {
                    const reserveA = parseFloat(formatEther(poolInfo.reserveA));
                    const noiseAmountA = reserveA * noisePct;
                    const amountIn = parseEther(noiseAmountA.toFixed(18));
                    const tokenContract = new Contract(addressA, SprawlTokenABI.abi, wallet);
                    const allowance: bigint = await tokenContract.allowance(wallet.address, CONTRACTS.SprawlDEX);
                    if (allowance < amountIn) {
                        const tx = await tokenContract.approve(CONTRACTS.SprawlDEX, MaxUint256);
                        await tx.wait();
                    }
                    const tx = await dexSigned.swap(addressA, addressB, amountIn, 0n);
                    await tx.wait();
                }

                console.log(`[Noise] ${direction} ${tokenA}/${tokenB} (~$${noiseAmount.toFixed(2)})`);
            });
        } catch (err: any) {
            console.error(`[Noise] Failed for ${tokenA}/${tokenB}: ${err.message}`);
        }
    }
}

// ---------------------------------------------------------------------------
// Arb cycle — called every 30s
// ---------------------------------------------------------------------------

export async function runArbCycle(): Promise<void> {
    const stale = isPriceStale();

    if (!stale) {
        const opportunities = await findArbOpportunities();

        if (opportunities.length > 0) {
            console.log(`[ArbBot] Found ${opportunities.length} arb opportunities`);

            for (const opp of opportunities.slice(0, 3)) {
                console.log(
                    `[ArbBot] ${opp.direction} ${opp.token}: DEX=$${opp.dexPrice.toFixed(2)}, Real=$${opp.realPrice.toFixed(2)}, Spread=${opp.spreadPct.toFixed(2)}%`
                );

                try {
                    const txHash = await executeArb(opp);
                    if (txHash) {
                        console.log(`[ArbBot] Arb executed: ${txHash}`);
                    }
                } catch (err: any) {
                    console.error(`[ArbBot] Arb failed for ${opp.token}: ${err.message}`);
                }
            }
        }
    } else {
        console.warn('[ArbBot] Prices stale >5m, skipping arb (noise only)');
    }

    try {
        await executeNoiseTrades();
    } catch (err: any) {
        console.error(`[ArbBot] Noise trades failed: ${err.message}`);
    }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

export async function marketMakerLoop(signal: AbortSignal): Promise<void> {
    const INTERVAL_MS = 30_000;
    console.log('[ArbBot] Starting market maker loop (30s interval)');

    while (!signal.aborted) {
        try {
            await runArbCycle();
        } catch (err: any) {
            console.error(`[ArbBot] Cycle error: ${err.message}`);
        }

        await new Promise<void>((resolve) => {
            if (signal.aborted) { resolve(); return; }
            const timer = setTimeout(resolve, INTERVAL_MS);
            signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
        });
    }

    console.log('[ArbBot] Market maker stopped');
}
