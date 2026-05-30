CREATE OR REPLACE FUNCTION match_embeddings(
    query_embedding vector(1536),
    match_agent_id INTEGER,
    match_count INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    embedding_key TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ame.id,
        ame.embedding_key,
        1 - (ame.embedding <=> query_embedding) AS similarity
    FROM agent_memory_embeddings ame
    WHERE ame.agent_id = match_agent_id
    ORDER BY ame.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION decrement_poignancy(
    p_agent_id INTEGER,
    p_amount INTEGER
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE agents
    SET poignancy_accumulator = GREATEST(0, poignancy_accumulator - p_amount)
    WHERE agent_id = p_agent_id;
END;
$$;
