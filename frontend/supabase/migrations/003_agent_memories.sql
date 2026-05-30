-- frontend/supabase/migrations/003_agent_memories.sql
CREATE TABLE agent_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER REFERENCES agents(agent_id),
    type TEXT NOT NULL,
    depth INTEGER DEFAULT 0,
    description TEXT NOT NULL,
    subject TEXT,
    predicate TEXT,
    object TEXT,
    poignancy INTEGER DEFAULT 5,
    keywords TEXT[],
    evidence UUID[],
    embedding_id UUID,
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_memories_agent ON agent_memories(agent_id, created_at DESC);
CREATE INDEX idx_memories_type ON agent_memories(agent_id, type);
CREATE INDEX idx_memories_keywords ON agent_memories USING GIN(keywords);
