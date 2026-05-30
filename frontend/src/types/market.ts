export interface PoolState {
    poolId: string;
    name: string;
    tokenA: string;
    tokenB: string;
    reserveA: string;
    reserveB: string;
    price: number;
    priceChange1h: number;
    priceChange24h: number;
    volume24h: number;
    tvl: number;
    apr: number;
}

export interface MarketSnapshot {
    prices: Record<string, number>;
    pools: PoolState[];
    timestamp: number;
}

export interface CoinGeckoPrice {
    usd: number;
    usd_24h_change: number;
}
