-- hap-voice schema. Applied by `npm run db:setup` (idempotent).
-- Everything lives in the default `public` schema of the hap_voice database.

CREATE TABLE IF NOT EXISTS calls (
  id              BIGSERIAL PRIMARY KEY,
  twilio_call_sid TEXT UNIQUE,
  stream_sid      TEXT,
  from_number     TEXT NOT NULL,
  to_number       TEXT,
  direction       TEXT NOT NULL DEFAULT 'inbound',
  status          TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | completed | rejected_blocked | failed
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  duration_seconds INTEGER,

  -- Extracted after the call by the LLM
  caller_name     TEXT,
  caller_company  TEXT,
  caller_email    TEXT,
  reason          TEXT,
  callback_number TEXT,
  message         TEXT,
  summary         TEXT,

  -- Spam scoring (0.0 = clearly legit, 1.0 = clearly spam)
  spam_score      REAL,
  spam_reason     TEXT,
  is_spam         BOOLEAN NOT NULL DEFAULT false,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calls_started_at_idx ON calls (started_at DESC);
CREATE INDEX IF NOT EXISTS calls_from_number_idx ON calls (from_number);

-- Migrations for existing databases (CREATE TABLE IF NOT EXISTS above won't add
-- new columns to an already-created table).
ALTER TABLE calls ADD COLUMN IF NOT EXISTS caller_email TEXT;

CREATE TABLE IF NOT EXISTS transcript_turns (
  id        BIGSERIAL PRIMARY KEY,
  call_id   BIGINT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  seq       INTEGER NOT NULL,
  role      TEXT NOT NULL,           -- 'caller' | 'assistant'
  text      TEXT NOT NULL,
  ts        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transcript_turns_call_idx ON transcript_turns (call_id, seq);

CREATE TABLE IF NOT EXISTS blocked_numbers (
  id         BIGSERIAL PRIMARY KEY,
  number     TEXT NOT NULL UNIQUE,   -- E.164, e.g. +14155551212
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id                 BIGSERIAL PRIMARY KEY,
  twilio_message_sid TEXT UNIQUE,
  direction          TEXT NOT NULL DEFAULT 'inbound', -- inbound | outbound
  from_number        TEXT NOT NULL,
  to_number          TEXT,
  body               TEXT NOT NULL DEFAULT '',
  num_media          INTEGER NOT NULL DEFAULT 0,
  media_urls         JSONB,
  -- A verification/OTP code detected in the body, surfaced in the dashboard.
  detected_code      TEXT,
  read_at            TIMESTAMPTZ,
  received_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_from_idx ON messages (from_number);
CREATE INDEX IF NOT EXISTS messages_received_idx ON messages (received_at DESC);

-- Editable, live-applied settings (voice, model, persona, etc.). Overrides the
-- .env defaults at runtime; changed from the dashboard Settings page. Secrets
-- (API keys, ports, hosts) intentionally stay in .env, not here.
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
