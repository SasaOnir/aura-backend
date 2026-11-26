-- ============================================================================
-- AURA — Schema PostgreSQL iniziale (v1.0)
-- Generato dal Master PRD §7. Copre Fase 0–1 (Fondamenta + Aura Control) e
-- impalcatura le tabelle per Fase 2–7 (catalogo, streaming, distribuzione,
-- pagamenti, moderazione). Le tabelle "future" vengono create vuote con i
-- campi del PRD, pronte per le fasi successive.
--
-- Convenzioni:
--   - PK UUID v7-ready (gen_random_uuid() su PG13+)
--   - created_at/updated_at timestamptz DEFAULT now()
--   - ENUM via CHECK dove lo stato è un set chiuso noto a priori
--   - audit_logs: append-only (REVOKE UPDATE/DELETE da role 'aura_app' in prod)
--   - royalty_entries: append-only (stessa regola)
--   - Soft-delete: status enum, mai DELETE fisica (tranne GDPR art.17)
--
-- Eseguire una volta sola su un database vuoto:
--   psql "$DATABASE_URL" -f db/schema.sql
-- Per reset: psql -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
-- ============================================================================

-- ─── Estensioni ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";      -- email case-insensitive

-- ============================================================================
-- 7.1  IDENTITÀ E ORGANIZZAZIONI
-- ============================================================================

-- ── users ──────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT UNIQUE NOT NULL,
  password_hash   TEXT,                       -- bcrypt/argon2id; NULL se auth esterna
  auth_provider   TEXT,                        -- 'local' | 'google' | 'apple' | ...
  auth_provider_id TEXT,
  display_name    TEXT NOT NULL,
  account_type    TEXT NOT NULL CHECK (account_type IN ('listener','artist','label','staff')),
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','suspended','pending_verification','deleted')),
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret      TEXT,                        -- TOTP secret (encrypted a riposo)
  mfa_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX users_account_type_idx ON users(account_type);
CREATE INDEX users_status_idx ON users(status);

