-- frontend/supabase/migrations/001_agents.sql
CREATE TABLE agents (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER UNIQUE NOT NULL,
    wallet_address TEXT NOT NULL,
    owner_address TEXT NOT NULL,
    name TEXT,
    persona TEXT,
    strategy_type SMALLINT DEFAULT 0,
    policy_config JSONB DEFAULT '{}',

    sprawl_balance BIGINT DEFAULT 0,
    sprawl_lifetime_earned BIGINT DEFAULT 0,
    sprawl_lifetime_spent BIGINT DEFAULT 0,
    last_portfolio_value BIGINT DEFAULT 0,
    last_settlement_date DATE,

    total_volume BIGINT DEFAULT 0,
    strategy_count INTEGER DEFAULT 1,
    recent_actions INTEGER DEFAULT 0,
    reputation_score INTEGER DEFAULT 0,

    xp_total INTEGER DEFAULT 0,
    xp_level INTEGER DEFAULT 1,
    xp_daily INTEGER DEFAULT 0,
    xp_daily_date DATE,
    raid_xp INTEGER DEFAULT 0,
    raid_wins INTEGER DEFAULT 0,
    raid_losses INTEGER DEFAULT 0,
    app_streak INTEGER DEFAULT 0,
    weekly_volume BIGINT DEFAULT 0,
    weekly_start_date DATE DEFAULT CURRENT_DATE,
    profit_streak INTEGER DEFAULT 0,
    reputation_given INTEGER DEFAULT 0,
    poignancy_accumulator INTEGER DEFAULT 0,

    district TEXT DEFAULT 'general',
    net_pnl BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_action_at TIMESTAMPTZ
);

CREATE INDEX idx_agents_owner ON agents(owner_address);
CREATE INDEX idx_agents_wallet ON agents(wallet_address);
CREATE INDEX idx_agents_district ON agents(district);
