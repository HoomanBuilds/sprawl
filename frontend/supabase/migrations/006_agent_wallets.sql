-- frontend/supabase/migrations/006_agent_wallets.sql
-- CANONICAL schema (matches Phase 5 — AES-256-GCM with separate iv/auth_tag columns)
CREATE TABLE agent_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER UNIQUE REFERENCES agents(agent_id),
    encrypted_private_key TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    wallet_address TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wallets_address ON agent_wallets(wallet_address);
