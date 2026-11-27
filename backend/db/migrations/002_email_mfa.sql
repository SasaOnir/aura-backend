-- 002 — verifica email, reset password, invito staff, MFA TOTP con codici di recupero.
-- Idempotente: si può eseguire più volte, anche su database già in uso.

ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_failed_count  INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_locked_until  TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_last_step     BIGINT;      -- ultimo intervallo TOTP accettato (anti-replay)

-- Token monouso inviati via email. Nel DB c'è solo lo SHA-256: un dump del database non permette di usarli.
CREATE TABLE IF NOT EXISTS email_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL CHECK (purpose IN ('verify_email','password_reset','staff_invite')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_tokens_user_purpose_idx ON email_tokens(user_id, purpose) WHERE used_at IS NULL;

-- Codici di recupero MFA: monouso, solo hash.
CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, code_hash)
);