-- ── user_profiles ──────────────────────────────────────────────────────────
CREATE TABLE user_profiles (
  user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avatar_url       TEXT,
  biography        TEXT,
  country          TEXT,                        -- ISO 3166-1 alpha-2
  language         TEXT DEFAULT 'it',           -- ISO 639-1
  privacy_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── refresh_tokens (sessioni/JWT refresh — non nel PRD ma necessarie) ──────
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,             -- sha256 del refresh token
  user_agent  TEXT,
  ip          INET,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  replaced_by UUID REFERENCES refresh_tokens(id)
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens(user_id) WHERE revoked_at IS NULL;

-- ── roles ──────────────────────────────────────────────────────────────────
CREATE TABLE roles (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  TEXT UNIQUE NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('system','organization','artist')),
  description TEXT,
  is_protected BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE per 'super_admin' (non cancellabile)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── permissions ─────────────────────────────────────────────────────────────
CREATE TABLE permissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key  TEXT UNIQUE NOT NULL,         -- es. 'users.read','users.suspend','roles.create'
  description      TEXT,
  category         TEXT NOT NULL,               -- 'identity','catalog','distribution','finance','moderation','admin'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── role_permissions ───────────────────────────────────────────────────────
CREATE TABLE role_permissions (
  role_id       UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ── user_roles (assegnazione utente → ruolo, con scope org/artist opzionale) ─
CREATE TABLE user_roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  artist_id       UUID REFERENCES artists(id) ON DELETE CASCADE,
  granted_by      UUID REFERENCES users(id),
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ,
  reason          TEXT,
  CHECK (
    (organization_id IS NOT NULL AND artist_id IS NULL) OR
    (organization_id IS NULL AND artist_id IS NOT NULL) OR
    (organization_id IS NULL AND artist_id IS NULL)       -- ruolo di sistema
  )
);
CREATE INDEX user_roles_user_idx ON user_roles(user_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX user_roles_active_unique
  ON user_roles(user_id, role_id, COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(artist_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE revoked_at IS NULL;

-- ── organizations ───────────────────────────────────────────────────────────
CREATE TABLE organizations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  organization_type TEXT NOT NULL CHECK (organization_type IN ('label','publisher','collective')),
  owner_user_id    UUID REFERENCES users(id) ON DELETE RESTRICT,
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','suspended','dissolved')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX organizations_owner_idx ON organizations(owner_user_id);

-- ── organization_members ────────────────────────────────────────────────────
CREATE TABLE organization_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('invited','active','revoked')),
  invited_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX org_members_org_idx ON organization_members(organization_id);

-- ============================================================================
-- 7.2  ARTISTI E CATALOGO  (impalcatura Fase 2)
-- ============================================================================

CREATE TABLE artists (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  organization_id    UUID REFERENCES organizations(id) ON DELETE SET NULL,
  artist_name        TEXT NOT NULL,
  slug               TEXT UNIQUE NOT NULL,
  biography          TEXT,
  image_url          TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
                     CHECK (verification_status IN ('unverified','pending','verified','rejected')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX artists_owner_idx ON artists(owner_user_id);
CREATE INDEX artists_org_idx ON artists(organization_id);

CREATE TABLE artist_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id   UUID REFERENCES roles(id) ON DELETE SET NULL,
  UNIQUE (artist_id, user_id)
);

CREATE TABLE releases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id    UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  release_type TEXT NOT NULL CHECK (release_type IN ('single','ep','album')),
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','in_preparation','in_review','approved','published','suspended','withdrawn')),
  release_date DATE,
  upc          TEXT,
  label_id     UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX releases_artist_idx ON releases(artist_id);
CREATE INDEX releases_status_idx ON releases(status);

CREATE TABLE tracks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  version    TEXT,
  duration   INTEGER,                    -- secondi
  isrc       TEXT,
  explicit   BOOLEAN NOT NULL DEFAULT FALSE,
  status     TEXT NOT NULL DEFAULT 'draft'
             CHECK (status IN ('draft','in_review','approved','published','suspended','withdrawn')),
  position   SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tracks_release_idx ON tracks(release_id);

CREATE TABLE track_assets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id          UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  asset_type        TEXT NOT NULL CHECK (asset_type IN ('original','master','preview','waveform')),
  storage_key       TEXT NOT NULL,
  format            TEXT,
  checksum          TEXT,
  processing_status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (processing_status IN ('pending','processing','ready','failed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX track_assets_track_idx ON track_assets(track_id);

CREATE TABLE credits (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id         UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  contributor_name TEXT NOT NULL,
  contributor_role  TEXT NOT NULL,       -- 'author','composer','producer','performer'...
  contributor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  percentage       NUMERIC(5,2) CHECK (percentage >= 0 AND percentage <= 100),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX credits_track_idx ON credits(track_id);

CREATE TABLE genres (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT UNIQUE NOT NULL,
  parent_id UUID REFERENCES genres(id) ON DELETE SET NULL
);

CREATE TABLE track_genres (
  track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
  genre_id UUID REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (track_id, genre_id)
);

-- ============================================================================
-- 7.3  PROVENIENZA E DIRITTI  (impalcatura Fase 2)
-- ============================================================================

CREATE TABLE creative_chains (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id    UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL DEFAULT 1,
  visibility   TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  declared_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (track_id, version)
);

CREATE TABLE creative_chain_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_chain_id UUID NOT NULL REFERENCES creative_chains(id) ON DELETE CASCADE,
  entry_type       TEXT NOT NULL CHECK (entry_type IN ('input','tool','model','human','sample','reference')),
  description      TEXT NOT NULL,
  tool_name        TEXT,
  model_name       TEXT,
  model_version    TEXT,
  input_reference  TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE rights_declarations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id           UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  rights_type        TEXT NOT NULL CHECK (rights_type IN ('recording','composition','performance','sample')),
  declarant_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  declaration_status TEXT NOT NULL DEFAULT 'pending'
                     CHECK (declaration_status IN ('pending','verified','rejected')),
  declared_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rights_documents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rights_declaration_id UUID NOT NULL REFERENCES rights_declarations(id) ON DELETE CASCADE,
  document_storage_key  TEXT NOT NULL,
  document_type         TEXT,
  verification_status   TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected'))
);

CREATE TABLE rights_claims (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id    UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  claimant_id UUID REFERENCES users(id) ON DELETE SET NULL,
  claim_type  TEXT NOT NULL CHECK (claim_type IN ('copyright','plagiarism','sample_rights','ai_misuse')),
  description TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','resolved','rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 7.4  STREAMING  (impalcatura Fase 3)
-- ============================================================================

CREATE TABLE playlists (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  visibility    TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public','collaborative')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE playlist_tracks (
  playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id    UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (playlist_id, track_id)
);

CREATE TABLE follows (
  follower_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artist_id        UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_user_id, artist_id)
);
CREATE INDEX follows_artist_idx ON follows(artist_id);

CREATE TABLE listening_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID REFERENCES users(id) ON DELETE SET NULL,   -- nullable: guest
  track_id           UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  started_at         TIMESTAMPTZ NOT NULL,
  ended_at           TIMESTAMPTZ,
  qualified_duration INTEGER,                       -- secondi validi per royalty
  source             TEXT,                           -- 'web','ios','android','embed'
  event_type         TEXT CHECK (event_type IN ('play','complete','skip')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX listening_events_track_idx ON listening_events(track_id);
CREATE INDEX listening_events_user_idx ON listening_events(user_id) WHERE user_id IS NOT NULL;
-- Anti-duplicati: (user_id NULL, track_id, started_at) uniques in finestra 1s gestito a livello app.

CREATE TABLE playback_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ NOT NULL,
  ended_at    TIMESTAMPTZ,
  device_type TEXT
);

-- ============================================================================
-- 7.5  DISTRIBUZIONE  (impalcatura Fase 5)
-- ============================================================================

CREATE TABLE distribution_partners (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT UNIQUE NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','terminated')),
  integration_type       TEXT NOT NULL CHECK (integration_type IN ('api','manual','white_label')),
  configuration_reference TEXT                          -- ref a secret manager / config
);

CREATE TABLE distribution_releases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id        UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  partner_id        UUID NOT NULL REFERENCES distribution_partners(id) ON DELETE RESTRICT,
  external_reference TEXT,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','ready_for_review','in_aura_check','awaiting_auth','approved','sent','received','delivering','published','rejected','change_requested','takedown_requested','withdrawn','error')),
  submitted_at      TIMESTAMPTZ,
  last_update_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX dist_releases_status_idx ON distribution_releases(status);

CREATE TABLE distribution_destinations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_release_id UUID NOT NULL REFERENCES distribution_releases(id) ON DELETE CASCADE,
  destination_name      TEXT NOT NULL,         -- 'spotify','apple_music',...
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivering','live','rejected','removed')),
  external_reference   TEXT
);

CREATE TABLE distribution_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_release_id UUID NOT NULL REFERENCES distribution_releases(id) ON DELETE CASCADE,
  event_type            TEXT NOT NULL,
  payload_reference     TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE distribution_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id        UUID NOT NULL REFERENCES distribution_partners(id) ON DELETE CASCADE,
  reporting_period  TEXT NOT NULL,             -- '2026-11'
  file_reference    TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending','importing','imported','failed'))
);

-- ============================================================================
-- 7.6  PAGAMENTI E ROYALTY  (impalcatura Fase 4)
-- ============================================================================

CREATE TABLE subscription_plans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT UNIQUE NOT NULL,       -- 'free','pro','premium'
  price          NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'EUR',
  billing_period TEXT NOT NULL CHECK (billing_period IN ('month','year')),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  features       JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE subscriptions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id            UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  provider_reference TEXT,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','canceled','past_due','suspended')),
  started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at           TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ
);
CREATE INDEX subscriptions_user_idx ON subscriptions(user_id);

CREATE TABLE transactions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount             NUMERIC(12,2) NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'EUR',
  transaction_type   TEXT NOT NULL CHECK (transaction_type IN ('subscription','distribution','service','refund','adjustment')),
  provider_reference TEXT,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','refunded')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX transactions_user_idx ON transactions(user_id);
CREATE INDEX transactions_status_idx ON transactions(status);

-- Royalty: append-only (nessun UPDATE/DELETE a livello app; rettifiche = nuove righe)
CREATE TABLE royalty_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_type TEXT NOT NULL CHECK (beneficiary_type IN ('user','organization')),
  beneficiary_id   UUID NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'EUR',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (beneficiary_type, beneficiary_id, currency)
);

CREATE TABLE royalty_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES royalty_accounts(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL CHECK (source_type IN ('streaming','distribution','sale','adjustment','refund')),
  source_id   UUID,
  debit       NUMERIC(12,2) NOT NULL DEFAULT 0,    -- es. commissioni
  credit      NUMERIC(12,2) NOT NULL DEFAULT 0,    -- importo maturato
  currency    TEXT NOT NULL DEFAULT 'EUR',
  status      TEXT NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued','available','paid','contested','reconciling')),
  period      TEXT NOT NULL,                        -- '2026-11'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX royalty_entries_account_idx ON royalty_entries(account_id);
CREATE INDEX royalty_entries_period_idx ON royalty_entries(period);
-- NOTE: righe immutabili dopo INSERT. Rettifiche = nuove righe con source_type='adjustment'.

CREATE TABLE split_agreements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id    UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL DEFAULT 1,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','terminated')),
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (track_id, version)
);

CREATE TABLE split_participants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  split_agreement_id  UUID NOT NULL REFERENCES split_agreements(id) ON DELETE CASCADE,
  beneficiary_id      UUID NOT NULL,         -- user o org
  beneficiary_type    TEXT NOT NULL CHECK (beneficiary_type IN ('user','organization')),
  percentage          NUMERIC(5,2) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  UNIQUE (split_agreement_id, beneficiary_id, beneficiary_type)
);

CREATE TABLE payouts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_type   TEXT NOT NULL CHECK (beneficiary_type IN ('user','organization')),
  beneficiary_id     UUID NOT NULL,
  amount             NUMERIC(12,2) NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'EUR',
  provider_reference TEXT,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','succeeded','failed','reversed')),
  paid_at            TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 7.7  MODERAZIONE E ASSISTENZA  (impalcatura Fase 6)
-- ============================================================================

CREATE TABLE reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('track','release','artist','user','comment')),
  target_id   UUID NOT NULL,
  reason      TEXT NOT NULL,
  description  TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','resolved','rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reports_target_idx ON reports(target_type, target_id);
