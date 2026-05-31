-- Ensure postgres_changes delivers for the tables the UI subscribes to
-- (activity_feed -> agent action bubbles + raids; agents -> live leaderboard).
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE activity_feed;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE agents;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
