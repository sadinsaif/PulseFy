-- Migration 006: Referral system
-- A creator invites others with a ?ref=<username> link. When a referred user's
-- withdrawal is PAID, the referrer earns 5% (in cents). referred_by is set once
-- at signup. referral_earnings.withdrawal_id is UNIQUE so a payout is only ever
-- credited once. Run each statement ONE AT A TIME in the Neon SQL Editor
-- (Read-only OFF).

ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by text;

CREATE TABLE IF NOT EXISTS referral_earnings (
  id text PRIMARY KEY,
  referrer_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referee_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  withdrawal_id text NOT NULL UNIQUE,
  amount integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);