CREATE INDEX reports_status_idx ON reports(status);

CREATE TABLE moderation_cases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   UUID REFERENCES reports(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  decision    TEXT,
  rationale   TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','decided','appealed','closed')),
  closed_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE moderation_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      UUID NOT NULL REFERENCES moderation_cases(id) ON DELETE CASCADE,
  action_type  TEXT NOT NULL,            -- 'takedown','warn','restore','escalate'
  operator_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE support_tickets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category   TEXT,
  subject    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending_user','resolved','closed')),
  priority   TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tickets_user_idx ON support_tickets(user_id);

CREATE TABLE support_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 7.8  AMMINISTRAZIONE
-- ============================================================================

-- admin_accounts: link utenti che sono staff amministrativi
CREATE TABLE admin_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
  mfa_required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- audit_logs: APPEND-ONLY. Il PRD richiede protezione contro alterazioni/cancellazioni.
-- A livello DB: REVOKE UPDATE, DELETE da role applicativo; vedi 01_setup_roles.sql.
CREATE TABLE audit_logs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id                UUID REFERENCES users(id) ON DELETE SET NULL,
  action                  TEXT NOT NULL,            -- 'user.suspend','role.grant','track.publish'...
  resource_type           TEXT NOT NULL,            -- 'user','track','release','role',...
  resource_id             UUID,
  previous_value_reference TEXT,                    -- JSON pointer o storage_key
  new_value_reference     TEXT,
  reason                  TEXT,
  result                  TEXT NOT NULL DEFAULT 'success' CHECK (result IN ('success','failure','denied')),
  ip                      INET,
  user_agent              TEXT,
  session_id             UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_actor_idx ON audit_logs(actor_id);
CREATE INDEX audit_logs_resource_idx ON audit_logs(resource_type, resource_id);
CREATE INDEX audit_logs_action_idx ON audit_logs(action);
CREATE INDEX audit_logs_created_idx ON audit_logs(created_at DESC);

CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_unread_idx ON notifications(user_id) WHERE read_at IS NULL;

CREATE TABLE system_settings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key   TEXT UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  updated_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- TRIGGER: updated_at automatico
-- ============================================================================
CREATE OR REPLACE FUNCTION aura_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_touch BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION aura_touch_updated_at();
CREATE TRIGGER organizations_touch BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION aura_touch_updated_at();
CREATE TRIGGER artists_touch BEFORE UPDATE ON artists
  FOR EACH ROW EXECUTE FUNCTION aura_touch_updated_at();
CREATE TRIGGER releases_touch BEFORE UPDATE ON releases
  FOR EACH ROW EXECUTE FUNCTION aura_touch_updated_at();
CREATE TRIGGER playlists_touch BEFORE UPDATE ON playlists
  FOR EACH ROW EXECUTE FUNCTION aura_touch_updated_at();
CREATE TRIGGER subscriptions_touch BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION aura_touch_updated_at();
CREATE TRIGGER tickets_touch BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION aura_touch_updated_at();
CREATE TRIGGER system_settings_touch BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION aura_touch_updated_at();
CREATE TRIGGER user_profiles_touch BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION aura_touch_updated_at();

-- ============================================================================
-- SEED: permessi, ruoli, matrice RBAC (PRD §5)
-- ============================================================================
INSERT INTO permissions (permission_key, description, category) VALUES
  -- Identity
  ('users.read',          'Cercare e consultare profili utenti',          'identity'),
  ('users.verify',        'Verificare account',                            'identity'),
  ('users.suspend',       'Sospendere/riattivare account',                'identity'),
  ('users.delete',        'Cancellare account (GDPR art.17)',              'identity'),
  ('users.export',        'Esportare dati utente (GDPR art.20)',            'identity'),
  ('users.privacy',       'Gestire richieste privacy',                     'identity'),
  -- Roles & permissions
  ('roles.read',          'Consultare ruoli e permessi',                   'admin'),
  ('roles.create',        'Creare ruoli (non proprietario)',               'admin'),
  ('roles.update',        'Modificare permessi di un ruolo',                'admin'),
  ('roles.delete',        'Cancellare ruoli non protetti',                 'admin'),
  ('staff.invite',        'Invitare collaboratori',                        'admin'),
  ('staff.revoke',        'Revocare accessi collaboratori',                'admin'),
  ('staff.require_mfa',   'Imporre MFA a un collaboratore',                'admin'),
  -- Catalog
  ('catalog.read',        'Consultare catalogo',                           'catalog'),
  ('catalog.publish',     'Approvare/rifiutare pubblicazioni',             'catalog'),
  ('catalog.takedown',    'Takedown contenuti',                             'catalog'),
  ('artists.verify',      'Verificare profili artisti',                    'catalog'),
  -- Moderation
  ('reports.read',        'Consultare segnalazioni',                      'moderation'),
  ('reports.assign',      'Assegnare casi di moderazione',                 'moderation'),
  ('reports.decide',      'Decidere su segnalazioni',                     'moderation'),
  ('reports.appeal',      'Gestire ricorsi',                               'moderation'),
  -- Distribution
  ('distribution.read',   'Consultare distribuzioni',                      'distribution'),
  ('distribution.send',   'Inviare release al partner',                   'distribution'),
  ('distribution.takedown','Richiedere takedown distribuzione',            'distribution'),
  ('distribution.reports','Importare e riconciliare report',               'distribution'),
  -- Finance
  ('finance.read',        'Consultare transazioni e ledger',              'finance'),
  ('finance.payouts',     'Autorizzare payout',                            'finance'),
  ('finance.refunds',     'Autorizzare rimborsi',                          'finance'),
  ('finance.adjustments', 'Inserire rettifiche contabili',                 'finance'),
  ('finance.plans',       'Configurare piani e prezzi',                    'finance'),
  -- Marketing
  ('marketing.playlists', 'Gestire playlist editoriali',                  'admin'),
  ('marketing.campaigns', 'Gestire campagne e banner',                     'admin'),
  -- Analytics
  ('analytics.read',      'Consultare statistiche e report',              'admin'),
  ('analytics.global',    'Consultare KPI globali piattaforma',            'admin'),
  -- Audit & config
  ('audit.read',          'Consultare registro attività',                  'admin'),
  ('settings.read',       'Consultare configurazione globale',            'admin'),
  ('settings.update',     'Modificare configurazione globale',            'admin'),
  ('partners.manage',     'Configurare partner commerciali',              'admin')
ON CONFLICT (permission_key) DO NOTHING;

-- Ruoli (PRD §5)
INSERT INTO roles (name, scope, description, is_protected) VALUES
  ('super_admin',           'system', 'Proprietario. Controllo completo della piattaforma.', TRUE),
  ('admin_operativo',       'system', 'Gestione generale autorizzata dal Super Admin.',     FALSE),
  ('moderatore',            'system', 'Contenuti e segnalazioni.',                           FALSE),
  ('supporto',              'system', 'Ticket e assistenza utenti/artisti.',                 FALSE),
  ('responsabile_artisti',  'system', 'Profili e pubblicazioni artisti.',                   FALSE),
  ('responsabile_distribuzione','system','Release e partner di distribuzione.',            FALSE),
  ('finance',               'system', 'Contabilità, commissioni, report.',                   FALSE),
  ('marketing',             'system', 'Campagne e contenuti editoriali.',                  FALSE),
  ('analista',              'system', 'Report in sola lettura.',                             FALSE),
  ('auditor',               'system', 'Registri e verifiche.',                               FALSE)
ON CONFLICT (name) DO NOTHING;

-- Matrice RBAC: role_permissions
-- super_admin = tutti i permessi
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

-- admin_operativo: identity + roles (no finance.delete) + catalog + staff
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin_operativo' AND p.permission_key IN (
  'users.read','users.verify','users.suspend','users.export','users.privacy',
  'roles.read','roles.create','roles.update',
  'staff.invite','staff.revoke','staff.require_mfa',
  'catalog.read','catalog.publish','artists.verify',
  'settings.read'
) ON CONFLICT DO NOTHING;

