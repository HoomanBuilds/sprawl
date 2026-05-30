-- Price snapshots for sparkline chart
-- The MarketMaker bot inserts a row after each price sync cycle (~30s)
-- The /api/price-history route reads from this table as a fallback when
-- trade_history doesn't have enough SPRAWL swap data

CREATE TABLE price_snapshots (
    id SERIAL PRIMARY KEY,
    pool_id TEXT NOT NULL,
    price NUMERIC(20, 8) NOT NULL,
    reserve_a NUMERIC(30, 0),
    reserve_b NUMERIC(30, 0),
    source TEXT DEFAULT 'market_maker',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_price_snapshots_pool_time ON price_snapshots(pool_id, created_at DESC);

ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON price_snapshots FOR SELECT USING (true);
