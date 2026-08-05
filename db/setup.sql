-- Srijon — database setup
-- Run this ONCE in the Vercel Postgres "Query" tab to create all tables.
-- (This is an alternative to `npm run db:push` for when Node.js is not
--  installed locally.) Safe to re-run: every statement uses IF NOT EXISTS.

-- Users — email + password auth. email_verified stays NULL until verified.
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  name           TEXT,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT,
  email_verified TIMESTAMP,
  image          TEXT,
  company        TEXT,
  created_at     TIMESTAMP NOT NULL DEFAULT now()
);

-- Auth.js sessions (used by the Drizzle adapter).
CREATE TABLE IF NOT EXISTS sessions (
  session_token TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires       TIMESTAMP NOT NULL
);

-- Auth.js accounts (OAuth providers — kept for future use).
CREATE TABLE IF NOT EXISTS accounts (
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                TEXT NOT NULL,
  provider            TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token       TEXT,
  access_token        TEXT,
  expires_at          SERIAL,
  token_type          TEXT,
  scope               TEXT,
  id_token            TEXT,
  session_state       TEXT,
  PRIMARY KEY (provider, provider_account_id)
);

-- Submissions — a creator's entry into a challenge.
CREATE TABLE IF NOT EXISTS submissions (
  id           TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL,
  post_url     TEXT NOT NULL,
  caption      TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMP NOT NULL DEFAULT now()
);

-- Tokens for email verification AND password reset.
CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,
  token      TEXT NOT NULL,
  purpose    TEXT NOT NULL DEFAULT 'verify',
  expires    TIMESTAMP NOT NULL,
  PRIMARY KEY (identifier, token)
);
