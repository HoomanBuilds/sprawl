import { Contract, formatEther } from 'ethers';
import { getMantleSepoliaProvider } from '../ethers-provider';
import { CONTRACTS } from '../config';
import { getSupabaseAdmin } from '../supabase';
import SprawlDEXABI from '@/constants/abi/SprawlDEX.json';
import SprawlTokenABI from '@/constants/abi/SprawlToken.json';
import type { MarketSnapshot, PoolState } from '@/types/market';

const SWAP_FEE = 0.003;

async function readTradeStats(): Promise<{
    volume: Record<string, number>;
    price1hAgo: Record<string, number>;
}> {
    const volume: Record<string, number> = {};
    const price1hAgo: Record<string, number> = {};
    try {
        const since = new Date(Date.now() - 25 * 3_600_000).toISOString();
        const { data } = await getSupabaseAdmin()
            .from('trade_history')
            .select('token_in, token_out, amount_in, amount_out, created_at')
            .gte('created_at', since)
            .order('created_at', { ascending: true });

        const oneHourAgo = Date.now() - 3_600_000;
        const dayAgo = Date.now() - 24 * 3_600_000;
        for (const t of data ?? []) {
            const ain = Number(t.amount_in) / 1e18;
            const aout = Number(t.amount_out) / 1e18;
            let token: string | null = null, price = 0, usd = 0;
            if (t.token_in === 'sUSDC') { token = t.token_out; usd = ain; price = aout > 0 ? ain / aout : 0; }
            else if (t.token_out === 'sUSDC') { token = t.token_in; usd = aout; price = ain > 0 ? aout / ain : 0; }
            if (!token) continue;
            const ts = new Date(t.created_at).getTime();
            if (ts >= dayAgo) volume[token] = (volume[token] ?? 0) + usd;
            if (ts <= oneHourAgo && price > 0) price1hAgo[token] = price;
        }
    } catch (err) {
        console.warn(`[MarketReader] trade stats unavailable: ${(err as Error).message}`);
    }
    return { volume, price1hAgo };
}

const TOKEN_SYMBOLS = ['sETH', 'sBTC', 'sUSDC', 'sPOL', 'sSOL', 'SPRAWL'] as const;

const POOL_PAIRS: Array<[string, string]> = [
    ['sETH', 'sUSDC'],
    ['sBTC', 'sUSDC'],
    ['sPOL', 'sUSDC'],
    ['sSOL', 'sUSDC'],
    ['SPRAWL', 'sUSDC'],
];

let lastSnapshot: MarketSnapshot | null = null;
let lastSnapshotTime = 0;
const CACHE_TTL_MS = 30_000;

export async function readMarketContext(): Promise<MarketSnapshot> {
    if (lastSnapshot && Date.now() - lastSnapshotTime < CACHE_TTL_MS) {
        return lastSnapshot;
    }

    const provider = getMantleSepoliaProvider();
    const dex = new Contract(CONTRACTS.SprawlDEX, SprawlDEXABI.abi, provider);

    const prices: Record<string, number> = { sUSDC: 1 };
    const pools: PoolState[] = [];
    const stats = await readTradeStats();

    for (const [tokenA, tokenB] of POOL_PAIRS) {
        const addressA = CONTRACTS[tokenA as keyof typeof CONTRACTS];
        const addressB = CONTRACTS[tokenB as keyof typeof CONTRACTS];

        const poolId = await dex.getPoolId(addressA, addressB);
        const poolInfo = await dex.getPoolInfo(poolId);

        const reserveA = formatEther(poolInfo.reserveA);
        const reserveB = formatEther(poolInfo.reserveB);

        const priceRaw = await dex.getPrice(addressA, addressB);
        const price = parseFloat(formatEther(priceRaw));

        prices[tokenA] = price;

        const p1h = stats.price1hAgo[tokenA];
        const rawChange = p1h && p1h > 0 ? (price - p1h) / p1h : 0;
        const priceChange1h = Math.max(-0.5, Math.min(0.5, rawChange));
        const volume24h = stats.volume[tokenA] ?? 0;
        const tvl = parseFloat(reserveB) * 2;
        const apr = tvl > 0 ? Math.min((volume24h * SWAP_FEE * 365 / tvl) * 100, 150) : 0;

        pools.push({
            poolId,
            name: `${tokenA}/${tokenB}`,
            tokenA,
            tokenB,
            reserveA,
            reserveB,
            price,
            priceChange1h,
            priceChange24h: 0,
            volume24h,
            tvl,
            apr,
        });
    }

    const snapshot: MarketSnapshot = {
        prices,
        pools,
        timestamp: Date.now(),
    };

    lastSnapshot = snapshot;
    lastSnapshotTime = Date.now();
    return snapshot;
}

export async function readPortfolio(walletAddress: string): Promise<Record<string, number>> {
    const provider = getMantleSepoliaProvider();
    const holdings: Record<string, number> = {};

    for (const symbol of TOKEN_SYMBOLS) {
        const tokenAddress = CONTRACTS[symbol as keyof typeof CONTRACTS];
        const token = new Contract(tokenAddress, SprawlTokenABI.abi, provider);
        const balance = await token.balanceOf(walletAddress);
        holdings[symbol] = parseFloat(formatEther(balance));
    }

    return holdings;
}

export function calculatePortfolioValue(
    holdings: Record<string, number>,
    prices: Record<string, number>
): number {
    let total = 0;
    for (const [token, amount] of Object.entries(holdings)) {
        const price = prices[token] ?? 0;
        total += amount * price;
    }
    return total;
}

export function getLargestHolding(
    holdings: Record<string, number>,
    prices: Record<string, number>
): { token: string; pct: number } {
    const totalValue = calculatePortfolioValue(holdings, prices);
    if (totalValue === 0) return { token: 'none', pct: 0 };

    let maxToken = '';
    let maxValue = 0;
    for (const [token, amount] of Object.entries(holdings)) {
        const value = amount * (prices[token] ?? 0);
        if (value > maxValue) {
            maxValue = value;
            maxToken = token;
        }
    }

    return { token: maxToken, pct: Math.round((maxValue / totalValue) * 100) };
}
