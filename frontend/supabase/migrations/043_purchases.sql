CREATE TABLE purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER REFERENCES agents(agent_id),
    item_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_tx_id TEXT,
    amount_cents INTEGER DEFAULT 0,
    currency TEXT DEFAULT 'usd',
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agent_id, item_id)
);

CREATE INDEX idx_purchases_agent ON purchases(agent_id);

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchases_public_read" ON purchases FOR SELECT USING (true);