-- moderatore: moderation + catalog takedown + reports
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'moderatore' AND p.permission_key IN (
  'catalog.read','catalog.takedown','artists.verify',
  'reports.read','reports.assign','reports.decide','reports.appeal'
) ON CONFLICT DO NOTHING;

-- supporto: support tickets + users.read
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'supporto' AND p.permission_key IN (
  'users.read','reports.read'
) ON CONFLICT DO NOTHING;

-- responsabile_artisti: artist verify + catalog
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'responsabile_artisti' AND p.permission_key IN (
  'catalog.read','catalog.publish','artists.verify','users.read'
) ON CONFLICT DO NOTHING;

-- responsabile_distribuzione: distribution.*
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'responsabile_distribuzione' AND p.permission_key IN (
  'distribution.read','distribution.send','distribution.takedown','distribution.reports',
  'catalog.read','users.read'
) ON CONFLICT DO NOTHING;

-- finance: finance.*
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'finance' AND p.permission_key IN (
  'finance.read','finance.payouts','finance.refunds','finance.adjustments','finance.plans',
  'users.read','analytics.read'
) ON CONFLICT DO NOTHING;

-- marketing
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'marketing' AND p.permission_key IN (
  'marketing.playlists','marketing.campaigns','catalog.read','analytics.read'
) ON CONFLICT DO NOTHING;

