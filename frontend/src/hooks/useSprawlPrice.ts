'use client'

import { useState, useEffect } from 'react';

interface PriceData {
  currentPrice: number;
  change24h: number;
  history: { ts: string; price: number }[];
}

export function useSprawlPrice() {
  const [data, setData] = useState<PriceData | null>(null);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch('/api/price-history');
        if (res.ok) setData(await res.json());
      } catch { /* silent — sparkline just shows stale data */ }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 30_000);
    return () => clearInterval(interval);
  }, []);

  return data;
}
