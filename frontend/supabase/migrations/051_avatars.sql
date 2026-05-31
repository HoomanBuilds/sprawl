ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;
