-- frontend/supabase/migrations/041_raids.sql
-- NOTE: `raids` and `raid_tags` already exist (Phase 3's 011_raids_tables.sql).
-- Do NOT re-create them. This migration only adds optional score columns so the
-- on-chain RaidResult scores (parsed by the indexer + /api/raid/execute) can be persisted.

ALTER TABLE raids ADD COLUMN IF NOT EXISTS attack_score  BIGINT;
ALTER TABLE raids ADD COLUMN IF NOT EXISTS defense_score BIGINT;
ALTER TABLE raids ADD COLUMN IF NOT EXISTS spoils_xp     INTEGER DEFAULT 25;
ALTER TABLE raids ADD COLUMN IF NOT EXISTS tx_hash       TEXT;
