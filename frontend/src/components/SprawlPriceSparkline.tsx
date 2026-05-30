'use client'

import { useSprawlPrice } from '@/hooks/useSprawlPrice';

export function SprawlPriceSparkline() {
  const data = useSprawlPrice();

  if (!data) {
    return (
      <div className="flex items-center gap-2 font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-sprawl-muted)]">
        $SPRAWL <span className="animate-blink">...</span>
      </div>
    );
  }

  const { currentPrice, change24h, history } = data;
  const isUp = change24h >= 0;

  const W = 80;
  const H = 24;
  const prices = history.map(p => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const points = prices.map((p, i) => {
    const x = (i / Math.max(prices.length - 1, 1)) * W;
    const y = H - ((p - min) / range) * (H - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  const strokeColor = isUp ? 'var(--color-sprawl-lime)' : 'var(--color-sprawl-red)';

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-2 border-[color:var(--color-sprawl-border)] bg-[color:var(--color-sprawl-card)]">
      <span className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-sprawl-accent)] uppercase">
        $SPRAWL
      </span>
      <span className="font-[family-name:var(--font-pixel)] text-sm text-[color:var(--color-sprawl-cream)]">
        ${currentPrice.toFixed(2)}
      </span>
      <svg width={W} height={H} className="flex-shrink-0">
        <polyline
          points={points}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="font-[family-name:var(--font-pixel)] text-xs"
        style={{ color: strokeColor }}
      >
        {isUp ? '+' : ''}{change24h}%
      </span>
    </div>
  );
}
