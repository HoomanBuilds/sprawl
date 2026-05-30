-- Raids table (adapted from git-city migration 015)
CREATE TABLE raids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attacker_id INTEGER REFERENCES agents(agent_id),
    defender_id INTEGER REFERENCES agents(agent_id),
    success BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_raids_attacker ON raids(attacker_id, created_at DESC);
CREATE INDEX idx_raids_defender ON raids(defender_id, created_at DESC);

-- Raid tags (visual graffiti on raided buildings, 3-day expiry)
CREATE TABLE raid_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raid_id UUID REFERENCES raids(id),
    building_agent_id INTEGER REFERENCES agents(agent_id),
    attacker_id INTEGER,
    attacker_name TEXT,
    tag_style TEXT DEFAULT 'neon',
    active BOOLEAN DEFAULT true,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_raid_tags_active ON raid_tags(building_agent_id) WHERE active = true;

-- RLS
ALTER TABLE raids ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read raids" ON raids FOR SELECT USING (true);

ALTER TABLE raid_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read raid_tags" ON raid_tags FOR SELECT USING (true);