-- analista: read-only analytics + audit
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'analista' AND p.permission_key IN (
  'analytics.read','analytics.global','audit.read','catalog.read','users.read'
) ON CONFLICT DO NOTHING;

-- auditor: audit + finance.read (read-only)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'auditor' AND p.permission_key IN (
  'audit.read','finance.read','analytics.read','settings.read','users.read'
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- SEED: piani abbonamento (placeholder; prezzi in §19 decisioni aperte)
-- ============================================================================
INSERT INTO subscription_plans (name, price, currency, billing_period, features) VALUES
  ('free',    0.00, 'EUR', 'month', '{"upload_limit_mb":500,"max_releases":5}'::jsonb),
  ('pro',     9.90, 'EUR', 'month', '{"upload_limit_mb":2048,"max_releases":null}'::jsonb),
  ('premium', 19.90,'EUR', 'month', '{"upload_limit_mb":10240,"max_releases":null,"distribution":true}'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- BOOTSTRAP SUPER ADMIN
-- ============================================================================
-- Il Super Admin iniziale NON viene creato via SQL con password in chiaro.
-- Il bootstrap si fa una volta sola all'avvio del backend (vedere
-- backend/src/bootstrap/super-admin.bootstrap.ts), che legge queste env:
--   AURA_SUPERADMIN_EMAIL, AURA_SUPERADMIN_PASSWORD, AURA_SUPERADMIN_NAME
-- fa hash della password (argon2id), inserisce l'utente + admin_accounts +
-- user_roles(super_admin), e logga l'evento in audit_logs.
-- Se le env non sono impostate, il bootstrap viene saltato (modalità dev).
-- ============================================================================

-- ============================================================================
-- ROLE DB per immutabilità audit_logs / royalty_entries
-- ============================================================================
-- In produzione, dopo il deploy, eseguire (NON incluso nello schema base):
--   REVOKE UPDATE, DELETE ON audit_logs FROM aura_app;
--   REVOKE UPDATE, DELETE ON royalty_entries FROM aura_app;
-- Così l'app non può alterare le righe nemmeno se compromessa; le rettifiche
-- passano per INSERT di nuove righe (vedi commenti sulle tabelle).
-- ============================================================================
