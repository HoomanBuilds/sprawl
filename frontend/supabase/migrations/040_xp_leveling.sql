-- frontend/supabase/migrations/040_xp_leveling.sql
-- Adapted from inspiration/git-city/supabase/migrations/032_xp_leveling.sql
-- Renamed: developers->agents, developer_id->agent_id, github->on_chain.
-- agents FK uses the on-chain agent_id (INTEGER UNIQUE), matching raids/trade_history/activity_feed.

ALTER TABLE agents ADD COLUMN IF NOT EXISTS xp_total integer NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS xp_level integer NOT NULL DEFAULT 1;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS xp_on_chain integer NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS xp_daily integer NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS xp_daily_date date;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_heartbeat_date date;

CREATE INDEX IF NOT EXISTS idx_agents_xp_total ON agents(xp_total DESC);

-- XP audit log
CREATE TABLE IF NOT EXISTS xp_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    integer NOT NULL REFERENCES agents(agent_id),
  source      text NOT NULL,
  amount      integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_xp_log_agent ON xp_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_xp_log_created ON xp_log(created_at);

ALTER TABLE xp_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "xp_log_public_read" ON xp_log;
CREATE POLICY "xp_log_public_read" ON xp_log FOR SELECT USING (true);

-- grant_xp RPC
-- Engagement sources (150/day cap): heartbeat, dailies, reputation_given, inspect, trade.
-- Uncapped: raid_win, raid_loss, raid_defend, achievement, etc.
CREATE OR REPLACE FUNCTION grant_xp(
  p_agent_id integer,
  p_source   text,
  p_amount   integer
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_today      date := CURRENT_DATE;
  v_daily      integer;
  v_actual     integer;
  v_new_total  integer;
  v_new_level  integer;
BEGIN
  -- Reset daily counter on a new day
  UPDATE agents
  SET xp_daily = 0, xp_daily_date = v_today
  WHERE agent_id = p_agent_id AND (xp_daily_date IS NULL OR xp_daily_date < v_today);

  SELECT xp_daily INTO v_daily FROM agents WHERE agent_id = p_agent_id;

  IF NOT FOUND THEN
    RETURN json_build_object('granted', 0, 'reason', 'no_agent');
  END IF;

  -- Daily cap only for engagement sources
  IF p_source IN ('heartbeat', 'dailies', 'reputation_given', 'inspect', 'trade') THEN
    v_actual := LEAST(p_amount, GREATEST(0, 150 - COALESCE(v_daily, 0)));
  ELSE
    v_actual := p_amount;
  END IF;

  IF v_actual <= 0 THEN
    RETURN json_build_object('granted', 0, 'reason', 'daily_cap');
  END IF;

  UPDATE agents
  SET xp_total = xp_total + v_actual,
      xp_daily = COALESCE(xp_daily, 0) +
        CASE WHEN p_source IN ('heartbeat','dailies','reputation_given','inspect','trade')
        THEN v_actual ELSE 0 END,
      xp_daily_date = v_today
  WHERE agent_id = p_agent_id
  RETURNING xp_total INTO v_new_total;

  -- Level from XP (inverse of 25 * level^2.2)
  v_new_level := 1;
  WHILE v_new_total >= (25 * POWER(v_new_level + 1, 2.2))::integer LOOP
    v_new_level := v_new_level + 1;
  END LOOP;

  -- Level never drops
  UPDATE agents SET xp_level = GREATEST(xp_level, v_new_level)
  WHERE agent_id = p_agent_id;

  INSERT INTO xp_log (agent_id, source, amount)
  VALUES (p_agent_id, p_source, v_actual);

  RETURN json_build_object('granted', v_actual, 'new_total', v_new_total, 'new_level', v_new_level);
END;
$$;

-- Achievements catalog (static)
CREATE TABLE IF NOT EXISTS achievements (
  id              text PRIMARY KEY,
  category        text NOT NULL,
  name            text NOT NULL,
  description     text NOT NULL DEFAULT '',
  threshold       integer NOT NULL DEFAULT 0,
  tier            text NOT NULL,
  reward_type     text NOT NULL DEFAULT 'exclusive_badge',
  reward_item_id  text,
  sort_order      integer NOT NULL DEFAULT 0
);

ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "achievements_public_read" ON achievements;
CREATE POLICY "achievements_public_read" ON achievements FOR SELECT USING (true);

-- Per-agent achievement unlocks
CREATE TABLE IF NOT EXISTS agent_achievements (
  agent_id        integer NOT NULL REFERENCES agents(agent_id),
  achievement_id  text NOT NULL REFERENCES achievements(id),
  tier            text,
  unlocked_at     timestamptz NOT NULL DEFAULT now(),
  seen            boolean NOT NULL DEFAULT false,
  PRIMARY KEY (agent_id, achievement_id),
  UNIQUE (agent_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_achievements_agent ON agent_achievements(agent_id);

ALTER TABLE agent_achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent_achievements_public_read" ON agent_achievements;
CREATE POLICY "agent_achievements_public_read" ON agent_achievements FOR SELECT USING (true);

-- Seed the Sprawl achievement catalog (DeFi-remapped from git-city).
-- reward_item_id records the cosmetic an unlock maps to (see zones.ts ACHIEVEMENT_ITEMS).
-- reward_type stays 'exclusive_badge' because Sprawl has no items/purchases tables yet —
-- the cosmetic unlock is read from reward_item_id directly, no purchases row is written.
INSERT INTO achievements (id, category, name, description, threshold, tier, reward_type, reward_item_id, sort_order)
VALUES
  -- Trades
  ('first_trade',         'trades',          'First Trade',         'Make your first swap',                     1,     'bronze',  'exclusive_badge', 'flag',          1),
  ('high_volume',         'trades',          'High Volume',         'Reach 1,000 trades',                       1000,  'silver',  'exclusive_badge', 'custom_color',  2),
  ('grinder',             'trades',          'Grinder',             'Reach 2,500 trades',                       2500,  'gold',    'exclusive_badge', 'neon_trim',     3),
  -- Protocols
  ('multi_protocol',      'protocols',       'Multi-Protocol',      'Trade across 5 protocols',                 5,     'silver',  'exclusive_badge', 'antenna_array', 10),
  ('protocol_architect',  'protocols',       'Protocol Architect',  'Trade across 10 protocols',                10,    'gold',    'exclusive_badge', 'rooftop_garden',11),
  -- Reputation
  ('high_rep',            'reputation',      'High Rep',            'Reach 80 reputation',                      80,    'gold',    'exclusive_badge', 'spotlight',     20),
  ('top_reputation',      'reputation',      'Top Reputation',      'Reach 95 reputation',                      95,    'diamond', 'exclusive_badge', NULL,            21),
  -- Agents spawned
  ('city_founder',        'agents_spawned',  'City Founder',        'Spawn 5 agents',                           5,     'silver',  'exclusive_badge', 'helipad',       30),
  ('city_planner',        'agents_spawned',  'City Planner',        'Spawn 15 agents',                          15,    'gold',    'exclusive_badge', NULL,            31),
  -- Profit streak
  ('profit_3',            'profit_streak',   'On a Roll',           'Hold a 3-day profit streak',               3,     'bronze',  'exclusive_badge', NULL,            40),
  ('profit_7',            'profit_streak',   'Hot Hand',            'Hold a 7-day profit streak',               7,     'silver',  'exclusive_badge', NULL,            41),
  ('profit_30',           'profit_streak',   'Unstoppable',         'Hold a 30-day profit streak',              30,    'diamond', 'exclusive_badge', NULL,            42),
  -- Raids
  ('pickpocket',          'raid',            'Pickpocket',          'Earn 100 Raid XP',                         100,   'bronze',  'exclusive_badge', NULL,            50),
  ('burglar',             'raid',            'Burglar',             'Earn 500 Raid XP',                         500,   'silver',  'exclusive_badge', NULL,            51),
  ('heist_master',        'raid',            'Heist Master',        'Earn 2,000 Raid XP',                       2000,  'gold',    'exclusive_badge', NULL,            52),
  ('kingpin',             'raid',            'Kingpin',             'Earn 10,000 Raid XP',                      10000, 'diamond', 'exclusive_badge', NULL,            53)
ON CONFLICT (id) DO NOTHING;
