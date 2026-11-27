-- Schema AURA system: vote, battles, streaming connections, public profiles.
-- Esegue via node -e (legge DATABASE_URL da env). Idempotente con CREATE TABLE IF NOT EXISTS.

-- ============================================================================
-- BATTLES — sfide tra brani con tempistiche 24h / 3gg / 7gg
-- ============================================================================
CREATE TABLE IF NOT EXISTS battles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT,
  battle_type  TEXT NOT NULL DEFAULT 'tracks' CHECK (battle_type IN ('tracks','artists','genres')),
  duration     TEXT NOT NULL DEFAULT '24h' CHECK (duration IN ('24h','3d','7d')),
  status       TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','active','voting','closed','cancelled')),
  start_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_at       TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  winner_track_id UUID REFERENCES tracks(id) ON DELETE SET NULL,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS battles_status_idx ON battles(status);
CREATE INDEX IF NOT EXISTS battles_end_idx ON battles(end_at);

-- ============================================================================
-- AURA VOTES — un voto AURA per brano (1 per utente, oppure fingerprint guest)
-- ============================================================================
CREATE TABLE IF NOT EXISTS aura_votes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id        UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,      -- nullable: guest può votare
  battle_id       UUID REFERENCES battles(id) ON DELETE CASCADE,    -- nullable: voto fuori battle
  voter_fingerprint TEXT,                                            -- hash IP+UA per anti-frode guest
  aura_value      INTEGER NOT NULL DEFAULT 1 CHECK (aura_value IN (1, -1)),  -- +1 like, -1 dislike
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT one_voter CHECK (user_id IS NOT NULL OR voter_fingerprint IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS aura_votes_user_track_unique ON aura_votes(user_id, track_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS aura_votes_fp_track_unique ON aura_votes(voter_fingerprint, track_id) WHERE voter_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS aura_votes_track_idx ON aura_votes(track_id);
CREATE INDEX IF NOT EXISTS aura_votes_battle_idx ON aura_votes(battle_id) WHERE battle_id IS NOT NULL;

-- ============================================================================
-- BATTLE PARTICIPANTS — brani iscritti a una battle
-- ============================================================================
CREATE TABLE IF NOT EXISTS battle_participants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id   UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  track_id    UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (battle_id, track_id)
);
CREATE INDEX IF NOT EXISTS bp_battle_idx ON battle_participants(battle_id);
CREATE INDEX IF NOT EXISTS bp_track_idx ON battle_participants(track_id);

-- ============================================================================
-- STREAMING CONNECTIONS — config super admin per YouTube / Twitch / ecc.
-- ============================================================================
CREATE TABLE IF NOT EXISTS streaming_connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  platform      TEXT NOT NULL CHECK (platform IN ('youtube','twitch','spotify','soundcloud','custom')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','error','disconnected')),
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,                  -- channel_id, api_key ref, ecc.
  connected_playlist_id UUID REFERENCES playlists(id) ON DELETE SET NULL,
  last_sync_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- PUBLIC PROFILES — estensione di artists con slug pubblico + social
-- ============================================================================
ALTER TABLE artists ADD COLUMN IF NOT EXISTS public_slug TEXT UNIQUE;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS verified_badge BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS monthly_listeners INTEGER NOT NULL DEFAULT 0;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS total_plays INTEGER NOT NULL DEFAULT 0;

-- ============================================================================
-- COLLABORATIONS — match tra artisti (per futuri duetti/collab)
-- ============================================================================
CREATE TABLE IF NOT EXISTS collaborations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_a_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  artist_b_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','completed')),
  proposed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  track_id    UUID REFERENCES tracks(id) ON DELETE SET NULL,        -- se nasce un brano dalla collab
  message     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (artist_a_id <> artist_b_id)
);
CREATE INDEX IF NOT EXISTS collab_a_idx ON collaborations(artist_a_id);
CREATE INDEX IF NOT EXISTS collab_b_idx ON collaborations(artist_b_id);

SELECT 'AURA schema created OK' AS result;
