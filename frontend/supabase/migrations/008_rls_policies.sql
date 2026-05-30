-- frontend/supabase/migrations/008_rls_policies.sql
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;

-- Public read for agents (city is viewable by all)
CREATE POLICY "agents_public_read" ON agents FOR SELECT USING (true);
-- Only owner can update their agent
CREATE POLICY "agents_owner_update" ON agents FOR UPDATE
    USING (owner_address = current_setting('request.jwt.claims', true)::jsonb->>'wallet_address');

-- Public read for trade history
CREATE POLICY "trades_public_read" ON trade_history FOR SELECT USING (true);
-- Engine inserts trades (service role)
CREATE POLICY "trades_service_insert" ON trade_history FOR INSERT
    WITH CHECK (current_setting('role') = 'service_role');

-- Memories are private to agent owner
CREATE POLICY "memories_owner_read" ON agent_memories FOR SELECT
    USING (agent_id IN (SELECT agent_id FROM agents WHERE owner_address = current_setting('request.jwt.claims', true)::jsonb->>'wallet_address'));
CREATE POLICY "memories_service_insert" ON agent_memories FOR INSERT
    WITH CHECK (current_setting('role') = 'service_role');

-- Embeddings are service-only
CREATE POLICY "embeddings_service_all" ON agent_memory_embeddings FOR ALL
    USING (current_setting('role') = 'service_role');

-- Skills are public read (viewable in building inspector)
CREATE POLICY "skills_public_read" ON agent_skills FOR SELECT USING (true);
CREATE POLICY "skills_service_insert" ON agent_skills FOR INSERT
    WITH CHECK (current_setting('role') = 'service_role');

-- Wallets are strictly service-only
CREATE POLICY "wallets_service_all" ON agent_wallets FOR ALL
    USING (current_setting('role') = 'service_role');

-- Activity feed is public
CREATE POLICY "feed_public_read" ON activity_feed FOR SELECT USING (true);
CREATE POLICY "feed_service_insert" ON activity_feed FOR INSERT
    WITH CHECK (current_setting('role') = 'service_role');
