-- Indexer block cursor persistence
CREATE TABLE indexer_state (
    key TEXT PRIMARY KEY,
    last_block INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial state for each contract listener
INSERT INTO indexer_state (key, last_block) VALUES ('cityState', 0);
INSERT INTO indexer_state (key, last_block) VALUES ('sprawlDex', 0);
INSERT INTO indexer_state (key, last_block) VALUES ('raidContract', 0);
