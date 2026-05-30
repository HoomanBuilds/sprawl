-- frontend/supabase/migrations/005_agent_skills.sql
CREATE TABLE agent_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER REFERENCES agents(agent_id),
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    embedding_id UUID,
    success_rate NUMERIC DEFAULT 0,
    avg_pnl NUMERIC DEFAULT 0,
    times_used INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agent_id, name)
);

CREATE INDEX idx_skills_agent ON agent_skills(agent_id);
