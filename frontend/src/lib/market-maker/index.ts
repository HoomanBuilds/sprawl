import { Contract, formatEther, parseEther, MaxUint256 } from 'ethers';
import { getMantleSepoliaProvider, getDeployerWallet } from '../ethers-provider';
import { CONTRACTS } from '../config';
import SprawlDEXABI from '@/constants/abi/SprawlDEX.json';
import SprawlTokenABI from '@/constants/abi/SprawlToken.json';
import { withTxLock } from '../execution/tx-lock';
import { supabaseAdmin } from '../supabase';
import type { CoinGeckoPrice } from '@/types/market';

// ---------------------------------------------------------------------------
// IMPORTANT: The Sprawl DEX is a self-contained FREE MARKET. Prices move only
// from agent + noise swaps along the constant-product curve, and are NOT pegged
// back to real-world (CoinGecko) prices. If agent trading pushes sETH above or
// below the real ETH price, that's intentional — the in-sim market is its own
// economy. (Previously a peg arb bot dragged prices back to CoinGecko each
// cycle, which fought the agents' trades and caused the price chaos.)
//
// CoinGecko is kept ONLY so the one-off seed script (scripts/rebalance-pools.ts)
// can set realistic STARTING prices once. It is never called from the live loop.
// ---------------------------------------------------------------------------

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const COINGECKO_IDS: Record<string, string> = {
    sETH: 'ethereum',
    sBTC: 'bitcoin',
    sPOL: 'polygon-ecosystem-token', // POL (MATIC's old 'matic-network' id is deprecated/empty)
    sSOL: 'solana',
};

let priceCache: Record<string, CoinGeckoPrice> = {};
let lastFetch = 0;
const CACHE_TTL_MS = 30_000;

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

// ---------------------------------------------------------------------------
// DEX price helper + $SPRAWL price snapshot (for the price chart)
// ---------------------------------------------------------------------------

const NOISE_MIN_PCT = 0.001;
const NOISE_MAX_PCT = 0.003;

async function getDexPrice(dex: Contract, tokenAddress: string): Promise<number> {
    const priceRaw = await dex.getPrice(tokenAddress, CONTRACTS.sUSDC);
    return parseFloat(formatEther(priceRaw));
}

async function recordSprawlSnapshot(): Promise<void> {
    try {
        const provider = getMantleSepoliaProvider();
        const dex = new Contract(CONTRACTS.SprawlDEX, SprawlDEXABI.abi, provider);
        const price = await getDexPrice(dex, CONTRACTS.SPRAWL);
        await supabaseAdmin.from('price_snapshots').insert({
            pool_id: 'SPRAWL_sUSDC',
            price,
            source: 'market_maker',
        });
    } catch (err: any) {
        console.error(`[ArbBot] Snapshot failed: ${err.message}`);
    }
}

// ---------------------------------------------------------------------------
// Noise trades — gentle organic background volume so pools stay lively between
// agent ticks. Balanced random buy/sell (~0.1-0.3% of reserves), i.e. a small
// random walk that simulates other market participants. NOT a peg.
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

    for (const [tokenSym, usdcSym] of pools) {
        try {
            const tokenAddr = CONTRACTS[tokenSym as keyof typeof CONTRACTS];
            const usdcAddr = CONTRACTS[usdcSym as keyof typeof CONTRACTS];

            const poolId = await dex.getPoolId(tokenAddr, usdcAddr);
            const poolInfo = await dex.getPoolInfo(poolId);

            // Pools store tokenA/tokenB sorted by address — resolve which reserve
            // is the token and which is sUSDC instead of assuming an order. (The
            // old code assumed tokenA=token; for pools where sUSDC sorts first it
            // sold a USDC-sized amount of the TOKEN and cratered the pool.)
            const tokenIsA = poolInfo.tokenA.toLowerCase() === tokenAddr.toLowerCase();
            const reserveToken = parseFloat(formatEther(tokenIsA ? poolInfo.reserveA : poolInfo.reserveB));
            const reserveUSDC = parseFloat(formatEther(tokenIsA ? poolInfo.reserveB : poolInfo.reserveA));
            if (reserveToken <= 0 || reserveUSDC <= 0) continue;

            const noisePct = NOISE_MIN_PCT + Math.random() * (NOISE_MAX_PCT - NOISE_MIN_PCT);
            const usdValue = reserveUSDC * noisePct; // dollar size; ~noisePct price impact
            if (usdValue < 0.01) continue;

            const direction = Math.random() > 0.5 ? 'buy' : 'sell';

            await withTxLock(async () => {
                const wallet = getDeployerWallet();
                const dexSigned = new Contract(CONTRACTS.SprawlDEX, SprawlDEXABI.abi, wallet);

                if (direction === 'buy') {
                    // sUSDC -> token, sized at noisePct of the USDC reserve
                    const amountIn = parseEther(usdValue.toFixed(18));
                    const usdcToken = new Contract(usdcAddr, SprawlTokenABI.abi, wallet);
                    const allowance: bigint = await usdcToken.allowance(wallet.address, CONTRACTS.SprawlDEX);
                    if (allowance < amountIn) {
                        await (await usdcToken.approve(CONTRACTS.SprawlDEX, MaxUint256)).wait();
                    }
                    await (await dexSigned.swap(usdcAddr, tokenAddr, amountIn, 0n)).wait();
                } else {
                    // token -> sUSDC, sized at noisePct of the TOKEN reserve
                    const tokenAmount = reserveToken * noisePct;
                    const amountIn = parseEther(tokenAmount.toFixed(18));
                    const tokenContract = new Contract(tokenAddr, SprawlTokenABI.abi, wallet);
                    const allowance: bigint = await tokenContract.allowance(wallet.address, CONTRACTS.SprawlDEX);
                    if (allowance < amountIn) {
                        await (await tokenContract.approve(CONTRACTS.SprawlDEX, MaxUint256)).wait();
                    }
                    await (await dexSigned.swap(tokenAddr, usdcAddr, amountIn, 0n)).wait();
                }

                console.log(`[Noise] ${direction} ${tokenSym}/${usdcSym} (~$${usdValue.toFixed(2)})`);
            });
        } catch (err: any) {
            console.error(`[Noise] Failed for ${tokenSym}/${usdcSym}: ${err.message}`);
        }
    }
}

// ---------------------------------------------------------------------------
// Market cycle — called every 30s. Free market: NO peg. Just gentle background
// volume + a $SPRAWL price snapshot. Prices float purely on agent + noise swaps.
// ---------------------------------------------------------------------------

export async function runArbCycle(): Promise<void> {
    try {
        await executeNoiseTrades();
    } catch (err: any) {
        console.error(`[ArbBot] Noise trades failed: ${err.message}`);
    }

    await recordSprawlSnapshot();
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

export async function marketMakerLoop(signal: AbortSignal): Promise<void> {
    const INTERVAL_MS = 30_000;
    console.log('[ArbBot] Starting market maker loop (free market, no peg, 30s interval)');

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
