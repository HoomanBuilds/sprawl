-- frontend/supabase/migrations/042_dailies.sql
-- Adapted from inspiration/git-city/supabase/migrations/026_dailies.sql
-- Renamed: developer_id->agent_id, developers->agents. agent_id is the on-chain agent_id.

CREATE TABLE IF NOT EXISTS daily_mission_progress (
  id            uuid    NOT NULL DEFAULT gen_random_uuid(),
  agent_id      integer NOT NULL REFERENCES agents(agent_id),
  mission_date  date    NOT NULL DEFAULT current_date,
  mission_id    text    NOT NULL,
  progress      integer NOT NULL DEFAULT 0,
  target        integer NOT NULL DEFAULT 1,
  completed     boolean NOT NULL DEFAULT false,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, mission_date, mission_id),
  UNIQUE (agent_id, mission_date, mission_id)
);

CREATE INDEX IF NOT EXISTS idx_dmp_agent_date
  ON daily_mission_progress(agent_id, mission_date DESC);

ALTER TABLE daily_mission_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dmp_public_read" ON daily_mission_progress;
CREATE POLICY "dmp_public_read" ON daily_mission_progress FOR SELECT USING (true);

-- Dailies tracking columns on agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS dailies_completed integer DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS dailies_streak    integer DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_dailies_date date;

-- RPC: record mission progress (idempotent, race-safe, auto-completes at target).
CREATE OR REPLACE FUNCTION record_mission_progress(
  p_agent_id   integer,
  p_mission_id text,
  p_threshold  integer,
  p_increment  integer DEFAULT 1
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_today     date := current_date;
  v_progress  integer;
  v_completed boolean;
BEGIN
  INSERT INTO daily_mission_progress (agent_id, mission_date, mission_id, progress, target)
  VALUES (p_agent_id, v_today, p_mission_id, LEAST(p_increment, p_threshold), p_threshold)
  ON CONFLICT (agent_id, mission_date, mission_id)
  DO UPDATE SET progress = LEAST(daily_mission_progress.progress + p_increment, p_threshold)
  WHERE daily_mission_progress.completed = false;

  SELECT progress, completed INTO v_progress, v_completed
  FROM daily_mission_progress
  WHERE agent_id = p_agent_id
    AND mission_date = v_today
    AND mission_id = p_mission_id;

  IF v_progress >= p_threshold AND NOT v_completed THEN
    UPDATE daily_mission_progress
    SET completed = true, completed_at = now()
    WHERE agent_id = p_agent_id
      AND mission_date = v_today
      AND mission_id = p_mission_id;
    v_completed := true;
  END IF;

  RETURN jsonb_build_object(
    'progress', v_progress,
    'completed', v_completed,
    'threshold', p_threshold
  );
END;
$$;

-- RPC: complete all dailies (called when 3/3 missions done). Calculates streak.
CREATE OR REPLACE FUNCTION complete_all_dailies(p_agent_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_today      date := current_date;
  v_last_date  date;
  v_old_streak integer;
  v_total      integer;
  v_new_streak integer;
BEGIN
  SELECT last_dailies_date, dailies_streak, dailies_completed
  INTO v_last_date, v_old_streak, v_total
  FROM agents
  WHERE agent_id = p_agent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'no_agent');
  END IF;

  IF v_last_date = v_today THEN
    RETURN jsonb_build_object('already_completed', true, 'streak', v_old_streak, 'total', v_total);
  END IF;

  IF v_last_date = v_today - 1 THEN
    v_new_streak := COALESCE(v_old_streak, 0) + 1;
  ELSE
    v_new_streak := 1;
  END IF;

  v_total := COALESCE(v_total, 0) + 1;

  UPDATE agents
  SET dailies_completed = v_total,
      dailies_streak = v_new_streak,
      last_dailies_date = v_today,
      app_streak = v_new_streak
  WHERE agent_id = p_agent_id;

  -- Reward XP for completing all dailies (engagement-capped).
  PERFORM grant_xp(p_agent_id, 'dailies', 25);

  RETURN jsonb_build_object(
    'already_completed', false,
    'streak', v_new_streak,
    'total', v_total
  );
END;
$$;

-- Dailies achievements (4 tiers).
INSERT INTO achievements (id, category, name, description, threshold, tier, reward_type, reward_item_id, sort_order)
VALUES
  ('daily_rookie',  'dailies', 'Daily Rookie',  'Complete all dailies 7 times',   7,   'bronze',  'exclusive_badge', NULL, 60),
  ('daily_regular', 'dailies', 'Daily Regular', 'Complete all dailies 30 times',  30,  'silver',  'exclusive_badge', NULL, 61),
  ('daily_master',  'dailies', 'Daily Master',  'Complete all dailies 100 times', 100, 'gold',    'exclusive_badge', NULL, 62),
  ('daily_legend',  'dailies', 'Daily Legend',  'Complete all dailies 365 times', 365, 'diamond', 'exclusive_badge', NULL, 63)
ON CONFLICT (id) DO NOTHING;
