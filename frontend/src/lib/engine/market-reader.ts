import { Contract, formatEther } from 'ethers';
import { getMantleSepoliaProvider } from '../ethers-provider';
import { CONTRACTS } from '../config';
import SprawlDEXABI from '@/constants/abi/SprawlDEX.json';
import SprawlTokenABI from '@/constants/abi/SprawlToken.json';
import type { MarketSnapshot, PoolState } from '@/types/market';

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
const CACHE_TTL_MS = 10_000;

export async function readMarketContext(): Promise<MarketSnapshot> {
    if (lastSnapshot && Date.now() - lastSnapshotTime < CACHE_TTL_MS) {
        return lastSnapshot;
    }

    const provider = getMantleSepoliaProvider();
    const dex = new Contract(CONTRACTS.SprawlDEX, SprawlDEXABI.abi, provider);

    const prices: Record<string, number> = { sUSDC: 1 };
    const pools: PoolState[] = [];

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

        const prevPool = lastSnapshot?.pools.find(p => p.name === `${tokenA}/${tokenB}`);
        const priceChange1h = prevPool ? (price - prevPool.price) / prevPool.price : 0;

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
            volume24h: 0,
            tvl: parseFloat(reserveB) * 2,
            apr: 0,
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
