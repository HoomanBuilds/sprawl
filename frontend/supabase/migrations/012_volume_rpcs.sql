-- Increment a numeric field on agents (used by indexer for raid_wins, raid_losses)
CREATE OR REPLACE FUNCTION increment_field(p_agent_id INTEGER, p_field TEXT)
RETURNS VOID AS $$
BEGIN
    EXECUTE format('UPDATE agents SET %I = %I + 1 WHERE agent_id = $1', p_field, p_field)
    USING p_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment total_volume and weekly_volume (used by indexer on Swap events)
CREATE OR REPLACE FUNCTION increment_volume(p_agent_id INTEGER, p_amount BIGINT)
RETURNS VOID AS $$
BEGIN
    UPDATE agents
    SET total_volume = total_volume + p_amount,
        weekly_volume = weekly_volume + p_amount,
        recent_actions = recent_actions + 1,
        last_action_at = NOW()
    WHERE agent_id = p_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
