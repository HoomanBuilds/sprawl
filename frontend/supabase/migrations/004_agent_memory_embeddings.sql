-- frontend/supabase/migrations/004_agent_memory_embeddings.sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE agent_memory_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER,
    embedding_key TEXT NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_embeddings_agent ON agent_memory_embeddings(agent_id);
CREATE INDEX idx_embeddings_vector ON agent_memory_embeddings
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
