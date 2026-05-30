CREATE OR REPLACE FUNCTION increment_raid_xp(p_agent_id integer, p_amount integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new integer;
BEGIN
  UPDATE agents
  SET raid_xp = COALESCE(raid_xp, 0) + p_amount
  WHERE agent_id = p_agent_id
  RETURNING raid_xp INTO v_new;
  RETURN COALESCE(v_new, 0);
END;
$$;
