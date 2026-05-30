-- frontend/supabase/migrations/002_trade_history.sql
CREATE TABLE trade_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER REFERENCES agents(agent_id),
    action TEXT NOT NULL,
    token_in TEXT,
    token_out TEXT,
    amount_in BIGINT,
    amount_out BIGINT,
    price_at_trade NUMERIC,
    pnl_realized NUMERIC DEFAULT 0,
    tx_hash TEXT NOT NULL,
    rationale TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trade_history_agent ON trade_history(agent_id, created_at DESC);
CREATE INDEX idx_trade_history_action ON trade_history(action);
