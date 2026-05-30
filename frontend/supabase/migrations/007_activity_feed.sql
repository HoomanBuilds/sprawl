-- frontend/supabase/migrations/007_activity_feed.sql
-- CANONICAL schema (matches master doc Appendix M, Phase 3, Phase 6)
CREATE TABLE activity_feed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    actor_id INTEGER,
    target_id INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feed_created ON activity_feed(created_at DESC);
CREATE INDEX idx_feed_actor ON activity_feed(actor_id, created_at DESC);
CREATE INDEX idx_feed_type ON activity_feed(event_type);
